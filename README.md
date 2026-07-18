# xEdit · Markdown 公众号排版工具

仿 [mdnice](https://editor.mdnice.com/) 的 Markdown 排版编辑器：左侧写 Markdown，右侧实时预览，一键复制到**微信公众号**或**知乎**，样式不丢。

## 功能

- **双栏编辑**：CodeMirror 6 编辑器 + 实时预览，双向同步滚动，格式化工具栏
- **一键复制**：单按钮选择平台——公众号（主题 CSS 全部内联，代码块空白转 `&nbsp;/<br>` 保住缩进）或知乎（公式转 eeimg、代码块由知乎重新高亮）
- **13 套排版主题**（选择器带真实样式缩略图与适用内容类型标签）；代码块统一 VS 2015 配色 + Mac 风格窗口，零配置
- **外链转脚注**：微信不允许外链，自动转成「文字[n]」+ 文末参考链接（可开关）
- **数学公式**：`$行内$` 与 `$$块级$$`，MathJax 渲染为 SVG，粘贴到公众号不变形
- **图床**：编辑器内粘贴/拖拽图片自动上传阿里云 OSS 并插入
- **云端同步**：GitHub 登录后多篇文章管理、自动保存（PostgreSQL）；未登录时保存在浏览器本地
- **版本历史**：自动保存每隔约 5 分钟留存快照（也可手动存档），随时一键回滚，回滚前自动备份当前内容
- **自定义 CSS**：叠加在主题之上，复制时一并内联
- **导出**：Markdown / 独立 HTML / PDF（打印）
- **AI 助手**：自带 Key 即用（OpenAI 兼容接口，支持 DeepSeek/通义/Ollama 等）——选中翻译中英互转、润色、AI 生成配图插入正文；Key 仅存浏览器本地
- **手机预览模式**、可拖拽分栏、字数统计、阅读时长
- **首页工作台**：`/` 为文章列表（未登录时是产品页 + 本地文稿入口），`/edit` 写本地文稿，`/edit/[id]` 编辑云端文章

## 本地启动

依赖：Node 20+、PostgreSQL 14+（本机通过 `brew install postgresql@17` 安装即可）。

```bash
# 1. 安装依赖
npm install

# 2. 准备数据库（首次）
brew services start postgresql@17
/opt/homebrew/opt/postgresql@17/bin/createdb xedit

# 3. 配置 .env（见下方说明），然后建表
npx prisma migrate dev

# 4. 启动
npm run dev
# 打开 http://localhost:3000
```

不配置 GitHub OAuth / OSS 也能用：编辑、预览、复制、导出都可离线工作，文稿保存在浏览器本地。

## 环境变量（.env）

| 变量 | 说明 |
| --- | --- |
| `DATABASE_URL` | PostgreSQL 连接串，如 `postgresql://用户名@localhost:5432/xedit` |
| `AUTH_SECRET` | `openssl rand -base64 32` 生成 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | GitHub OAuth App 凭据（启用登录与云端同步） |
| `OSS_REGION` | 如 `oss-cn-hangzhou` |
| `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` | 阿里云 AccessKey（建议用仅限该 Bucket 的 RAM 子账号） |
| `OSS_BUCKET` | Bucket 名称（需公共读） |
| `OSS_CDN_DOMAIN` | 可选，绑定的 CDN/自定义域名 |

### 创建 GitHub OAuth App

1. 打开 <https://github.com/settings/developers> → New OAuth App
2. Homepage URL 填 `http://localhost:3000`
3. **Authorization callback URL 填 `http://localhost:3000/api/auth/callback/github`**
4. 生成 Client Secret，把 ID/Secret 填入 `.env`，重启 dev server

部署到线上后把两个 URL 换成正式域名（回调路径不变）。

### 阿里云 OSS

1. 创建 Bucket（读写权限选「公共读」）
2. RAM 控制台创建子用户，授予该 Bucket 的 `PutObject` 权限，生成 AccessKey
3. 填入 `.env`，重启后登录即可在编辑器里粘贴图片自动上传

密钥只存在服务端，上传经由 `/api/upload` 中转，不会暴露到浏览器。


## 部署到 Dokploy

仓库自带 `Dockerfile`（Next.js standalone 产物，启动时自动执行 `prisma migrate deploy` 建表/迁移），Dokploy 直接识别即可。

### 1. 创建 PostgreSQL 服务

Dokploy 面板 → 你的 Project → **Create Service → Database → PostgreSQL**：
- Database Name：`xedit`，记下用户名/密码
- 无需暴露外部端口，应用走 Docker 内网连接

### 2. 创建应用

**Create Service → Application**：
- Source：选择 GitHub 仓库 `xedit`、分支 `main`（首次需在 Dokploy 里安装 GitHub App 授权）
- Build Type：**Dockerfile**（路径默认 `./Dockerfile`）

### 3. 配置环境变量（应用 → Environment）

```env
DATABASE_URL=postgresql://<用户名>:<密码>@<postgres服务名>:5432/xedit
AUTH_SECRET=<openssl rand -base64 32 重新生成一个>
AUTH_URL=https://你的域名
AUTH_GITHUB_ID=<生产环境 OAuth App 的 Client ID>
AUTH_GITHUB_SECRET=<生产环境 OAuth App 的 Secret>
OSS_REGION=oss-cn-hangzhou
OSS_ACCESS_KEY_ID=...
OSS_ACCESS_KEY_SECRET=...
OSS_BUCKET=...
OSS_CDN_DOMAIN=          # 可选
```

`<postgres服务名>` 在 Dokploy 数据库服务详情页可以看到（Internal Host）。

### 4. 域名与 HTTPS

应用 → **Domains → Add Domain**：填域名、Container Port 填 `3000`、开启 HTTPS（Let's Encrypt 自动签发）。域名 DNS 先解析到服务器 IP。

### 5. 生产环境 GitHub OAuth App

再建一个 OAuth App（与本地那个分开）：
- Homepage：`https://你的域名`
- Callback：`https://你的域名/api/auth/callback/github`

### 6. 部署

点 **Deploy**。容器启动时自动跑数据库迁移，之后每次 `git push` 到 main 可开启 Auto Deploy 自动发布（应用设置里打开 Webhook）。

## 技术栈

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · CodeMirror 6 · markdown-it · highlight.js · MathJax（SVG 公式）· DOMPurify · Auth.js (GitHub OAuth) · Prisma + PostgreSQL · ali-oss · Zustand

### 复制到公众号的原理

微信编辑器会丢弃 `<style>`、`class` 和伪元素，只保留内联 `style`。复制管线：

```
Markdown → markdown-it 渲染 → DOMPurify 消毒
        → 外链转脚注 → 代码块换行/空格转 <br>/&nbsp;
        → CSS 内联（浏览器 CSSOM 解析 + querySelectorAll 匹配，按特异性层叠）
        → 清理 class/id/data-* → 选区复制（text/html）
```

主题装饰全部使用真实元素（如标题里的 `span.prefix/.content/.suffix`）和 data URI 背景图，保证粘贴到公众号后不丢样式。

## 目录结构

```
src/
├── app/                # 页面与 API 路由（documents/settings/upload/auth/config）
├── components/         # Topbar/Sidebar/MarkdownEditor/Preview/StatusBar/弹窗等
├── hooks/              # useDocuments（云端同步）、useSyncScroll（同步滚动）
├── lib/
│   ├── markdown/       # markdown-it 配置、数学公式、标题结构化等插件
│   ├── themes/         # 排版主题（base + 12 套预设）与代码主题注册表
│   ├── copy/           # 样式内联器、公众号/知乎复制管线、剪贴板
│   └── export.ts       # MD/HTML/PDF 导出
├── store/              # Zustand 全局状态（含本地持久化）
└── auth.ts             # Auth.js 配置
prisma/schema.prisma    # User/Document/DocumentVersion/UserSettings 数据模型
public/code-themes/     # highlight.js 代码主题 CSS
```
