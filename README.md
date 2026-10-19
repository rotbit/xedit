<div align="center">

# xEdit

**A Markdown editor for WeChat Official Accounts — write Markdown on the left, see exactly how it will look on the right, and copy it over in one click with every style intact.**

[![License: MIT](https://img.shields.io/badge/License-MIT-000.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-000.svg)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-000.svg)](https://www.postgresql.org)

[Live demo](https://xedit.me) · [Deployment guide](./docs/deployment.md) · [MCP setup](./docs/mcp.md) · [Feishu import](./docs/feishu-import.md)

</div>

---

The WeChat Official Account editor strips `<style>`, `class` and pseudo-elements, which is why most formatting tools fall apart the moment you paste. xEdit **inlines every theme rule** onto each tag at copy time, so you can `⌘V` straight into the WeChat editor or Zhihu and keep your headings, blockquotes, code blocks, tables and math exactly as they look.

No account required: formatting, preview, copy and export all run in the browser, and documents are stored locally. Sign in to get cloud sync, version history and image hosting.

## Features

**Formatting and copy**

- **One-click copy**: WeChat mode (all theme CSS inlined; whitespace in code blocks converted to `&nbsp;`/`<br>` to preserve indentation) and Zhihu mode (math converted to eeimg, code blocks left to Zhihu to re-highlight)
- **13 themes**: Classic Black, WeChat Green, Tech Blue, Ink Wash, Magazine and more, with live-styled thumbnails and content-type tags in the picker
- **6 code color schemes** plus a Mac-style window frame (the three dots)
- **Custom CSS**: layered on top of the theme and inlined on copy
- **Links to footnotes**: WeChat articles don't allow external links, so they're turned into "text[n]" with a reference list at the end (optional)
- **Math**: `$inline$` and `$$block$$`, rendered by MathJax to SVG before copying, so it survives WeChat's lack of MathML support
- **Export**: Markdown / standalone HTML / print-ready PDF / full-length PNG image

**Editing**

- **Two editing modes**: Obsidian-style Live Preview (headings, bold, code and images render right in the editor) or a side-by-side split view — switch any time
- CodeMirror 6 editor, two-way scroll sync, formatting toolbar, outline panel, mobile preview, resizable panes, word count and reading time

**Document management**

- **Nested categories**: drag documents and categories around, global search, context menus, and a recoverable trash
- **Feishu Wiki import**: connect your Feishu account to import a whole wiki as documents, with its tree mapped to categories, images re-hosted automatically, and re-syncs that only touch changed pages → [Guide](./docs/feishu-import.md)
- **Version history**: automatic snapshots plus manual saves; open any version to see a line-by-line diff against the current draft and roll back in one click (the current draft is backed up first)
- **Image hosting**: paste screenshots or drop files to upload them to your own Alibaba Cloud OSS and insert them in place, all managed in a media library
- **Writing stats**: heatmap, trend chart and daily goals; your total word count feeds an evolving ink sprite
- **Local-first**: keep writing offline — changes land in a local mirror and sync automatically once you're back online

**AI**

- **WeChat content review**: checks your article against the WeChat Official Account platform rules, the recommendation algorithm and China's Advertising Law — clickbait titles, banned absolute claims, compliance risks — before you publish. Bring your own key; supports Replicate / Kimi / GLM / DeepSeek
- **MCP server**: a built-in MCP server with self-hosted OAuth 2.1, so clients like Claude Desktop and Cursor can list, search, create and edit your documents and images once authorized → [Setup guide](./docs/mcp.md)

## Quick start

Prerequisites: **Node.js 20+** and **PostgreSQL 14+**.

```bash
# 1. Clone and install
git clone https://github.com/rotbit/xedit.git
cd xedit
npm install

# 2. Set up the database (macOS example; on other platforms just install PostgreSQL)
brew install postgresql@17 && brew services start postgresql@17
createdb xedit

# 3. Configure environment variables
cp .env.example .env
#    At minimum set DATABASE_URL; generate AUTH_SECRET with the line below
openssl rand -base64 32

# 4. Create tables
npx prisma migrate dev

# 5. Start
npm run dev
```

Open <http://localhost:3000>. It runs without GitHub/Google OAuth or OSS configured — sign up with email and password, and image pasting will silently skip the upload.

## Environment variables

See [`.env.example`](./.env.example) for the full list. Quick reference:

| Variable | Required | Description |
| --- | :---: | --- |
| `DATABASE_URL` | ✅ | PostgreSQL connection string, e.g. `postgresql://user:pass@localhost:5432/xedit` |
| `AUTH_SECRET` | ✅ | Signing key for sessions and MCP tokens; generate with `openssl rand -base64 32` |
| `AUTH_URL` | | Recommended behind a reverse proxy, e.g. `https://example.com` |
| `NEXT_PUBLIC_SITE_URL` | | Public URL used for canonical / OG / sitemap, without a trailing slash |
| `AUTH_GITHUB_ID` / `AUTH_GITHUB_SECRET` | | Enables GitHub login when set |
| `AUTH_GOOGLE_ID` / `AUTH_GOOGLE_SECRET` | | Enables Google login when set |
| `AUTH_WECHAT_ENABLED` | | Explicit switch for WeChat login; set to `1` or `true` to enable |
| `AUTH_WECHAT_ID` / `AUTH_WECHAT_SECRET` | | AppID / AppSecret of a "Website App" on WeChat Open Platform; **requires a business-verified Open Platform account** |
| `OSS_REGION` / `OSS_ACCESS_KEY_ID` / `OSS_ACCESS_KEY_SECRET` / `OSS_BUCKET` | | Alibaba Cloud OSS image hosting; use a RAM sub-account scoped to that bucket only |
| `OSS_CDN_DOMAIN` | | Bound CDN / custom domain |
| `AI_ENCRYPTION_KEY` | | Master key for encrypting AI provider keys; derived from `AUTH_SECRET` if empty |
| `REPLICATE_API_TOKEN` | | Replicate token for AI-generated covers; enables the "AI Generate" tab. Billed to the site's account and limited to accounts in `ADMIN_EMAILS` |
| `REPLICATE_MODEL` | | Image model, defaults to `black-forest-labs/flux-schnell`; pin a version as `owner/name:version`. No need to check the model's inputs yourself: unsupported aspect ratios and optional fields are corrected from the upstream error and retried. **The prompt is a fixed template that asks for the Chinese title to be drawn into the image, so pick a model that renders Chinese text well** — the default `flux-schnell` doesn't and produces garbled characters |
| `REPLICATE_ASPECT_RATIO` | | Cover aspect ratio; empty = auto: tries `21:9` first, and falls back to the widest landscape ratio the model supports |
| `COVER_GENERATE_TIMEOUT_SEC` / `COVER_GENERATE_DAILY_LIMIT` | | Per-generation timeout (default 90 s) and generations per account per day (default 20) |
| `ADMIN_EMAILS` | | Comma-separated super-admin email allowlist; enables the `/admin` dashboard when set |
| `DEFAULT_STORAGE_QUOTA_MB` | | Per-account media storage quota in MB, default 10240 (10 GB); adjustable per account in the admin dashboard |

> **Key security**: all secrets stay on the server. Image uploads are proxied through `/api/upload`, so the OSS AccessKey never reaches the browser; user-supplied AI provider keys are encrypted with AES-256-GCM before being stored, and plaintext never hits the database.

## Deployment

The repo ships a `Dockerfile` (Next.js standalone output; `prisma migrate deploy` runs automatically when the container starts).

See the **[deployment guide](./docs/deployment.md)** for the full walkthrough: Docker / Docker Compose, one-click Dokploy, domains and HTTPS, production OAuth setup, and upgrades and rollbacks.

## Tech stack

Next.js 16 (App Router) · React 19 · TypeScript · Tailwind CSS v4 · CodeMirror 6 · markdown-it · highlight.js · MathJax (SVG) · DOMPurify · Auth.js v5 · Prisma + PostgreSQL · ali-oss · Zustand · MCP SDK

### How copying to WeChat works

```
Markdown → markdown-it render → DOMPurify sanitize
        → links to footnotes → code block newlines/spaces to <br>/&nbsp;
        → CSS inlining (browser CSSOM parsing + querySelectorAll matching, cascaded by specificity)
        → strip class/id/data-* → selection copy (text/html)
```

All theme decorations use real elements (such as `span.prefix/.content/.suffix` inside headings) and data URI background images rather than pseudo-elements, so nothing is lost when pasting into WeChat.

## Project structure

```
src/
├── app/                # Pages and API routes
│   ├── api/            # documents / categories / assets / settings / stats
│   │                   # upload / ai / auth / oauth / mcp
│   ├── edit/           # Editor page (/edit local draft, /edit/[id] cloud document)
│   ├── oauth/          # Consent page for MCP clients
│   └── page.tsx        # Landing page + workspace
├── components/         # Shared cross-feature components and dialogs
├── features/
│   ├── editor/         # Editor toolbar, export, copy menu
│   ├── landing/        # Landing page (server-rendered, interactive mockup, SEO)
│   ├── stats/          # Writing stats and the ink sprite
│   └── workspace/      # Document list, category tree, drag and drop, trash
├── lib/
│   ├── markdown/       # markdown-it config and plugins (math, structured headings, etc.)
│   ├── themes/         # Themes (base + 13 presets) and code theme registry
│   ├── copy/           # Style inliner, WeChat/Zhihu copy pipelines, clipboard
│   ├── oauth/          # Self-hosted OAuth 2.1 server (AS + RS)
│   ├── ai/             # Provider catalog, key encryption, server-side calls
│   └── export.ts       # MD / HTML / PDF / PNG export
├── store/              # Zustand global state (with local persistence)
└── auth.ts             # Auth.js config
prisma/                 # Data model and migrations
public/code-themes/     # highlight.js code theme CSS
```

## Contributing

Issues and PRs are welcome. Please make sure `npm run lint` and `npm run build` pass before opening a PR.

To add a theme, add an entry to `src/lib/themes/presets.ts` following the existing format. Don't use pseudo-elements for decorations — WeChat drops them.

## License

[MIT](./LICENSE) © rotbit
