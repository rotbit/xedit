# MCP setup guide

xEdit has a built-in [MCP](https://modelcontextprotocol.io) (Model Context Protocol) server. Connect it to AI clients like Claude or Cursor, and you can have the AI read and write your document library and image hosting in plain language:

> "Find the Rust article I wrote last week, rewrite the intro, and save it back."
>
> "Create a new document in the 'AI Coding' category and write up what we just discussed as Markdown."
>
> "List the images in my image hosting and insert the third one after the second paragraph of the current document."

Authorization uses standard OAuth 2.1 — click Connect in your client and xEdit's authorization page opens automatically; sign in and click **Allow**. **You never have to generate or copy any keys by hand.**

- [Quick start](#quick-start)
- [Available tools](#available-tools)
- [Managing and revoking access](#managing-and-revoking-access)
- [Self-hosting notes](#self-hosting-notes)
- [Security](#security)
- [Troubleshooting](#troubleshooting)

---

## Quick start

The server URL is your site URL + `/api/mcp`:

```
https://xedit.me/api/mcp
```

If you self-host, use your own domain. After signing in to xEdit, you can copy this URL from **Settings**.

The transport is **Streamable HTTP** (SSE is not supported).

### Claude Desktop / Claude on the web

1. **Settings → Connectors → Add custom connector**
2. Set Name to `xEdit` and URL to `https://xedit.me/api/mcp`
3. After you click Add, xEdit's authorization page opens; sign in and click **Allow**
4. Back in the chat, xEdit's tools show up under the tools icon

### Claude Code

```bash
claude mcp add --transport http xedit https://xedit.me/api/mcp
```

You'll be prompted to authorize the first time a tool is called; follow the prompt to finish in the browser. You can also use the `/mcp` command to check the connection status or trigger authentication manually.

### Cursor

**Settings → MCP → Add new MCP server**, or edit `~/.cursor/mcp.json` directly:

```json
{
  "mcpServers": {
    "xedit": {
      "type": "http",
      "url": "https://xedit.me/api/mcp"
    }
  }
}
```

After saving, click connect on the MCP settings page and the browser opens the authorization page.

### Other clients

Any MCP client that supports **Streamable HTTP + OAuth 2.1 (with dynamic client registration)** will work. Just enter the server URL; the client discovers these endpoints on its own:

| Endpoint | Path |
| --- | --- |
| Protected resource metadata (RFC 9728) | `/.well-known/oauth-protected-resource` |
| Authorization server metadata (RFC 8414) | `/.well-known/oauth-authorization-server` |
| Dynamic client registration (RFC 7591) | `/api/oauth/register` |
| Authorization page | `/oauth/authorize` |
| Token exchange | `/api/oauth/token` |

Supported grant types: `authorization_code` (PKCE / S256 required) and `refresh_token`. Clients are treated as public clients with no `client_secret`. There is a single scope: `mcp:documents`.

---

## Available tools

### Documents

| Tool | Description |
| --- | --- |
| `list_documents` | List documents (most recently updated first). Filter by `category`, use `trash: true` for trash only; `limit` defaults to 50 |
| `search_documents` | Full-text search over titles and bodies (excluding trash), returning matching snippets |
| `get_document` | Get a document's full text (Markdown) by `id` |
| `create_document` | Create a document with optional `title` / `content` / `category`; returns the new document's id |
| `update_document` | Update the title/body/category; pass only the fields to change. **Body changes automatically keep a version snapshot** |
| `delete_document` | Soft delete by default (goes to the trash, recoverable); `hard: true` deletes permanently |

### Media library (images and videos)

| Tool | Description |
| --- | --- |
| `list_images` | List images and videos in the media library, with accessible URL, type and dimensions |
| `get_image` | Get a media item's URL by `id`; with `include_data: true` the image itself is returned too, so the model can "see" it (videos return only the URL) |
| `upload_image` | Upload an image. `url=` fetches and re-hosts from a URL (recommended), or `data=` passes base64. 10 MB limit; png/jpg/gif/webp/svg |
| `upload_video` | Upload a video; reference it in the body with image syntax `![caption](URL)` to render a player. `url=` fetches and re-hosts (recommended) or `data=` base64. 100 MB limit; mp4/webm/mov |
| `delete_image` | Delete from the media library (also deletes the OSS object); cannot be undone |

Media tools require Alibaba Cloud OSS to be configured on the server; otherwise they return an upload failure.

Every tool is strictly scoped to the user identity in the token — the AI can only see and change **your own** documents.

---

## Managing and revoking access

Sign in to xEdit → **Settings → Authorized Apps** to see every authorized client and when it was authorized. Click **Revoke** to remove one.

After revoking, that app has to go through authorization again; access tokens already issued expire **within 1 hour** (the access token TTL is 1 hour).

---

## Self-hosting notes

**HTTPS is required.** Claude Desktop, Cursor and similar clients only accept `https://` MCP server URLs (except `localhost`). Self-signed certificates won't work either — get a real one from Let's Encrypt.

**Your reverse proxy must forward the forwarding headers.** The server derives the public origin from `X-Forwarded-Host` / `X-Forwarded-Proto` to build endpoint URLs in the discovery documents and to bind the token audience. Without these two headers, clients receive an internal address like `http://localhost:3000` and authorization fails outright. See the [deployment guide](./deployment.md#3-bare-metal--pm2) for the Nginx config.

**`/.well-known/` must be reachable.** The two discovery documents are mapped to the real routes by rewrites in `next.config.ts`; don't intercept `/.well-known/` at the proxy for things like ACME challenges. Verify with:

```bash
curl -s https://your-domain/.well-known/oauth-protected-resource | jq
curl -s https://your-domain/.well-known/oauth-authorization-server | jq
```

**Don't change `AUTH_SECRET` casually.** The HS256 signing key for MCP tokens is derived from it; changing it immediately invalidates every issued token, and all clients have to reauthorize.

---

## Security

- **Access tokens are JWTs (HS256)**, expire after 1 hour, and are verified statelessly by the resource server without touching the database
- **Audience binding** (RFC 8707): the token hard-codes the target resource `https://your-domain/api/mcp`, so it can't be used anywhere else
- **Authorization codes are stored only as sha256**, expire after 5 minutes and are single-use — marked on use to prevent replay — and bound to the PKCE challenge, client_id and redirect URI (exact match, preventing open redirects)
- **Refresh tokens are stored only as sha256**, valid for 30 days, and rotated on every refresh, with the old token invalidated immediately
- **PKCE is mandatory** (S256 only); clients are treated as public clients and no `client_secret` is issued
- The authorization page requires signing in to xEdit and explicitly clicking **Allow** — there is no silent authorization

---

## Troubleshooting

**The client says "connection failed" or keeps spinning**

First make sure the discovery documents are reachable (the two `curl` commands above). A 404 means the rewrites aren't working; an `issuer` with an internal address means the proxy isn't forwarding the headers.

**The authorization page is a 404, or it hangs after redirecting to login**

`/oauth/authorize` requires a signed-in session. Sign in to xEdit normally in the browser once, then retry the connection.

**Authorization succeeds but tool calls report "unauthorized"**

Usually an audience mismatch: the server URL the client uses (e.g. with a trailing slash, or via an alias domain) doesn't match the resource URI bound in the token. Stick to one canonical domain and don't mix `www` with the bare domain.

**Tools are listed but calls fail**

Check the server logs. Errors from image hosting tools usually mean OSS isn't configured; "Document not found" from document tools means the id is wrong or the document doesn't belong to the authorized user.

**Everything broke after changing domains**

The token audience is bound to the old domain. Revoke all connections in Settings and reauthorize each client once.
