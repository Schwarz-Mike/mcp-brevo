"use strict";
// Session-authenticated admin dashboard: manage users and tenants
// (Brevo accounts / MCP endpoints). Login + logout live here too.

import type { Express, Request, Response, NextFunction } from "express";
import express from "express";
import bcrypt from "bcrypt";

import { config } from "./config.js";
import { encrypt, decrypt } from "./crypto.js";
import { safeNext } from "./routing.js";
import { renderLogin, renderAdmin, renderDashboard } from "./views.js";
import {
  listUsers,
  listTenantsByOwner,
  getUserById,
  getUserByUsername,
  createUser,
  setUserPassword,
  deleteUser,
  listTenants,
  getTenantById,
  getTenantByName,
  createTenant,
  updateTenant,
  deleteTenant,
} from "./db.js";

const jsonParser = express.json();

const TENANT_NAME_RE = /^[a-z][a-z0-9_-]{1,39}$/;
const USERNAME_RE = /^[a-zA-Z][a-zA-Z0-9_-]{2,29}$/;
const RESERVED = new Set([
  "oauth", "admin", "login", "logout", "register", "dashboard", "health",
  "api", "static", "assets", "well-known", ".well-known", "favicon.ico",
]);

function wantsJson(req: Request): boolean {
  if (req.method !== "GET") return true;
  const accept = req.headers["accept"] || "";
  return accept.includes("application/json") && !accept.includes("text/html");
}

export function requireAdmin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId || req.session.userRole !== "admin") {
    if (wantsJson(req)) {
      res.status(401).json({ error: "Sitzung abgelaufen. Bitte neu einloggen.", reauth: true });
      return;
    }
    // Logged in but not an admin: send them to their own dashboard. Redirecting
    // back to /login here would loop, because /login forwards a logged-in user
    // straight back to the page they came from.
    res.redirect(req.session.userId ? "/dashboard" : "/login?next=/admin");
    return;
  }
  next();
}

function requireLogin(req: Request, res: Response, next: NextFunction): void {
  if (!req.session.userId) {
    if (wantsJson(req)) {
      res.status(401).json({ error: "Sitzung abgelaufen. Bitte neu einloggen.", reauth: true });
      return;
    }
    res.redirect("/login?next=/dashboard");
    return;
  }
  next();
}

