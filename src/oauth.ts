"use strict";
// OAuth 2.1 (authorization code + PKCE-S256 + refresh tokens) with Dynamic
// Client Registration. Ported from mcp-auth-proxy/server.js and adapted to
// single-segment tenant resources (/:tenant). The server is both the
// Authorization Server and the Resource Server.

import type { Express, Request, Response } from "express";
import express from "express";
import rateLimit from "express-rate-limit";
import bcrypt from "bcrypt";
import { nanoid } from "nanoid";
import crypto from "node:crypto";

import { config } from "./config.js";
import { safeNext } from "./routing.js";
import { renderLogin, renderAuthorize } from "./views.js";
import {
  getUserByUsername,
  getTenantByName,
  insertAuthCode,
  getAuthCode,
  markAuthCodeUsed,
  insertAccessToken,
  getAccessToken,
  insertRefreshToken,
  getRefreshToken,
  markRefreshTokenUsed,
} from "./db.js";

const BASE_URL = config.baseUrl;

const ACCESS_TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 h
const REFRESH_TOKEN_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 d

const oauthLimiter = rateLimit({ windowMs: 60_000, max: 20, standardHeaders: true, legacyHeaders: false });
const urlParser = express.urlencoded({ extended: false });
const jsonParser = express.json();

// ------------------------------------------------------------------
// Token issuance + validation
// ------------------------------------------------------------------

interface TokenPair {
  access_token: string;
  token_type: "Bearer";
  expires_in: number;
  refresh_token: string;
}

function issueTokenPair(userId: number, clientId: string | null): TokenPair {
  const now = Date.now();
  const accessToken = nanoid(64);
  const refreshToken = nanoid(64);
  insertAccessToken(accessToken, now + ACCESS_TOKEN_TTL_MS, userId);
  insertRefreshToken(refreshToken, userId, clientId, now + REFRESH_TOKEN_TTL_MS);
  return {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: Math.floor(ACCESS_TOKEN_TTL_MS / 1000),
    refresh_token: refreshToken,
  };
}

/** Return the user_id for a valid, unexpired Bearer access token, else null. */
export function getBearerUserId(req: Request): number | null {
  const auth = req.headers["authorization"] || "";
  if (!auth.startsWith("Bearer ")) return null;
  const row = getAccessToken(auth.slice(7));
  if (!row || row.expires_at < Date.now()) return null;
  return row.user_id;
}

// ------------------------------------------------------------------
// Routes
// ------------------------------------------------------------------

