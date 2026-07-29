<div align="center">

# xEdit

**Markdown 公众号排版工具 —— 左边写 Markdown，右边就是公众号里的样子，一键复制，样式不丢。**

[![License: MIT](https://img.shields.io/badge/License-MIT-000.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-000.svg)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-000.svg)](https://www.postgresql.org)

[在线体验](https://xedit.me) · [部署教程](./docs/deployment.md) · [MCP 接入](./docs/mcp.md) · [飞书导入](./docs/feishu-import.md)

</div>

---

微信公众号后台的编辑器会丢掉 `<style>`、`class` 和伪元素，导致大多数「排版工具」粘贴过去就散架。xEdit 在复制的那一刻把主题样式**逐条内联**到每个标签上，公众号后台、知乎编辑器直接 `⌘V`，标题、引用、代码块、表格、公式全都保持原样。

不登录也能用：全部排版、预览、复制、导出功能都在浏览器里跑，文稿存本地。登录之后才有云端同步、版本历史和图床。

## 功能

**排版与复制**

- **一键复制**：公众号模式（主题 CSS 全部内联，代码块空白转 `&nbsp;`/`<br>` 保住缩进）与知乎模式（公式转 eeimg、代码块交给知乎重新高亮）
- **13 套排版主题**：经典黑、微信绿、科技蓝、水墨、杂志风……选择器带真实样式缩略图和适用内容类型标签
- **6 套代码配色** + Mac 风格窗口装饰（三个圆点）
- **自定义 CSS**：叠加在主题之上，复制时一并内联
- **外链转脚注**：公众号正文不允许外链，自动转成「文字[n]」+ 文末参考链接，可开关
- **数学公式**：`$行内$` 与 `$$块级$$`，MathJax 渲染成 SVG 再复制，公众号不支持 MathML 也不变形
- **导出**：Markdown / 独立 HTML / 打印版 PDF / 整篇长图 PNG

**编辑体验**

- **双模编辑**：类 Obsidian 的 Live Preview（标题、加粗、代码、图片在编辑区里直接呈现排版），或左右分栏对照，随时切换
- CodeMirror 6 编辑器、双向同步滚动、格式化工具栏、大纲面板、手机预览模式、可拖拽分栏、字数与阅读时长统计

**文章管理**

- **多级分类树**：文章和分类都能拖着移动，全局搜索、右键菜单、回收站软删除可恢复
- **飞书知识库导入**：连接飞书账号后整库导入为文章，目录层级映射为分类、图片自动转存，重复同步只处理有改动的文档 → [使用指南](./docs/feishu-import.md)
- **版本历史**：自动快照 + 手动存档，点开任一版本即可看到与当前稿的逐行差异，一键回滚，回滚前自动备份现稿
- **图床**：截图粘贴、文件拖入自动上传到你自己的阿里云 OSS 并就地插入，素材库统一管理
- **写作统计**：热力图、趋势曲线、每日目标，累计字数喂养一只会进化的墨灵
- **本地优先**：断网照写，改动落本地镜像，联网自动补同步

**AI**

- **公众号内容审查**：按《微信公众平台运营规范》、推荐加热机制与广告法逐项体检——标题党、绝对化违禁词、合规风险，发之前先过一遍。自带 Key，支持 Replicate / Kimi / GLM / DeepSeek
- **MCP Server**：内置 MCP 服务端与自建 OAuth 2.1 授权，Claude Desktop、Cursor 等客户端授权后可直接列出、检索、新建、改写你的文章与图床 → [接入文档](./docs/mcp.md)

## 快速开始

前置依赖：**Node.js 20+**、**PostgreSQL 14+**。

```bash
# 1. 克隆并安装
git clone https://github.com/rotbit/xedit.git
cd xedit
npm install

# 2. 准备数据库（macOS 示例，其他平台装好 PostgreSQL 即可）
brew install postgresql@17 && brew services start postgresql@17
createdb xedit

# 3. 配置环境变量
cp .env.example .env
#    至少填 DATABASE_URL；AUTH_SECRET 用下面这行生成后填入
openssl rand -base64 32

# 4. 建表
npx prisma migrate dev

# 5. 启动
npm run dev
```

打开 <http://localhost:3000> 即可。不配置 GitHub/Google OAuth 与 OSS 也能跑——登录用邮箱密码注册即可，图片粘贴功能会静默跳过上传。

## 环境变量

完整清单见 [`.env.example`](./.env.example)，这里是速查：

| 变量 | 必填 | 说明 |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL 连接串，如 `postgresql://user:pass@localhost:5432/xedit` |
| `AUTH_SECRET` | ✅ | 会话与 MCP 令牌的签名密钥，`openssl rand -base64 32` 生成 |
| `AUTH_URL` | | 反代后建议显式指定，如 `https://example.com` |
| `NEXT_PUBLIC_SITE_URL` | | 公网地址，供 canonical / OG / sitemap 使用，不带结尾斜杠 |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | | 填了才出现 GitHub 登录 |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | | 填了才出现 Google 登录 |
| `OSS_REGION` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` | | 阿里云 OSS 图床，建议用仅授权该 Bucket 的 RAM 子账号 |
| `OSS_CDN_DOMAIN` | | 绑定的 CDN/自定义域名 |
| `AI_ENCRYPTION_KEY` | | AI 平台 Key 的加密主密钥，留空则从 `AUTH_SECRET` 派生 |
| `ADMIN_EMAILS` | | 超级管理员邮箱白名单（逗号分隔），填了才开放 `/admin` 管理后台 |
| `DEFAULT_STORAGE_QUOTA_MB` | | 每账号素材存储配额（MB），默认 10240（10GB）；后台可按账号单独调整 |

> **密钥安全**：所有密钥只存在服务端。图片上传经 `/api/upload` 中转，OSS AccessKey 不会下发到浏览器；用户填的 AI 平台 Key 经 AES-256-GCM 加密后入库，明文绝不落库。

## 部署

仓库自带 `Dockerfile`（Next.js standalone 产物，容器启动时自动执行 `prisma migrate deploy`）。

完整步骤见 **[部署教程](./docs/deployment.md)**，涵盖 Docker / Docker Compose、Dokploy 一键部署、域名与 HTTPS、生产环境 OAuth 配置和升级回滚。

## 技术栈

Next.js 16（App Router）· React 19 · TypeScript · Tailwind CSS v4 · CodeMirror 6 · markdown-it · highlight.js · MathJax（SVG）· DOMPurify · Auth.js v5 · Prisma + PostgreSQL · ali-oss · Zustand · MCP SDK

### 复制到公众号的原理

```
Markdown → markdown-it 渲染 → DOMPurify 消毒
        → 外链转脚注 → 代码块换行/空格转 <br>/&nbsp;
        → CSS 内联（浏览器 CSSOM 解析 + querySelectorAll 匹配，按特异性层叠）
        → 清理 class/id/data-* → 选区复制（text/html）
```

主题装饰全部使用真实元素（如标题里的 `span.prefix/.content/.suffix`）和 data URI 背景图，而非伪元素，保证粘贴到公众号后不丢样式。

## 目录结构

```
src/
├── app/                # 页面与 API 路由
│   ├── api/            # documents / categories / assets / settings / stats
│   │                   # upload / ai / auth / oauth / mcp
│   ├── edit/           # 编辑器页（/edit 本地稿，/edit/[id] 云端文章）
│   ├── oauth/          # MCP 客户端的授权同意页
│   └── page.tsx        # 落地页 + 工作台
├── components/         # 跨功能域的通用组件与弹窗
├── features/
│   ├── editor/         # 编辑器工具栏、导出、复制菜单
│   ├── landing/        # 落地页（服务端直出、可交互样机、SEO）
│   ├── stats/          # 写作统计与墨灵
│   └── workspace/      # 文章列表、分类树、拖拽、回收站
├── lib/
│   ├── markdown/       # markdown-it 配置与插件（公式、标题结构化等）
│   ├── themes/         # 排版主题（base + 13 套预设）与代码主题注册表
│   ├── copy/           # 样式内联器、公众号/知乎复制管线、剪贴板
│   ├── oauth/          # 自建 OAuth 2.1 授权服务器（AS + RS）
│   ├── ai/             # 平台目录、密钥加解密、服务端调用
│   └── export.ts       # MD / HTML / PDF / PNG 导出
├── store/              # Zustand 全局状态（含本地持久化）
└── auth.ts             # Auth.js 配置
prisma/                 # 数据模型与迁移
public/code-themes/     # highlight.js 代码主题 CSS
```

## 贡献

欢迎 Issue 与 PR。提 PR 前请确认 `npm run lint` 与 `npm run build` 通过。

新增排版主题：在 `src/lib/themes/presets.ts` 里照现有格式加一项即可，注意装饰元素不要用伪元素（公众号会丢弃）。

## License

[MIT](./LICENSE) © rotbit
