# mcp-brevo — System Documentation

## What it does

A **remote, multi-tenant** MCP server for Brevo. Claude connects over the web via
**OAuth 2.1**; each Brevo account is exposed as its own endpoint under one domain.
Unlike `mcp-auth-proxy` (which forwards to already-remote MCP servers), mcp-brevo
**embeds** the Brevo tools — there is no upstream hop. It is both the OAuth
Authorization Server and the Resource Server, and it runs the ~37 Brevo tools
itself using each tenant's decrypted API key.

```
Claude ──OAuth 2.1 (PKCE)──►  mcp-brevo.mikeschwarz.ch/{tenant}  ──api-key──►  api.brevo.com
                                     (nginx TLS → 127.0.0.1:3104)
```

## Multi-tenant model

- A **tenant** = one Brevo account = one row in `tenants` with an AES-256-GCM
  encrypted key and an **owner** user. Endpoint: `/{tenant}` (single path
  segment; reserved names like `oauth`/`admin`/`login`/`health` are blocked).
- **Owner-scoped tokens**: an access token carries `user_id`; `/{tenant}` only
  serves requests whose token belongs to `tenant.owner_user_id`. So each
  customer logs in with their own account and can reach only their own tenant.
- **Roles**: `admin` (dashboard access at `/admin`) and `user` (can OAuth-connect
  their own tenants, no dashboard). Everything can live under one admin, or each
  tenant can be reassigned to its own user.

## Infrastructure

| Component | Details |
|-----------|---------|
| VPS | Databasemart, IP **173.208.162.102**, Ubuntu 22.04, CloudPanel |
| Domain | `mcp-brevo.mikeschwarz.ch` (SSL: CloudPanel cert in `/etc/nginx/ssl-certificates/`) |
| Reverse proxy | nginx `sites-enabled/mcp-brevo.mikeschwarz.ch.conf` → `127.0.0.1:3104` |
| App | Node **22.22** (`/usr/bin/node`), `node build/server.js`, port 3104 |
| Process manager | systemd `mcp-brevo.service` (runs as site user `mikeschwarz-mcp-brevo`) |
| Project path | `/home/mikeschwarz-mcp-brevo/htdocs/mcp-brevo.mikeschwarz.ch/` |
| SSH | key `~/.ssh/mcp_brevo_deploy` authorized for `mike` (site user) and `root` |

> Node **≥ 22.5** is mandatory — the app uses the built-in `node:sqlite`
> (`DatabaseSync`), which does not exist in older Node.

## Database (`node:sqlite` — `data.db` in the app dir)

```sql
users          id, username, email, firstname, lastname, password_hash,
               role ('admin'|'user'), created_at
tenants        id, owner_user_id, name (UNIQUE), label, brevo_key_enc,
               created_at, last_called_at, call_count
auth_codes     code (PK), client_id, redirect_uri, code_challenge, expires_at, used, user_id
access_tokens  token (PK), expires_at, user_id                    -- 24 h TTL
refresh_tokens token (PK), user_id, client_id, expires_at, used   -- 30 d TTL, rotated on use
```

`brevo_key_enc` is AES-256-GCM (`iv|tag|ciphertext`, base64) using `ENCRYPTION_KEY`.

## Environment (`.env` in the app dir, chmod 600)

```
PUBLIC_URL=https://mcp-brevo.mikeschwarz.ch   # no trailing slash; drives cookie Secure + issuer
PORT=3104
ENCRYPTION_KEY=<64 hex chars>                 # node -e "…randomBytes(32).toString('hex')"
SESSION_SECRET=<random>
ADMIN_USERNAME=mike
ADMIN_PASSWORD=<seed password>                # only used to seed a missing admin on first start
ADMIN_EMAIL=mike.schwarz@hypnosetherapie.pro
# BREVO_API_KEY=…                             # stdio shim only, unused by the web server
```

> **Back up `.env` (the `ENCRYPTION_KEY`) together with `data.db`.** Without the
> key, the stored Brevo keys are unrecoverable.

## Key files

```
src/server.ts     Express wiring, admin seed, /:tenant router (registered last)
src/oauth.ts      OAuth 2.1: discovery, DCR, authorize, login, token, getBearerUserId
src/admin.ts      /login, /logout, /admin + user & tenant CRUD, key test
src/views.ts      login / consent / admin HTML (client JS uses string concat, never ${})
src/db.ts         node:sqlite schema + typed helpers
src/crypto.ts     AES-256-GCM
src/mcp-http.ts   session-managed Streamable-HTTP bridge → createBrevoServer(key)
src/brevo/tools.ts createBrevoServer(apiKey) — the ~37 Brevo tools
src/index.ts      stdio shim (single-tenant, local testing)
```

## OAuth 2.1 flow (per tenant)

1. Claude `POST /{tenant}` with no token → `401` +
   `WWW-Authenticate: Bearer resource_metadata=".../.well-known/oauth-protected-resource/{tenant}"`.
2. Claude fetches PRM (→ AS = the same origin) and AS metadata.
3. Claude `POST /oauth/register` (DCR) → `client_id`.
4. OAuth popup → user logs in → **Allow** → `POST /oauth/authorize` issues a code
   bound to `user_id`.
