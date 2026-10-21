<div align="center">

# xEdit

**A free, open-source Markdown editor and lightweight alternative to Notion and Obsidian for writing and personal notes — local files, a comfortable editor, and AI access over MCP.**

[![License: MIT](https://img.shields.io/badge/License-MIT-000.svg)](./LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-16-000.svg)](https://nextjs.org)
[![React](https://img.shields.io/badge/React-19-000.svg)](https://react.dev)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-14%2B-000.svg)](https://www.postgresql.org)

[Try it online](https://xedit.me) · [中文介绍](https://xedit.me) · [Deployment guide](./docs/deployment.md) · [MCP setup](./docs/mcp.md) · [Feishu import](./docs/feishu-import.md)

</div>

---

xEdit is a live-preview Markdown editor that runs in the browser (plus a Mac app). Notes are plain Markdown, linked with `[[wiki links]]`, organized with slash commands and drag-and-drop folders, and to-dos written anywhere roll up into a Today view. Keep notes in the browser, in a local folder of `.md` files, or sign in for cloud sync — and let AI clients like Claude read and write your notes through the built-in MCP server.

**No account required**: open [xedit.me](https://xedit.me) and start writing.

## Who it's for

- People who write articles, reports and reading notes in Markdown and want live preview without building a whole note system
- Anyone who wants free cloud sync and an instant web app — or no account at all, with files in their own folder
- People who want Claude and other MCP clients to search, organize and edit their notes
- Writers who publish to WeChat Official Accounts or Zhihu and want formatting that survives the paste

If you need databases, board views or real-time team editing, Notion is the better tool. If you rely on a backlinks panel, graph view or community plugins, stick with Obsidian. See the [comparison](#xedit-vs-obsidian-and-notion) below.

## Where your notes live

| Mode | When | Where the data is | Synced to the cloud? |
| --- | --- | --- | --- |
| **Browser storage** | Default when not signed in | This browser on this device; clearing site data deletes it | Uploaded to your account automatically once you sign in |
| **Local Markdown folder** | Not signed in, Chrome / Edge (File System Access API) | A folder on your disk, one `.md` file per note | **No** — never uploaded, even after you sign in; back it up your own way |
| **Cloud sync** | Signed in | The server is the source of truth; each device keeps an offline mirror | Yes — the same notes on the web, the Mac app and every device |

Version history, image uploads, share links and MCP access work on cloud notes only.

## What's free

xedit.me has no paid plan today, and you can self-host the whole thing under the MIT license.

- **Without an account**: every editing feature, browser or local-folder storage, export to Markdown / HTML / PDF / PNG / Word, and copy to WeChat / Zhihu
- **With a free account**: cloud sync of notes, folders, version history and images; share links with reader comments; MCP access. No device limit
- **Limits**: images up to 10 MB and videos up to 100 MB each; a per-account media storage quota (uploads stop when it's full, existing files stay); the latest 100 versions are kept per note
- **MCP**: connecting is free. Your AI client's own subscription or API usage is between you and that provider
- **AI review (beta)**: enabled per account with a daily cap. The model runs on the site's keys, so users don't bring their own; self-hosters configure providers in `/admin`

## Features

**Writing**

- **Two editing modes**: Obsidian-style Live Preview (headings, bold, code and images render in place; the line under the cursor shows its source) or a side-by-side split view — switch any time
- **Slash commands** for headings, callouts, tables, to-dos, code blocks, images and video; search in Chinese, pinyin or English
- **Obsidian-style callouts** (`> [!tip]`), YAML frontmatter, footnotes, heading folding, `$inline$` / `$$block$$` math (MathJax) and syntax-highlighted code

**Organizing**

- **`[[Wiki links]]`**: autocomplete by title, `[[title|alias]]`, and renaming a note updates every link to it (there's no backlinks panel or graph view yet)
- **To-dos and Today**: `- [ ]` with `@tomorrow`, `@10/20`, a date range or `@daily` rolls up into a Today view; checking an item there edits the source line
- **Nested folders** with drag-and-drop, global search (⌘O), context menus and a recoverable trash
- **Feishu Wiki import**: import a whole wiki as documents, with its tree mapped to folders and images re-hosted → [Guide](./docs/feishu-import.md)

**Sync and sharing**

- **Cloud sync and offline**: keep writing offline — changes land in a local mirror and sync once you're back online
- **Version history**: automatic snapshots plus manual saves, line-by-line diffs and one-click rollback (the current draft is backed up first)
- **Share links**: readers need no account and can comment on selected text, images or video; you reply on the shared page
- **Export**: Markdown / standalone HTML / print-ready PDF / full-length PNG / Word (keeps headings, lists, tables and images; imports into Feishu)
- **Image hosting**: paste or drop images and video to upload them to Alibaba Cloud OSS, managed in a media library
- **Mac app**: same account and data, persistent login, native menus and shortcuts, offline shell (macOS 12+, Apple Silicon; the installer isn't code-signed yet)

**AI**

- **MCP server**: built-in, with self-hosted OAuth 2.1 (dynamic client registration + PKCE), so Claude Desktop, Cursor and other clients can list, search, create and edit your documents and images once authorized; revoke access any time in Settings → [Setup guide](./docs/mcp.md)
- **AI review (beta)**: reads the whole piece and flags awkward sentences, wordiness, word choice, logic gaps and WeChat Official Account compliance risks, with each suggestion pinned to its sentence; accept or ignore in one click

**Use case: WeChat Official Accounts and Zhihu**

The WeChat editor strips `<style>`, `class` and pseudo-elements, which is why most formatting falls apart on paste. xEdit **inlines every theme rule** onto each tag at copy time, so you can `⌘V` straight into WeChat or Zhihu and keep headings, blockquotes, code blocks, tables and math intact.

- **13 layout themes** ([gallery](https://xedit.me/themes)), 6 code color schemes with an optional Mac-style window frame, and custom CSS layered on top
- **WeChat mode** inlines all CSS and preserves code indentation with `&nbsp;`/`<br>`; **Zhihu mode** converts math to images and leaves code highlighting to Zhihu
- **Links to footnotes**: external links become "text[n]" with a reference list, since WeChat articles don't allow them
- Math is rendered to SVG before copying, so it survives WeChat's lack of MathML support

## xEdit vs Obsidian and Notion

xEdit is a lightweight writing and notes tool, not a full replacement for either. This reflects what ships today:

| | xEdit | Obsidian | Notion |
| --- | --- | --- | --- |
| Price / source | Free, MIT open source | Free for personal use, closed source; Sync is paid | Free plan, paid tiers; closed source |
| Format | Plain Markdown | Local Markdown files | Cloud blocks; Markdown import/export |
| Local files | Local folder in Chrome / Edge (not cloud-synced) | Native local vault | Cloud-first |
| Cloud sync | Free with an account | Paid Sync or bring your own | Built in |
| Runs in the browser | Yes, plus a Mac app | No (desktop / mobile apps) | Yes, plus apps |
| `[[Wiki links]]` | Yes, with rename updates | Yes | Page links and @ mentions |
| Backlinks panel / graph view | Not yet | Yes | Backlinks yes, no graph |
| Databases | No (plain Markdown tables only) | Via Bases / plugins | Core feature |
| Plugins | None; Obsidian plugins don't work | Large ecosystem | Integrations |
| Real-time collaboration | No (share links with comments) | No | Yes |
| AI | Built-in MCP server | Community plugins | Notion AI and integrations |
| Mobile app | Not yet | iOS / Android | iOS / Android |

xEdit can open an existing Obsidian vault folder and edit its `.md` files, but Obsidian plugins, settings and canvases don't carry over. Obsidian and Notion details reflect their public feature sets as of October 2026.

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

> **Key security**: all secrets stay on the server. Image uploads are proxied through `/api/upload`, so the OSS AccessKey never reaches the browser; AI provider keys entered in the admin dashboard are encrypted with AES-256-GCM before being stored, and plaintext never hits the database.

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