export function mountOAuth(app: Express): void {
  // ---- CORS preflight for discovery + oauth endpoints ----
  app.options("/.well-known/*", (req, res) => {
    res.set("Access-Control-Allow-Origin", (req.headers.origin as string) || "*");
    res.set("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Accept, Content-Type");
    res.set("Access-Control-Max-Age", "86400");
    res.status(204).end();
  });
  app.options("/oauth/:any", (req, res) => {
    res.set("Access-Control-Allow-Origin", (req.headers.origin as string) || "*");
    res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type, Accept");
    res.set("Access-Control-Max-Age", "86400");
    res.status(204).end();
  });

  // ---- Discovery: Authorization Server Metadata (RFC 8414) ----
  app.get("/.well-known/oauth-authorization-server", (_req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    res.json({
      issuer: BASE_URL,
      authorization_endpoint: `${BASE_URL}/oauth/authorize`,
      token_endpoint: `${BASE_URL}/oauth/token`,
      registration_endpoint: `${BASE_URL}/oauth/register`,
      response_types_supported: ["code"],
      grant_types_supported: ["authorization_code", "refresh_token"],
      code_challenge_methods_supported: ["S256"],
      token_endpoint_auth_methods_supported: ["none"],
      scopes_supported: [],
    });
  });

  // ---- Discovery: Protected Resource Metadata (RFC 9728), per tenant ----
  app.get("/.well-known/oauth-protected-resource*", (req, res) => {
    res.set("Access-Control-Allow-Origin", "*");
    const suffix = req.path.replace("/.well-known/oauth-protected-resource", "");
    const resource = suffix ? `${BASE_URL}${suffix}` : BASE_URL;
    res.json({
      resource,
      authorization_servers: [BASE_URL],
      bearer_methods_supported: ["header"],
      scopes_supported: [],
    });
  });

  // ---- Dynamic Client Registration (RFC 7591) ----
  app.post("/oauth/register", jsonParser, (req, res) => {
    res.set("Access-Control-Allow-Origin", (req.headers.origin as string) || "*");
    const body = req.body || {};
    const redirectUris: string[] = body.redirect_uris || [];
    const clientId = redirectUris.length
      ? Buffer.from(redirectUris[0]).toString("base64url").slice(0, 32)
      : nanoid(32);
    res.status(201).json({
      client_id: clientId,
      client_id_issued_at: Math.floor(Date.now() / 1000),
      redirect_uris: redirectUris,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      token_endpoint_auth_method: "none",
      code_challenge_method: "S256",
    });
  });

  // ---- Authorize (GET): capture request, show login or consent ----
  app.get("/oauth/authorize", oauthLimiter, (req, res) => {
    res.set("Cross-Origin-Opener-Policy", "unsafe-none");
    if (req.query.response_type) {
      if (req.query.response_type !== "code") return res.status(400).send("Unsupported response_type");
      if (!req.query.code_challenge || req.query.code_challenge_method !== "S256") {
        return res.status(400).send("PKCE with S256 is required");
      }
      let resourceTenant: string | null = null;
      if (typeof req.query.resource === "string") {
        const rel = req.query.resource.replace(BASE_URL, "");
        const parts = rel.split("/").filter(Boolean);
        if (parts.length >= 1) resourceTenant = parts[0];
      }
      req.session.oauth = {
        client_id: String(req.query.client_id || ""),
        redirect_uri: String(req.query.redirect_uri || ""),
        state: String(req.query.state || ""),
        code_challenge: String(req.query.code_challenge),
        resourceTenant,
      };
    }
    if (!req.session.oauth) {
      return res.status(400).send("No active OAuth session. Please restart the authorization flow.");
    }
    if (!req.session.user) return res.send(renderLogin());
    const tenant = req.session.oauth.resourceTenant
      ? getTenantByName(req.session.oauth.resourceTenant)
      : undefined;
    res.send(renderAuthorize(tenant ? tenant.label || tenant.name : null));
  });

  // ---- Login (shared by OAuth popup + direct dashboard login) ----
  app.post("/oauth/login", oauthLimiter, urlParser, async (req, res) => {
    const { username, password } = req.body as { username?: string; password?: string };
    const user = username ? getUserByUsername(username) : undefined;
    const valid = user && password ? await bcrypt.compare(password, user.password_hash) : false;
    if (!valid || !user) {
      return res.redirect(req.session.oauth ? "/oauth/authorize?error=1" : "/login?error=1");
    }
    req.session.user = user.username;
    req.session.userId = user.id;
    req.session.userRole = user.role;
    if (req.session.oauth) return res.redirect("/oauth/authorize");
    res.redirect(safeNext(req.body.next, user.role));
  });

  // ---- Consent (POST): issue authorization code ----
  app.post("/oauth/authorize", oauthLimiter, urlParser, (req, res) => {
    res.set("Cross-Origin-Opener-Policy", "unsafe-none");
    if (!req.session.user || !req.session.userId || !req.session.oauth) {
      return res.status(401).send("Unauthorized");
    }
    const { client_id, redirect_uri, state, code_challenge } = req.session.oauth;
    const code = nanoid(32);
    insertAuthCode({
      code,
      client_id: client_id || null,
      redirect_uri: redirect_uri || null,
      code_challenge: code_challenge || null,
      expires_at: Date.now() + 10 * 60 * 1000,
      user_id: req.session.userId,
    });
    delete req.session.oauth;

    const redirectUrl = new URL(redirect_uri);
    redirectUrl.searchParams.set("code", code);
    if (state) redirectUrl.searchParams.set("state", state);
    res.redirect(redirectUrl.toString());
  });

  // ---- Token: authorization_code + refresh_token ----
  app.post("/oauth/token", oauthLimiter, urlParser, jsonParser, (req, res) => {
    res.set("Access-Control-Allow-Origin", (req.headers.origin as string) || "*");
    const { grant_type, code, redirect_uri, code_verifier, refresh_token, client_id } = req.body as Record<
      string,
      string | undefined
    >;

    if (grant_type === "refresh_token") {
      if (!refresh_token) return res.status(400).json({ error: "invalid_request", error_description: "Missing refresh_token" });
      const rt = getRefreshToken(refresh_token);
      if (!rt) return res.status(400).json({ error: "invalid_grant", error_description: "Refresh token not found" });
      if (rt.used) return res.status(400).json({ error: "invalid_grant", error_description: "Refresh token already used" });
      if (rt.expires_at < Date.now()) return res.status(400).json({ error: "invalid_grant", error_description: "Refresh token expired" });
      markRefreshTokenUsed(refresh_token);
      return res.json(issueTokenPair(rt.user_id, rt.client_id || client_id || null));
    }

    if (grant_type !== "authorization_code") return res.status(400).json({ error: "unsupported_grant_type" });
    if (!code || !code_verifier) {
      return res.status(400).json({ error: "invalid_request", error_description: "Missing code or code_verifier" });
    }
    const row = getAuthCode(code);
    if (!row) return res.status(400).json({ error: "invalid_grant", error_description: "Code not found" });
    if (row.used) return res.status(400).json({ error: "invalid_grant", error_description: "Code already used" });
    if (row.expires_at < Date.now()) return res.status(400).json({ error: "invalid_grant", error_description: "Code expired" });
    if (redirect_uri && row.redirect_uri && row.redirect_uri !== redirect_uri) {
      return res.status(400).json({ error: "invalid_grant", error_description: "redirect_uri mismatch" });
    }
    const challenge = crypto.createHash("sha256").update(code_verifier).digest("base64url");
    if (challenge !== row.code_challenge) {
      return res.status(400).json({ error: "invalid_grant", error_description: "PKCE verification failed" });
    }
    markAuthCodeUsed(code);
    res.json(issueTokenPair(row.user_id, row.client_id));
  });
}
