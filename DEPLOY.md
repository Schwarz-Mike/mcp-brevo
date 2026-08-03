# Deployment — mcp-brevo

Multi-tenant remote MCP server for Brevo with self-hosted OAuth 2.1.
Target: Linux VPS (same pattern as `mcp-auth-proxy`), nginx + PM2, one
subdomain, per-tenant endpoints under it.

```
Claude  ──OAuth 2.1 / PKCE──▶  mcp-brevo.mikeschwarz.ch          (nginx, TLS)
                                        │  proxy → 127.0.0.1:3104
                                        ▼
                            Node app (Express + MCP SDK)
                              /bienpur     → Brevo key A (encrypted)
                              /harmonisch  → Brevo key B (encrypted)
```

## 0. Prerequisites

- **Node.js ≥ 22.5** (required for the built-in `node:sqlite`). Check: `node -v`.
  If older, install Node 22/24 (nvm or NodeSource).
- nginx + a DNS record `mcp-brevo.mikeschwarz.ch` → server IP.
- PM2: `npm install -g pm2`.

## 1. Get the code

```bash
sudo mkdir -p /opt/mcp-brevo && sudo chown $USER /opt/mcp-brevo
git clone https://github.com/Schwarz-Mike/mcp-brevo.git /opt/mcp-brevo
cd /opt/mcp-brevo
npm ci
npm run build
```

## 2. Configure `.env`

```bash
cp .env.example .env
# Generate the two secrets:
node -e "console.log('ENCRYPTION_KEY='+require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('SESSION_SECRET='+require('crypto').randomBytes(48).toString('hex'))"
```

Fill in `.env`:

```
PUBLIC_URL=https://mcp-brevo.mikeschwarz.ch
PORT=3104
ENCRYPTION_KEY=<64 hex chars from above>
SESSION_SECRET=<from above>
ADMIN_USERNAME=mike
ADMIN_PASSWORD=<a strong password>
ADMIN_EMAIL=mike.schwarz@hypnosetherapie.pro
```

> `chmod 600 .env` — it holds the master encryption key.
> **If `ENCRYPTION_KEY` is ever lost, all stored Brevo keys become unrecoverable**
> (you would re-enter them in the dashboard). Back it up somewhere safe.

## 3. nginx + TLS

Use [`deploy/nginx-mcp-brevo.conf`](deploy/nginx-mcp-brevo.conf) (managed panel:
create the site there and paste only the `location /` block). Then get a cert
(`certbot --nginx -d mcp-brevo.mikeschwarz.ch`) if the panel doesn't.

## 4. Start with PM2

```bash
# edit cwd in deploy/ecosystem.config.js if not /opt/mcp-brevo
pm2 start deploy/ecosystem.config.js
pm2 save && pm2 startup
pm2 logs mcp-brevo
```

On first start the admin user is seeded from `ADMIN_USERNAME`/`ADMIN_PASSWORD`.

## 5. Smoke test

```bash
curl https://mcp-brevo.mikeschwarz.ch/health
curl https://mcp-brevo.mikeschwarz.ch/.well-known/oauth-authorization-server
```

## 6. Create tenants (Brevo accounts)

1. Open `https://mcp-brevo.mikeschwarz.ch/admin`, log in as admin.
2. **+ Neuen Tenant anlegen** → Endpoint name `bienpur`, label, owner, and the
   Brevo API key. The key is stored AES-256-GCM encrypted.
3. Use **Key testen** to verify the key reaches Brevo.
4. Repeat for `harmonisch` (create a `user` first if it should be owned
   separately; for now everything can stay under the admin).

## 7. ⚠️ Brevo "Authorized IPs"

Brevo can restrict API keys to allow-listed IPs. If calls return
`401 – unrecognised IP address <IP>`, add the **server's public IP** to each
Brevo account: **Brevo → Settings → Security / SMTP & API → Authorized IPs**
(or click the link in the error). This bit us during local testing — the key was
valid, only the IP was not authorized.

## 8. Connect Claude

Claude.ai → Settings → Connectors → **Add custom connector** →
URL `https://mcp-brevo.mikeschwarz.ch/bienpur` → log in → **Allow access**.
Each tenant is a separate connector URL.

## Updating

```bash
cd /opt/mcp-brevo && git pull && npm ci && npm run build && pm2 restart mcp-brevo
```

## Data & backup

- `data.db` (in the app dir) holds users, encrypted tenant keys, and tokens.
- Back up `data.db` **and** `ENCRYPTION_KEY` together.
