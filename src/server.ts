"use strict";
// mcp-brevo — multi-tenant remote MCP server for Brevo with self-hosted
// OAuth 2.1. Each tenant (Brevo account) is reachable at /:tenant and backed
// by its own encrypted API key. Entry point for the web deployment.

import "./types.js"; // express-session augmentation
import { config } from "./config.js";

import express from "express";
import session from "express-session";
import helmet from "helmet";
import bcrypt from "bcrypt";

import { initDb, cleanupExpired, getUserByUsername, createUser, getTenantByName, touchTenant } from "./db.js";
import { decrypt } from "./crypto.js";
import { mountOAuth, getBearerUserId } from "./oauth.js";
import { mountAdmin } from "./admin.js";
import { homeFor } from "./routing.js";
import { handleTenantMcp } from "./mcp-http.js";

const BASE_URL = config.baseUrl;
const isHttps = BASE_URL.startsWith("https://");

// ------------------------------------------------------------------
// Database
// ------------------------------------------------------------------

initDb();
cleanupExpired();
setInterval(cleanupExpired, 60 * 60 * 1000).unref();

async function seedAdmin(): Promise<void> {
  if (getUserByUsername(config.adminUsername)) return;
  if (!config.adminPassword) {
    console.warn(
      `[seed] admin user '${config.adminUsername}' missing and ADMIN_PASSWORD not set — ` +
        `set it in .env and restart to create the admin.`
    );
    return;
  }
  const hash = await bcrypt.hash(config.adminPassword, 12);
  createUser({
    username: config.adminUsername,
    email: config.adminEmail,
    firstname: "Admin",
    lastname: "",
    password_hash: hash,
    role: "admin",
  });
  console.log(`[seed] created admin user '${config.adminUsername}'`);
}

// ------------------------------------------------------------------
// App
// ------------------------------------------------------------------

const app = express();
app.disable("x-powered-by");
app.set("trust proxy", 1);

// Minimal request log — never logs tokens or bodies.
app.use((req, _res, next) => {
  const ip = (req.headers["x-real-ip"] as string) || req.ip;
  console.log(`[req] ${req.method} ${req.path} | ip=${ip}`);
  next();
});

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'", "'unsafe-inline'"],
        scriptSrcAttr: ["'unsafe-inline'"],
        formAction: ["'self'", "https:"],
      },
    },
  })
);

app.use(
  session({
    secret: config.sessionSecret,
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: { secure: isHttps, httpOnly: true, sameSite: "lax", maxAge: 24 * 60 * 60 * 1000 },
  })
);

// OAuth (discovery, DCR, authorize, login, token) + admin dashboard.
mountOAuth(app);
mountAdmin(app);

app.get("/health", (_req, res) => res.json({ status: "ok", timestamp: new Date().toISOString() }));
app.get("/", (req, res) => res.redirect(req.session.userId ? homeFor(req.session.userRole) : "/login"));

// ------------------------------------------------------------------
// Tenant MCP endpoint — MUST be registered last (single-segment wildcard).
// ------------------------------------------------------------------

function mcpCors(req: express.Request, res: express.Response, next: express.NextFunction): void {
  res.set("Access-Control-Allow-Origin", (req.headers.origin as string) || "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS, DELETE");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept, Mcp-Session-Id, Last-Event-ID");
  res.set("Access-Control-Expose-Headers", "WWW-Authenticate, Mcp-Session-Id");
  res.set("Access-Control-Max-Age", "86400");
  res.set("Cross-Origin-Resource-Policy", "cross-origin");
  if (req.method === "OPTIONS") {
    res.status(204).end();
    return;
  }
  next();
}

const jsonBody = express.json({ limit: "4mb" });

app.all("/:tenant", mcpCors, jsonBody, async (req, res) => {
  const tenantName = req.params.tenant;
  const tenant = getTenantByName(tenantName);
  const resourceMetaUrl = `${BASE_URL}/.well-known/oauth-protected-resource/${tenantName}`;

  if (!tenant) {
    res.status(404).json({ error: "Tenant not found" });
    return;
  }

  const userId = getBearerUserId(req);
  if (userId === null || userId !== tenant.owner_user_id) {
    res
      .status(401)
      .set("WWW-Authenticate", `Bearer resource_metadata="${resourceMetaUrl}"`)
      .json({ error: "Missing or invalid access token" });
    return;
  }

  let apiKey: string;
  try {
    apiKey = decrypt(tenant.brevo_key_enc);
  } catch {
    res.status(500).json({ error: "Tenant key could not be decrypted" });
    return;
  }

  touchTenant(tenant.id);
  await handleTenantMcp(req, res, apiKey, tenantName);
});

// ------------------------------------------------------------------
// Start
// ------------------------------------------------------------------

seedAdmin()
  .then(() => {
    app.listen(config.port, "127.0.0.1", () => {
      console.log(`[mcp-brevo] listening on 127.0.0.1:${config.port}`);
      console.log(`[mcp-brevo] base URL: ${BASE_URL}`);
    });
  })
  .catch((err) => {
    console.error("[mcp-brevo] startup error:", err);
    process.exit(1);
  });
