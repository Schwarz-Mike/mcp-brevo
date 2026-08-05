"use strict";
// Centralised environment configuration + validation.

import dotenv from "dotenv";
dotenv.config();

function required(name: string): string {
  const v = process.env[name];
  if (!v) {
    console.error(`[config] Missing required env var: ${name}`);
    process.exit(1);
  }
  return v;
}

// ENCRYPTION_KEY is consumed lazily in crypto.ts, but fail fast if absent.
if (!process.env.ENCRYPTION_KEY || process.env.ENCRYPTION_KEY.length !== 64) {
  console.error(
    '[config] ENCRYPTION_KEY must be a 64-char hex string (32 bytes). ' +
      'Generate: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"'
  );
  process.exit(1);
}

export const config = {
  port: parseInt(process.env.PORT || "3104", 10),
  /** Public base URL (e.g. https://mcp-brevo.mikeschwarz.ch), no trailing slash. */
  baseUrl: required("PUBLIC_URL").replace(/\/+$/, ""),
  sessionSecret: required("SESSION_SECRET"),
  adminUsername: process.env.ADMIN_USERNAME || "mike",
  adminPassword: process.env.ADMIN_PASSWORD || "",
  adminEmail: process.env.ADMIN_EMAIL || "",
};
