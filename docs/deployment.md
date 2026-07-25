# 部署教程

xEdit 是一个标准的 Next.js（standalone 产物）+ PostgreSQL 应用，任何能跑 Docker 的机器都能自托管。本文按由简到繁排：

- [一、Docker Compose（推荐，最省事）](#一docker-compose推荐最省事)
- [二、Dokploy 面板部署](#二dokploy-面板部署)
- [三、裸机 / PM2 部署](#三裸机--pm2-部署)
- [四、配置 GitHub / Google 登录](#四配置-github--google-登录)
- [五、配置图床（阿里云 OSS）](#五配置图床阿里云-oss)
- [六、域名与 HTTPS](#六域名与-https)
- [七、升级、备份与回滚](#七升级备份与回滚)
- [八、常见问题](#八常见问题)

> 关于 Vercel：应用本身跑得起来，但**图床上传会失败**——`ali-oss` 依赖 Node 运行时的动态 `require`，且 Vercel 无持久盘。要用完整功能请选自托管。

---

## 一、Docker Compose（推荐，最省事）

一条命令起数据库 + 应用，容器启动时自动建表。

**前置**：一台装了 Docker（含 Compose v2）的机器，1 核 1G 起步，建议 2G。

```bash
git clone https://github.com/rotbit/xedit.git
cd xedit
cp .env.example .env
```

编辑 `.env`，**至少**填这三项：

```env
# 数据库密码，自己起一个
POSTGRES_PASSWORD=换成你的强密码

# 会话与 MCP 令牌签名密钥，用 openssl rand -base64 32 生成
AUTH_SECRET=换成生成出来的随机串

# 你的公网地址，没有域名就写 http://服务器IP:3000
AUTH_URL=https://example.com
NEXT_PUBLIC_SITE_URL=https://example.com
```

然后启动：

```bash
docker compose up -d --build
```

打开 `http://服务器IP:3000`，用邮箱密码注册一个账号即可开始用。

查看日志、停止、重启：

```bash
docker compose logs -f app
docker compose down          # 停止（数据保留在 pgdata 卷里）
docker compose restart app
```

> ⚠️ `NEXT_PUBLIC_SITE_URL` 是**构建期**内联进产物的，改了它必须重新构建（`docker compose up -d --build`），只重启容器不生效。其余变量都是运行时读取，重启即可。

---

## 二、Dokploy 面板部署

如果你已经在用 [Dokploy](https://dokploy.com)，图形化点几下就行。

### 1. 创建 PostgreSQL 服务

Project → **Create Service → Database → PostgreSQL**：

- Database Name 填 `xedit`，记下用户名/密码
- 不用暴露外部端口，应用走 Docker 内网连接
- 在服务详情页记下 **Internal Host**（形如 `项目名-postgres-xxxxx`）

### 2. 创建应用

**Create Service → Application**：

- **Source**：选 GitHub 仓库 `rotbit/xedit`、分支 `main`（首次需在 Dokploy 里安装 GitHub App 授权）
- **Build Type**：选 **Dockerfile**，路径默认 `./Dockerfile`

### 3. 填环境变量

应用 → **Environment**：

```env
DATABASE_URL=postgresql://<用户名>:<密码>@<Internal Host>:5432/xedit
AUTH_SECRET=<openssl rand -base64 32 生成>
AUTH_URL=https://你的域名
AUTH_GITHUB_ID=<可选>
AUTH_GITHUB_SECRET=<可选>
OSS_REGION=<可选>
OSS_ACCESS_KEY_ID=<可选>
OSS_ACCESS_KEY_SECRET=<可选>
OSS_BUCKET=<可选>
```

`NEXT_PUBLIC_SITE_URL` 要在 **Build → Build Args** 里加（构建期变量，填在 Environment 里不生效）：

```
NEXT_PUBLIC_SITE_URL=https://你的域名
```

### 4. 域名与部署

应用 → **Domains → Add Domain**：填域名、Container Port 填 `3000`、开启 HTTPS（Let's Encrypt 自动签发）。域名 DNS 先解析到服务器 IP。

点 **Deploy**。容器启动时自动跑数据库迁移。之后在应用设置里打开 **Auto Deploy / Webhook**，`git push` 到 `main` 即自动发布。

---

## 三、裸机 / PM2 部署

不想用 Docker 时：

```bash
# 前置：Node.js 20+、PostgreSQL 14+
git clone https://github.com/rotbit/xedit.git && cd xedit
npm ci

cp .env.example .env   # 填好 DATABASE_URL、AUTH_SECRET 等

npx prisma migrate deploy   # 建表
npm run build
npm run start               # 默认监听 3000
```

用 PM2 常驻：

```bash
npm i -g pm2
pm2 start npm --name xedit -- start
pm2 save && pm2 startup
```

前面再挂一层 Nginx 反代到 `127.0.0.1:3000`，注意透传 `X-Forwarded-Host` 与 `X-Forwarded-Proto`——MCP 的 OAuth 发现文档要靠它们算出公网 origin：

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

## 四、配置 GitHub / Google 登录

不配也能用——**邮箱 + 密码注册登录始终可用**，第三方登录填了对应变量才会出现在登录框里。

### GitHub

1. 打开 <https://github.com/settings/developers> → **New OAuth App**
2. Homepage URL：`https://你的域名`
3. **Authorization callback URL：`https://你的域名/api/auth/callback/github`**
4. 生成 Client Secret，把 ID / Secret 填入 `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET`，重启应用

### Google

1. 打开 <https://console.cloud.google.com> → APIs & Services → 凭据 → 创建 OAuth 客户端 ID（类型选「Web 应用」）
2. 已获授权的重定向 URI：`https://你的域名/api/auth/callback/google`
3. 填入 `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET`，重启应用

> 本地开发和线上建议各建一个 OAuth App，回调分别填 `http://localhost:3000/...` 和线上域名，互不干扰。

---

## 五、配置图床（阿里云 OSS）

不配也能用，只是编辑器里粘贴图片不会上传。

1. 创建 Bucket，读写权限选**公共读**
2. RAM 控制台创建子用户，**只授予该 Bucket 的 `PutObject` / `DeleteObject` 权限**，生成 AccessKey
3. 填入 `OSS_REGION`（如 `oss-cn-hangzhou`）、`OSS_ACCESS_KEY_ID`、`OSS_ACCESS_KEY_SECRET`、`OSS_BUCKET`
4. 有 CDN/自定义域名再填 `OSS_CDN_DOMAIN`（如 `https://img.example.com`）
5. 在 Bucket 的**跨域设置**里放行你的域名（来源填 `https://你的域名`，方法勾 `PUT`/`POST`/`GET`），否则前端直传会被浏览器拦

AccessKey 只存在服务端，上传经 `/api/upload` 中转，不会下发到浏览器。

---

## 六、域名与 HTTPS

- Docker Compose 部署建议前面挂 [Caddy](https://caddyserver.com) 或 Nginx + certbot 做 TLS 终止，反代到 `127.0.0.1:3000`
- Caddy 的话一行搞定自动证书：

  ```
  example.com {
      reverse_proxy 127.0.0.1:3000
  }
  ```

- Dokploy 用户直接在 Domains 里开 HTTPS 即可
- 上了域名后记得同步更新 `AUTH_URL`、`NEXT_PUBLIC_SITE_URL`（后者要重新构建）和 OAuth App 的回调地址

**MCP 需要 HTTPS**：Claude Desktop、Cursor 等客户端只接受 `https://` 的 MCP 服务器地址（`localhost` 除外）。

---

## 七、升级、备份与回滚

### 升级

```bash
cd xedit
git pull
docker compose up -d --build     # 启动时自动跑 prisma migrate deploy
```

数据库迁移由 `docker-entrypoint.sh` 在容器启动时执行，无需手动操作。裸机部署则是 `npm ci && npx prisma migrate deploy && npm run build && pm2 restart xedit`。

### 备份

数据全在 PostgreSQL 里（图片在你自己的 OSS）。定期备份：

```bash
# Docker Compose
docker compose exec -T db pg_dump -U xedit xedit | gzip > xedit-$(date +%F).sql.gz

# 恢复
gunzip -c xedit-2026-07-25.sql.gz | docker compose exec -T db psql -U xedit xedit
```

建议加进 crontab 每日跑一次，并把备份文件同步到异地。

### 回滚

```bash
git checkout <上一个可用的 commit>
docker compose up -d --build
```

⚠️ 迁移是**向前**的：如果新版本改了表结构，回滚代码不会自动回滚数据库。跨版本回滚前先恢复对应时间点的数据库备份。

---

## 八、常见问题

**启动报 `缺少 AUTH_SECRET`**
没设 `AUTH_SECRET`。用 `openssl rand -base64 32` 生成一个填进去。注意：改了它会导致所有用户登录失效，且已存的 AI 平台密钥无法解密（除非单独设了 `AI_ENCRYPTION_KEY`）——生产环境定好就别再动。

**登录后一直跳回登录页 / 回调地址报错**
检查 `AUTH_URL` 是否等于实际访问的公网地址（含协议，不带结尾斜杠），以及 OAuth App 的回调地址是否是 `https://你的域名/api/auth/callback/github`。反代记得透传 `X-Forwarded-Proto`，否则会被当成 http。

**页面能开但数据库连不上**
Compose 里应用连的是服务名 `db` 而不是 `localhost`；Dokploy 里要用数据库服务的 **Internal Host**。检查 `DATABASE_URL` 里的密码有没有特殊字符需要 URL 编码（`@`、`/`、`#` 等要转义）。

**站点地图 / 分享卡片里还是 xedit.me 的域名**
`NEXT_PUBLIC_SITE_URL` 没在**构建期**传进去。Compose 用户执行 `docker compose up -d --build`，Dokploy 用户填在 Build Args 而非 Environment。

**MCP 客户端连不上**
见 [MCP 接入文档](./mcp.md) 的「排查」一节。多数是 HTTPS 没配好，或反代吃掉了 `X-Forwarded-Host`。

**粘贴图片没反应**
OSS 四个必填变量没配齐，或 Bucket 没开公共读、没配跨域。看应用日志里 `/api/upload` 的报错。

**想改默认排版主题**
`src/lib/themes/presets.ts` 里调整顺序，或改 `prisma/schema.prisma` 中 `UserSettings.themeId` 的 `@default`。
