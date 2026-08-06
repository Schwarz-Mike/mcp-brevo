# Changelog

## [4.0.0] – 2026-08-05 — Remote, multi-tenant, self-hosted OAuth 2.1

Complete migration from a **local stdio** MCP server (v3) to a **remote,
multi-tenant** server that Claude connects to over the web via **OAuth 2.1**.
The ~37 Brevo tools are unchanged — only the transport and auth layers were
replaced, and multi-tenancy + an admin dashboard were added.

### Added
- **Self-hosted OAuth 2.1** (`src/oauth.ts`): Authorization Server **and**
  Resource Server in one app. RFC 8414 AS metadata, RFC 9728 per-resource
  Protected Resource Metadata, RFC 7591 Dynamic Client Registration, PKCE
  (S256), and 30-day rotating refresh tokens. Ported from the proven
  `mcp-auth-proxy`.
- **Multi-tenant routing** `/:tenant` (`src/server.ts`): one endpoint per Brevo
  account (e.g. `/bienpur`, `/harmonisch`). Tokens are **owner-scoped** — a
  tenant endpoint only accepts a token issued to that tenant's owner.
- **Streamable-HTTP MCP transport, session-managed** (`src/mcp-http.ts`): a
  per-session MCP `Server` bound to the tenant's decrypted key, kept in an
  in-memory map keyed by `Mcp-Session-Id`.
- **`createBrevoServer(apiKey)` factory** (`src/brevo/tools.ts`): the entire
  tool set from v3 wrapped so one process serves many tenants, each with its
  own key. Only 4 lines changed vs. the v3 source (`API_KEY` → `apiKey`).
- **Admin dashboard** (`src/admin.ts`, `src/views.ts`): manage users and
  tenants, create/rotate/**test** Brevo keys (test hits `GET /v3/account`),
  see per-tenant connector URLs.
- **AES-256-GCM encryption at rest** for Brevo keys (`src/crypto.ts`), stored
  in `node:sqlite` (`src/db.ts`: `users`, `tenants`, `auth_codes`,
  `access_tokens`, `refresh_tokens`).
- **Deployment assets**: `deploy/nginx-mcp-brevo.conf`, `deploy/ecosystem.config.js`,
  `DEPLOY.md`, `SYSTEM.md`.
- **stdio shim** (`src/index.ts`): keeps a single-tenant `BREVO_API_KEY` mode
  for quick local testing (`npm run start:stdio`).

### Changed
- **Transport**: stdio → Streamable HTTP. **Auth**: single `BREVO_API_KEY` env
  var → per-tenant OAuth.
- **Runtime/build**: TypeScript targets ES2022, `@modelcontextprotocol/sdk`
  bumped to ^1.25.2, added express/express-session/helmet/express-rate-limit/
  bcrypt/nanoid/dotenv. Entry point is now `build/server.js`.
- **Admin seeding** reads `ADMIN_USERNAME`/`ADMIN_PASSWORD` from env — **no
  hardcoded password** (the repo is public).

### Removed
- **SMS/self-registration** (the proxy's ecall.ch flow) — this server is
  admin-managed, so no SMTP dependency.

### Deployment (2026-08-05)
- Live at `https://mcp-brevo.mikeschwarz.ch` on the Databasemart VPS
  (Ubuntu 22.04, Node 22.22), systemd `mcp-brevo.service` → `127.0.0.1:3104`,
  behind CloudPanel-managed nginx + Let's Encrypt.
- Verified end-to-end (both tenants): OAuth (PKCE/DCR/refresh) → MCP
  initialize / tools_list (37) / tools_call → real Brevo data.

### Notes / operational (2026-08-06)
- **Brevo "Authorized IPs":** tool calls 401 with `unrecognised IP` unless the
  server IP `173.208.162.102` is allow-listed in the Brevo account. Done for
  both accounts.
- **Tenant reassignment:** `harmonisch` moved from `mike` (admin) to a
  dedicated user `info@harmonisches-miteinander.ch` (role `user`). Owner-scoped
  tokens mean the admin can no longer call `/harmonisch`; the new owner logs in
  with their own account. Email-as-username accounts are created via a
  server-side script (the admin-API username regex forbids `@`).

---

## [3.0.0] — Local stdio server (baseline, pre-migration)

- Single-file stdio MCP server (`src/index.ts`) for Brevo: transactional email,
  contacts, lists, folders, campaigns, stats (~37 tools).
- Auth via a single `BREVO_API_KEY` environment variable.
- Configured per machine in the Claude Desktop config. This is the starting
  point that v4.0.0 migrated to the web.