export function mountAdmin(app: Express): void {
  // ---- Login / logout ----
  app.get("/login", (req, res) => {
    if (req.session.userId) return res.redirect(safeNext(req.query.next, req.session.userRole));
    res.send(renderLogin());
  });
  app.get("/logout", (req, res) => {
    req.session.destroy(() => res.redirect("/login"));
  });

  // ---- User dashboard (any logged-in user) ----
  app.get("/dashboard", requireLogin, (req, res) => {
    const user = getUserById(req.session.userId!);
    if (!user) return req.session.destroy(() => res.redirect("/login"));
    res.send(renderDashboard(user, config.baseUrl, listTenantsByOwner(user.id)));
  });

  // ---- Admin page ----
  app.get("/admin", requireAdmin, (req, res) => {
    res.send(renderAdmin(req.session.user || "admin", config.baseUrl, listUsers(), listTenants()));
  });

  // ---- Users ----
  app.post("/admin/users", requireAdmin, jsonParser, async (req, res) => {
    const { username, firstname, lastname, email, password, role } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: "Benutzername und Passwort sind erforderlich." });
    if (!USERNAME_RE.test(username)) return res.status(400).json({ error: "Benutzername: 3–30 Zeichen, Buchstabe zuerst." });
    if (RESERVED.has(String(username).toLowerCase())) return res.status(400).json({ error: "Benutzername ist reserviert." });
    if (String(password).length < 8) return res.status(400).json({ error: "Passwort min. 8 Zeichen." });
    if (getUserByUsername(username)) return res.status(409).json({ error: "Benutzername bereits vergeben." });
    if (role && !["user", "admin"].includes(role)) return res.status(400).json({ error: "Ungültige Rolle." });
    const hash = await bcrypt.hash(password, 12);
    const id = createUser({ username, firstname, lastname, email, password_hash: hash, role: role || "user" });
    res.status(201).json({ id, username });
  });

  app.post("/admin/users/:id/password", requireAdmin, jsonParser, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const { password } = req.body || {};
    if (!password || String(password).length < 8) return res.status(400).json({ error: "Passwort min. 8 Zeichen." });
    if (!getUserById(id)) return res.status(404).json({ error: "Benutzer nicht gefunden." });
    setUserPassword(id, await bcrypt.hash(password, 12));
    res.json({ ok: true });
  });

  app.delete("/admin/users/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const user = getUserById(id);
    if (!user) return res.status(404).json({ error: "Benutzer nicht gefunden." });
    if (user.username === config.adminUsername) return res.status(403).json({ error: "Admin-Owner kann nicht gelöscht werden." });
    deleteUser(id);
    res.json({ ok: true });
  });

  // ---- Tenants ----
  app.post("/admin/tenants", requireAdmin, jsonParser, (req, res) => {
    const { name, label, owner_user_id, brevo_key } = req.body || {};
    if (!name || !brevo_key || !owner_user_id) {
      return res.status(400).json({ error: "name, owner_user_id und brevo_key sind erforderlich." });
    }
    if (!TENANT_NAME_RE.test(name)) {
      return res.status(400).json({ error: "Endpoint-Name: Kleinbuchstaben/Ziffern/-/_ , Buchstabe zuerst." });
    }
    if (RESERVED.has(String(name).toLowerCase())) return res.status(400).json({ error: "Dieser Name ist reserviert." });
    if (getTenantByName(name)) return res.status(409).json({ error: "Ein Tenant mit diesem Namen existiert bereits." });
    if (!getUserById(Number(owner_user_id))) return res.status(400).json({ error: "Owner-Benutzer nicht gefunden." });
    const id = createTenant({
      owner_user_id: Number(owner_user_id),
      name,
      label: label || name,
      brevo_key_enc: encrypt(String(brevo_key)),
    });
    res.status(201).json({ id, name, connector_url: `${config.baseUrl}/${name}` });
  });

  app.put("/admin/tenants/:id", requireAdmin, jsonParser, (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tenant = getTenantById(id);
    if (!tenant) return res.status(404).json({ error: "Tenant nicht gefunden." });
    const { label, owner_user_id, brevo_key } = req.body || {};
    if (owner_user_id && !getUserById(Number(owner_user_id))) {
      return res.status(400).json({ error: "Owner-Benutzer nicht gefunden." });
    }
    updateTenant(id, {
      label,
      owner_user_id: owner_user_id !== undefined ? Number(owner_user_id) : undefined,
      brevo_key_enc: brevo_key ? encrypt(String(brevo_key)) : undefined,
    });
    res.json({ ok: true });
  });

  app.delete("/admin/tenants/:id", requireAdmin, (req, res) => {
    const id = parseInt(req.params.id, 10);
    if (!getTenantById(id)) return res.status(404).json({ error: "Tenant nicht gefunden." });
    deleteTenant(id);
    res.json({ ok: true });
  });

  // ---- Verify a tenant's Brevo key works (GET /v3/account) ----
  app.post("/admin/tenants/:id/test", requireAdmin, async (req, res) => {
    const id = parseInt(req.params.id, 10);
    const tenant = getTenantById(id);
    if (!tenant) return res.status(404).json({ error: "Tenant nicht gefunden." });
    try {
      const key = decrypt(tenant.brevo_key_enc);
      const r = await fetch("https://api.brevo.com/v3/account", {
        headers: { accept: "application/json", "api-key": key },
      });
      if (!r.ok) {
        const body = await r.text();
        return res.status(502).json({ error: `Brevo ${r.status}: ${body.slice(0, 120)}` });
      }
      const acc = (await r.json()) as { email?: string; companyName?: string };
      res.json({ ok: true, email: acc.email, company: acc.companyName });
    } catch (e) {
      res.status(500).json({ error: e instanceof Error ? e.message : "Fehler beim Key-Test." });
    }
  });
}
