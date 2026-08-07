"use strict";
// SQLite storage layer (Node built-in node:sqlite — no native dependency).
// Tables: users, tenants, auth_codes, access_tokens, refresh_tokens.

import { DatabaseSync } from "node:sqlite";
import path from "node:path";

const DB_PATH = process.env.DB_PATH || path.join(process.cwd(), "data.db");

export const db = new DatabaseSync(DB_PATH);

// ------------------------------------------------------------------
// Schema
// ------------------------------------------------------------------

export function initDb(): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id            INTEGER PRIMARY KEY AUTOINCREMENT,
      username      TEXT UNIQUE NOT NULL,
      email         TEXT NOT NULL DEFAULT '',
      firstname     TEXT NOT NULL DEFAULT '',
      lastname      TEXT NOT NULL DEFAULT '',
      password_hash TEXT NOT NULL,
      role          TEXT NOT NULL DEFAULT 'user',
      created_at    INTEGER NOT NULL
    );

    -- One row per Brevo account exposed as an MCP endpoint (/:name).
    -- The Brevo API key is stored AES-256-GCM encrypted in brevo_key_enc.
    CREATE TABLE IF NOT EXISTS tenants (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      owner_user_id  INTEGER NOT NULL,
      name           TEXT UNIQUE NOT NULL,
      label          TEXT NOT NULL DEFAULT '',
      brevo_key_enc  TEXT NOT NULL,
      created_at     INTEGER NOT NULL,
      last_called_at INTEGER,
      call_count     INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS auth_codes (
      code           TEXT PRIMARY KEY,
      client_id      TEXT,
      redirect_uri   TEXT,
      code_challenge TEXT,
      expires_at     INTEGER NOT NULL,
      used           INTEGER NOT NULL DEFAULT 0,
      user_id        INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS access_tokens (
      token      TEXT PRIMARY KEY,
      expires_at INTEGER NOT NULL,
      user_id    INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS refresh_tokens (
      token      TEXT PRIMARY KEY,
      user_id    INTEGER NOT NULL,
      client_id  TEXT,
      expires_at INTEGER NOT NULL,
      used       INTEGER NOT NULL DEFAULT 0
    );
  `);
}

export function cleanupExpired(): void {
  const now = Date.now();
  db.prepare("DELETE FROM auth_codes WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM access_tokens WHERE expires_at < ?").run(now);
  db.prepare("DELETE FROM refresh_tokens WHERE expires_at < ?").run(now);
}

// ------------------------------------------------------------------
// Row types
// ------------------------------------------------------------------

export interface UserRow {
  id: number;
  username: string;
  email: string;
  firstname: string;
  lastname: string;
  password_hash: string;
  role: string;
  created_at: number;
}

export interface TenantRow {
  id: number;
  owner_user_id: number;
  name: string;
  label: string;
  brevo_key_enc: string;
  created_at: number;
  last_called_at: number | null;
  call_count: number;
}

export interface AuthCodeRow {
  code: string;
  client_id: string | null;
  redirect_uri: string | null;
  code_challenge: string | null;
  expires_at: number;
  used: number;
  user_id: number;
}

export interface AccessTokenRow {
  token: string;
  expires_at: number;
  user_id: number;
}

export interface RefreshTokenRow {
  token: string;
  user_id: number;
  client_id: string | null;
  expires_at: number;
  used: number;
}

// ------------------------------------------------------------------
// User helpers
// ------------------------------------------------------------------

export function getUserByUsername(username: string): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE username = ?").get(username) as UserRow | undefined;
}

export function getUserById(id: number): UserRow | undefined {
  return db.prepare("SELECT * FROM users WHERE id = ?").get(id) as UserRow | undefined;
}

export function listUsers(): UserRow[] {
  return db
    .prepare("SELECT * FROM users ORDER BY created_at DESC")
    .all() as unknown as UserRow[];
}

export function createUser(u: {
  username: string;
  email?: string;
  firstname?: string;
  lastname?: string;
  password_hash: string;
  role?: string;
}): number {
  const res = db
    .prepare(
      `INSERT INTO users (username, email, firstname, lastname, password_hash, role, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      u.username,
      u.email || "",
      u.firstname || "",
      u.lastname || "",
      u.password_hash,
      u.role || "user",
      Date.now()
    );
  return Number(res.lastInsertRowid);
}

export function setUserPassword(id: number, password_hash: string): void {
  db.prepare("UPDATE users SET password_hash = ? WHERE id = ?").run(password_hash, id);
}

export function setUserRole(id: number, role: string): void {
  db.prepare("UPDATE users SET role = ? WHERE id = ?").run(role, id);
}

export function deleteUser(id: number): void {
  db.prepare("DELETE FROM tenants WHERE owner_user_id = ?").run(id);
  db.prepare("DELETE FROM users WHERE id = ?").run(id);
}

// ------------------------------------------------------------------
// Tenant helpers
// ------------------------------------------------------------------

export function getTenantByName(name: string): TenantRow | undefined {
  return db.prepare("SELECT * FROM tenants WHERE name = ?").get(name) as TenantRow | undefined;
}

export function getTenantById(id: number): TenantRow | undefined {
  return db.prepare("SELECT * FROM tenants WHERE id = ?").get(id) as TenantRow | undefined;
}

export function listTenants(): TenantRow[] {
  return db
    .prepare("SELECT * FROM tenants ORDER BY created_at DESC")
    .all() as unknown as TenantRow[];
}

export function listTenantsByOwner(userId: number): TenantRow[] {
  return db
    .prepare("SELECT * FROM tenants WHERE owner_user_id = ? ORDER BY created_at DESC")
    .all(userId) as unknown as TenantRow[];
}

export function createTenant(t: {
  owner_user_id: number;
  name: string;
  label?: string;
  brevo_key_enc: string;
}): number {
  const res = db
    .prepare(
      `INSERT INTO tenants (owner_user_id, name, label, brevo_key_enc, created_at)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(t.owner_user_id, t.name, t.label || t.name, t.brevo_key_enc, Date.now());
  return Number(res.lastInsertRowid);
}

export function updateTenant(
  id: number,
  fields: { label?: string; brevo_key_enc?: string; owner_user_id?: number }
): void {
  const cur = getTenantById(id);
  if (!cur) return;
  db.prepare("UPDATE tenants SET label = ?, brevo_key_enc = ?, owner_user_id = ? WHERE id = ?").run(
    fields.label !== undefined ? fields.label : cur.label,
    fields.brevo_key_enc !== undefined ? fields.brevo_key_enc : cur.brevo_key_enc,
    fields.owner_user_id !== undefined ? fields.owner_user_id : cur.owner_user_id,
    id
  );
}

export function deleteTenant(id: number): void {
  db.prepare("DELETE FROM tenants WHERE id = ?").run(id);
}

export function touchTenant(id: number): void {
  db.prepare(
    "UPDATE tenants SET last_called_at = ?, call_count = call_count + 1 WHERE id = ?"
  ).run(Date.now(), id);
}

// ------------------------------------------------------------------
// OAuth code / token helpers
// ------------------------------------------------------------------

export function insertAuthCode(c: {
  code: string;
  client_id: string | null;
  redirect_uri: string | null;
  code_challenge: string | null;
  expires_at: number;
  user_id: number;
}): void {
  db.prepare(
    `INSERT INTO auth_codes (code, client_id, redirect_uri, code_challenge, expires_at, user_id)
     VALUES (?, ?, ?, ?, ?, ?)`
  ).run(c.code, c.client_id, c.redirect_uri, c.code_challenge, c.expires_at, c.user_id);
}

export function getAuthCode(code: string): AuthCodeRow | undefined {
  return db.prepare("SELECT * FROM auth_codes WHERE code = ?").get(code) as AuthCodeRow | undefined;
}

export function markAuthCodeUsed(code: string): void {
  db.prepare("UPDATE auth_codes SET used = 1 WHERE code = ?").run(code);
}

export function insertAccessToken(token: string, expiresAt: number, userId: number): void {
  db.prepare("INSERT INTO access_tokens (token, expires_at, user_id) VALUES (?, ?, ?)").run(
    token,
    expiresAt,
    userId
  );
}

export function getAccessToken(token: string): AccessTokenRow | undefined {
  return db.prepare("SELECT * FROM access_tokens WHERE token = ?").get(token) as
    | AccessTokenRow
    | undefined;
}

export function insertRefreshToken(
  token: string,
  userId: number,
  clientId: string | null,
  expiresAt: number
): void {
  db.prepare(
    "INSERT INTO refresh_tokens (token, user_id, client_id, expires_at) VALUES (?, ?, ?, ?)"
  ).run(token, userId, clientId, expiresAt);
}

export function getRefreshToken(token: string): RefreshTokenRow | undefined {
  return db.prepare("SELECT * FROM refresh_tokens WHERE token = ?").get(token) as
    | RefreshTokenRow
    | undefined;
}

export function markRefreshTokenUsed(token: string): void {
  db.prepare("UPDATE refresh_tokens SET used = 1 WHERE token = ?").run(token);
}