5. `POST /oauth/token` (PKCE verify) → **access token (24 h) + refresh token (30 d)**.
6. Claude `POST /{tenant}` with the Bearer token → server checks
   `token.user_id == tenant.owner_user_id`, decrypts the key, runs the tool.
7. On expiry Claude uses `grant_type=refresh_token` (rotating) — no re-login for 30 d.

## Operations

```bash
SSH="ssh -i ~/.ssh/mcp_brevo_deploy root@173.208.162.102"

# service
$SSH "systemctl status mcp-brevo --no-pager"
$SSH "journalctl -u mcp-brevo -n 100 --no-pager"
$SSH "systemctl restart mcp-brevo"

# redeploy (pulls main, npm ci, build, restart; keeps .env + data.db)
$SSH "bash /root/deploy-mcp-brevo.sh"

# generate secrets
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"   # ENCRYPTION_KEY

# add a tenant / user: use the admin dashboard at /admin.
# email-as-username user: create via a server-side script using build/db.js
#   (the admin-API username regex forbids '@'), then reassign the tenant's
#   owner_user_id to that user.
```

Connector URL for Claude: `https://mcp-brevo.mikeschwarz.ch/{tenant}` — each
tenant is a separate custom connector.

---

## Hard-won lessons

### 1. Streamable HTTP must be **session-managed**, not per-request stateless
A "fresh `Server` per request" (stateless) breaks MCP's lifecycle: `initialize`
runs on one throwaway server, then `tools/list` hits a **new** server that never
saw `initialize` → "not initialized". Fix: keep a per-session transport in an
in-memory `Map` keyed by the `Mcp-Session-Id` the SDK issues on `initialize`
(`sessionIdGenerator: () => randomUUID()`, `onsessioninitialized`), and route
later requests to it. Each session is also pinned to its tenant.

### 2. Brevo **Authorized IPs** — valid key, wrong IP → 401
Tool calls fail with `401 We have detected you are using an unrecognised IP
address <IP>` when the Brevo account restricts API IPs. The key is fine; the
**server's** egress IP must be added under Brevo → Settings → Security →
Authorized IPs. `bienpur` had this on, `harmonisch` did not. The admin
"Key testen" button (`GET /v3/account`) surfaces this immediately.

### 3. CloudPanel's default vhost breaks OAuth discovery **and** SSE
The generated `mcp-brevo.mikeschwarz.ch.conf` (a) served `/.well-known/`
**statically** from the web root (so `/.well-known/oauth-authorization-server`
404'd instead of hitting the app) and (b) had `proxy_buffering` **on** (buffers
the SSE stream → MCP hangs). Fix = mirror the working `mcp-proxy` vhost:
```nginx
location ^~ /.well-known/acme-challenge/ { auth_basic off; allow all; }  # static, for certbot
location ^~ /.well-known/            { proxy_pass http://127.0.0.1:3104; ... }  # OAuth discovery → app
location / { proxy_pass http://127.0.0.1:3104/; ... proxy_buffering off; proxy_cache off; chunked_transfer_encoding on; }
```
A backup of the original is at `*.conf.bak-predeploy`.

### 4. Deploy needs **root**; the site SSH user has no sudo
On this CloudPanel box each MCP app is a **root-managed systemd unit** running as
its own site user (e.g. `mcp-proxy.service` → `User=mikeschwarz-mcp-proxy`). The
per-site SSH user (`mike`) has **no sudo**, so it cannot create the unit or edit
nginx. Deployment therefore needs root. The deploy key is authorized for **root**
(`/root/.ssh/authorized_keys`); app files are written **as the site user**
(`sudo -u mikeschwarz-mcp-brevo -H …`) so ownership stays correct and the service
can write `data.db`. Password SSH is unusable from an automated/sandboxed shell
(inline passwords are blocked and there's no TTY) — always use the key.

### 5. The deploy pulls **main** — merge before deploying
`deploy-mcp-brevo.sh` does `git fetch origin main && git reset --hard origin/main`.
First run built the old baseline (only `main` existed) and failed the
`build/server.js` check. Merge the feature branch to `main` **before** deploying.

### 6. Email-as-username → create via a server-side script
The login form matches the `username` field verbatim, so a username **can** be an
email (`getUserByUsername` is a plain lookup). But the admin-API create route
enforces `USERNAME_RE` which forbids `@`/`.`. To give a customer email login,
insert the user directly with `build/db.js` (`createUser`) from the app dir as the
site user, then reassign the tenant's `owner_user_id`.

### 7. Reassigning a tenant invalidates the previous owner's access
Because tokens are owner-scoped, moving a tenant to a new user means the previous
owner's tokens stop working on that endpoint, and any existing Claude connector
for it must be re-connected under the new account. Verified: after moving
`harmonisch` to `info@harmonisches-miteinander.ch`, the admin token gets `401`
there while the new user's token works.

### 8. Public repo → no secrets in code
The admin password is seeded from `ADMIN_PASSWORD` (env), never hardcoded (the
upstream `mcp-auth-proxy` had a literal seed password — deliberately dropped
here). `.env` and `data.db` are gitignored.
