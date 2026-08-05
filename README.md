# mcp-brevo

Multi-tenant **remote** MCP server for [Brevo](https://www.brevo.com) with
**self-hosted OAuth 2.1**. Connect Claude (or any MCP client that speaks OAuth +
Streamable HTTP) to your Brevo accounts over the web — no local install per
machine.

Migrated from a local stdio MCP server: the ~37 Brevo tools are unchanged, only
the transport (stdio → Streamable HTTP) and auth (env key → OAuth) changed.

## Features

- 📤 **Transactional email** — templates or custom content
- 👤 **Contacts** — create, read, update, delete, stats
- 📁 **Lists** & 📂 **Folders** — organize and manage members
- 📣 **Campaigns** — create, update, schedule, send, test
- 📊 **Statistics** — transactional events & aggregates
- 🔐 **OAuth 2.1** (PKCE, DCR, refresh tokens) — self-hosted, no third party
- 🏢 **Multi-tenant** — one endpoint per Brevo account (`/bienpur`, `/harmonisch`, …)
- 🔑 **Encrypted keys at rest** — Brevo API keys stored AES-256-GCM
- 🖥️ **Admin dashboard** — manage users, tenants and keys

## Architecture

```
Claude ──OAuth 2.1 (PKCE)──▶  https://mcp-brevo.<domain>          (nginx + TLS)
                                     │  reverse proxy → 127.0.0.1:3104
                                     ▼
                       Express app (this repo)
                         • OAuth AS + Resource Server   src/oauth.ts
                         • Admin dashboard              src/admin.ts + views.ts
                         • Tenant router  /:tenant       src/server.ts
                         • MCP over Streamable HTTP      src/mcp-http.ts
                         • Brevo tools (per-tenant key)  src/brevo/tools.ts
                         • SQLite (node:sqlite)          src/db.ts
                         • AES-256-GCM key crypto        src/crypto.ts
```

Each tenant = a row in `tenants` with an encrypted Brevo key and an owner.
`GET /:tenant` is guarded by an OAuth Bearer token bound to that owner; on a
valid token the request is served by an MCP server instance using the tenant's
decrypted key.

## Run locally

```bash
npm install
npm run build

cp .env.example .env
node -e "console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('SESSION_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
# put those + PUBLIC_URL=http://localhost:3104 + ADMIN_PASSWORD into .env

npm start          # web server on 127.0.0.1:3104
```

Then open `http://localhost:3104/admin`, log in, and add a tenant.

### Optional: stdio mode (single tenant, local testing)

```bash
BREVO_API_KEY=xkeysib-... npm run start:stdio
```

## Deployment

See **[DEPLOY.md](DEPLOY.md)** — nginx vhost, PM2, TLS, tenant setup, and the
important note about Brevo's **Authorized IPs** feature.

## Security notes

- `.env` and `data.db` are gitignored and must never be committed.
- Losing `ENCRYPTION_KEY` makes stored Brevo keys unrecoverable — back it up.
- OAuth requires HTTPS in production (cookies are `Secure` when `PUBLIC_URL` is https).

## Tool reference

See [MCP-Server.md](MCP-Server.md) for the full list of tools and parameters.

## Version

**v4.0.0** — remote, multi-tenant, OAuth 2.1 (migrated from v3 stdio server).
