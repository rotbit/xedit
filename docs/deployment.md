# Deployment guide

xEdit is a standard Next.js (standalone output) + PostgreSQL app, so it can be self-hosted on any machine that runs Docker. Options are ordered from simplest to most involved:

- [1. Docker Compose (recommended, simplest)](#1-docker-compose-recommended-simplest)
- [2. Dokploy](#2-dokploy)
- [3. Bare metal / PM2](#3-bare-metal--pm2)
- [4. Third-party login (GitHub / Google / WeChat)](#4-third-party-login-github--google--wechat)
- [5. Image hosting (Alibaba Cloud OSS)](#5-image-hosting-alibaba-cloud-oss)
- [6. Domain and HTTPS](#6-domain-and-https)
- [7. Upgrades, backups and rollback](#7-upgrades-backups-and-rollback)
- [8. FAQ](#8-faq)

> About Vercel: the app itself runs, but **image uploads fail** — `ali-oss` relies on dynamic `require` in the Node runtime, and Vercel has no persistent disk. Self-host for the full feature set.

---

## 1. Docker Compose (recommended, simplest)

One command brings up the database and the app; tables are created automatically when the container starts.

**Prerequisites**: a machine with Docker (including Compose v2), at least 1 CPU and 1 GB RAM, 2 GB recommended.

```bash
git clone https://github.com/rotbit/xedit.git
cd xedit
cp .env.example .env
```

Edit `.env` and fill in **at least** these:

```env
# Database password — pick your own
POSTGRES_PASSWORD=your-strong-password

# Signing key for sessions and MCP tokens; generate with openssl rand -base64 32
AUTH_SECRET=your-generated-random-string

# Your public URL; without a domain, use http://SERVER_IP:3000
AUTH_URL=https://example.com
NEXT_PUBLIC_SITE_URL=https://example.com
```

Then start it:

```bash
docker compose up -d --build
```

Open `http://SERVER_IP:3000` and sign up with an email and password to get started.

Logs, stop, restart:

```bash
docker compose logs -f app
docker compose down          # Stop (data stays in the pgdata volume)
docker compose restart app
```

> ⚠️ `NEXT_PUBLIC_SITE_URL` is inlined into the bundle at **build time**, so changing it requires a rebuild (`docker compose up -d --build`); restarting the container isn't enough. All other variables are read at runtime and only need a restart.

---

## 2. Dokploy

If you already use [Dokploy](https://dokploy.com), it's a few clicks in the UI.

### 1. Create a PostgreSQL service

Project → **Create Service → Database → PostgreSQL**:

- Set Database Name to `xedit` and note the username/password
- No need to expose an external port; the app connects over the internal Docker network
- Note the **Internal Host** on the service details page (looks like `projectname-postgres-xxxxx`)

### 2. Create the application

**Create Service → Application**:

- **Source**: choose the GitHub repo `rotbit/xedit`, branch `main` (the first time, install the GitHub App in Dokploy to authorize it)
- **Build Type**: choose **Dockerfile**, path defaults to `./Dockerfile`

### 3. Set environment variables

Application → **Environment**:

```env
DATABASE_URL=postgresql://<username>:<password>@<Internal Host>:5432/xedit
AUTH_SECRET=<generated with openssl rand -base64 32>
AUTH_URL=https://your-domain
AUTH_GITHUB_ID=<optional>
AUTH_GITHUB_SECRET=<optional>
OSS_REGION=<optional>
OSS_ACCESS_KEY_ID=<optional>
OSS_ACCESS_KEY_SECRET=<optional>
OSS_BUCKET=<optional>
```

Add `NEXT_PUBLIC_SITE_URL` under **Build → Build Args** (it's a build-time variable; setting it in Environment has no effect):

```
NEXT_PUBLIC_SITE_URL=https://your-domain
```

### 4. Domain and deploy

Application → **Domains → Add Domain**: enter the domain, set Container Port to `3000`, and enable HTTPS (Let's Encrypt issues the certificate automatically). Point the domain's DNS at the server IP first.

Click **Deploy**. Database migrations run automatically when the container starts. Then turn on **Auto Deploy / Webhook** in the app settings so every `git push` to `main` deploys automatically.

---

## 3. Bare metal / PM2

If you'd rather not use Docker:

```bash
# Prerequisites: Node.js 20+, PostgreSQL 14+
git clone https://github.com/rotbit/xedit.git && cd xedit
npm ci

cp .env.example .env   # Fill in DATABASE_URL, AUTH_SECRET, etc.

npx prisma migrate deploy   # Create tables
npm run build
npm run start               # Listens on 3000 by default
```

Keep it running with PM2:

```bash
npm i -g pm2
pm2 start npm --name xedit -- start
pm2 save && pm2 startup
```

Put Nginx in front as a reverse proxy to `127.0.0.1:3000`, and make sure to forward `X-Forwarded-Host` and `X-Forwarded-Proto` — the MCP OAuth discovery documents rely on them to compute the public origin:

```nginx
location / {
    proxy_pass http://127.0.0.1:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Forwarded-Host $host;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_http_version 1.1;
    proxy_set_header Upgrade $http_upgrade;
    proxy_set_header Connection "upgrade";
}
```

---

## 4. Third-party login (GitHub / Google / WeChat)

This is optional — **email + password sign-up and login always work**. Each third-party login only appears on the login screen once its variables are set.

### GitHub

1. Go to <https://github.com/settings/developers> → **New OAuth App**
2. Homepage URL: `https://your-domain`
3. **Authorization callback URL: `https://your-domain/api/auth/callback/github`**
4. Generate a Client Secret, put the ID / Secret into `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`, and restart the app

### Google

1. Go to <https://console.cloud.google.com> → APIs & Services → Credentials → Create OAuth client ID (type "Web application")
2. Authorized redirect URI: `https://your-domain/api/auth/callback/google`
3. Fill in `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` and restart the app

### WeChat

1. Go to <https://open.weixin.qq.com> → complete **business verification** (individual developers can't apply) → create a **Website App** and wait for approval
2. In the app details, set the **authorization callback domain** to your domain, e.g. `example.com` (domain only, no protocol or path; the actual callback is `https://your-domain/api/auth/callback/wechat`)
3. Fill in `AUTH_WECHAT_ID` / `AUTH_WECHAT_SECRET`, set `AUTH_WECHAT_ENABLED=1`, and restart the app
4. For web authorization inside WeChat Official Accounts, set `AUTH_WECHAT_PLATFORM` to `official`; the default `website` is PC QR-code login

> **Note**: WeChat doesn't return an email address, so WeChat login creates an account without one — the same person's WeChat account and email account are two separate accounts that don't share documents.

> Use separate OAuth apps for local development and production, with callbacks pointing to `http://localhost:3000/...` and your production domain respectively, so they don't interfere.

---

## 5. Image hosting (Alibaba Cloud OSS)

This is optional; without it, images pasted into the editor just won't be uploaded.

1. Create a bucket with **public read** access
2. In the RAM console, create a sub-user, **grant it only `PutObject` / `DeleteObject` on that bucket**, and generate an AccessKey
3. Fill in `OSS_REGION` (e.g. `oss-cn-hangzhou`), `OSS_ACCESS_KEY_ID`, `OSS_ACCESS_KEY_SECRET` and `OSS_BUCKET`
4. If you have a CDN / custom domain, also set `OSS_CDN_DOMAIN` (e.g. `https://img.example.com`)
5. In the bucket's **CORS settings**, allow your domain (origin `https://your-domain`, methods `PUT`/`POST`/`GET`), or the browser will block direct uploads from the front end

The AccessKey stays on the server; uploads are proxied through `/api/upload` and it is never sent to the browser.

---

## 6. Domain and HTTPS

- For Docker Compose, put [Caddy](https://caddyserver.com) or Nginx + certbot in front for TLS termination, proxying to `127.0.0.1:3000`
- With Caddy, automatic certificates take one block:

  ```
  example.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```

- Dokploy users can just enable HTTPS under Domains
- Once you have a domain, remember to update `AUTH_URL`, `NEXT_PUBLIC_SITE_URL` (which requires a rebuild) and your OAuth apps' callback URLs

**MCP requires HTTPS**: Claude Desktop, Cursor and similar clients only accept `https://` MCP server URLs (except `localhost`).

---

## 7. Upgrades, backups and rollback

### Upgrade

```bash
cd xedit
git pull
docker compose up -d --build     # prisma migrate deploy runs automatically on startup
```

Database migrations are run by `docker-entrypoint.sh` when the container starts, so there's nothing to do by hand. For bare-metal deployments, run `npm ci && npx prisma migrate deploy && npm run build && pm2 restart xedit`.

### Backup

All data lives in PostgreSQL (images are in your own OSS). Back it up regularly:

```bash
# Docker Compose
docker compose exec -T db pg_dump -U xedit xedit | gzip > xedit-$(date +%F).sql.gz

# Restore
gunzip -c xedit-2026-07-25.sql.gz | docker compose exec -T db psql -U xedit xedit
```

Add this to crontab to run daily, and copy the backups off-site.

### Rollback

```bash
git checkout <last-known-good-commit>
docker compose up -d --build
```

⚠️ Migrations only go **forward**: if a new version changed the schema, rolling back the code won't roll back the database. Before rolling back across versions, restore a database backup from the matching point in time.

---

## 8. FAQ

**Startup fails with `缺少 AUTH_SECRET` (missing AUTH_SECRET)**
`AUTH_SECRET` isn't set. Generate one with `openssl rand -base64 32` and fill it in. Note: changing it logs out every user and makes stored AI provider keys undecryptable (unless `AI_ENCRYPTION_KEY` is set separately) — once production is set up, leave it alone.

**Login keeps redirecting back to the login page / callback URL errors**
Check that `AUTH_URL` matches the public URL you actually visit (with protocol, no trailing slash), and that the OAuth app's callback URL is `https://your-domain/api/auth/callback/github`. Make sure the reverse proxy forwards `X-Forwarded-Proto`, or requests will be treated as http.

**The page loads but the database won't connect**
In Compose, the app connects to the service name `db`, not `localhost`; in Dokploy, use the database service's **Internal Host**. Check whether the password in `DATABASE_URL` contains special characters that need URL encoding (`@`, `/`, `#`, etc.).

**The sitemap / share cards still show the xedit.me domain**
`NEXT_PUBLIC_SITE_URL` wasn't passed in at **build time**. Compose users should run `docker compose up -d --build`; Dokploy users should set it under Build Args, not Environment.

**MCP clients can't connect**
See the "Troubleshooting" section of the [MCP setup guide](./mcp.md#troubleshooting). Most often HTTPS isn't set up correctly, or the reverse proxy is dropping `X-Forwarded-Host`.

**Pasting images does nothing**
The four required OSS variables aren't all set, or the bucket isn't public-read or lacks CORS rules. Check the app logs for `/api/upload` errors.

**Changing the default theme**
Reorder `src/lib/themes/presets.ts`, or change the `@default` of `UserSettings.themeId` in `prisma/schema.prisma`.
