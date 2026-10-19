# xEdit API Reference

> Compiled from the Route Handlers in the current repository. Last updated: 2026-09-12.
> This document describes the current implementation and does not guarantee that every endpoint is a long-term stable public API.

## 1. Conventions

- Base URL: `https://<your-domain>`; for local development, usually `http://localhost:3000`.
- Except for registration, share comments, OAuth discovery/registration/token exchange, and MCP, endpoints generally require an xEdit browser login session.
- Regular REST endpoints authenticate via the NextAuth session cookie; MCP access tokens are not accepted.
- The MCP endpoint uses OAuth 2.1 Bearer tokens over the Streamable HTTP transport.
- JSON requests should send `Content-Type: application/json`.
- All timestamps are ISO 8601 strings, e.g. `2026-09-12T08:00:00.000Z`.
- Successful writes usually return `{ "ok": true }`; failures usually return `{ "error": "error description" }`.
- Accounts set to read-only by an admin can still read and export, but writes, uploads, and similar operations return `403`.

Common status codes:

| Status | Meaning |
| --- | --- |
| `200` | Success |
| `201` | OAuth client registered |
| `400` | Invalid parameters or business state |
| `401` | Not logged in, session expired, or the resource does not belong to the current user |
| `403` | Forbidden, account read-only, or feature not enabled |
| `404` | Resource not found |
| `409` | Resource conflict, e.g. the content was updated on the Feishu side |
| `413` | Uploaded file too large |
| `415` | Unsupported media type |
| `429` | Share comment limit reached |
| `501` | Capability not configured on the server, e.g. OSS |
| `502` | Upstream media or OSS request failed |

## 2. Endpoint Overview

### 2.1 Account and Configuration

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `POST` | `/api/register` | Public | Register with email and password |
| `GET/POST` | `/api/auth/*` | NextAuth | Sign-in, callback, session, and other auth flows |
| `GET` | `/api/config` | Public | Check whether OAuth and OSS are configured |
| `GET` | `/api/settings` | Logged in | Get user settings |
| `PUT` | `/api/settings` | Logged in, writable | Update user settings |
| `POST` | `/api/categories` | Logged in, writable | Rename or delete a category tree |

### 2.2 Documents and Versions

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/documents` | Logged in | Document list, full mirror, or incremental sync |
| `POST` | `/api/documents` | Logged in, writable | Create a document |
| `GET` | `/api/documents/{id}` | Logged in | Get a full document |
| `PUT` | `/api/documents/{id}` | Logged in, writable | Update or restore a document |
| `DELETE` | `/api/documents/{id}` | Logged in, writable | Soft-delete or permanently delete a document |
| `GET` | `/api/documents/{id}/versions` | Logged in | List versions |
| `POST` | `/api/documents/{id}/versions` | Logged in, writable | Create a version snapshot |
| `GET` | `/api/documents/{id}/versions/{versionId}` | Logged in | Get a full version |
| `POST` | `/api/documents/{id}/versions/{versionId}` | Logged in, writable | Roll back to a version |
| `DELETE` | `/api/documents/{id}/versions/{versionId}` | Logged in, writable | Delete a version |

### 2.3 Sharing and Comments

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/documents/{id}/share` | Author logged in | Get share status |
| `POST` | `/api/documents/{id}/share` | Author logged in, writable | Enable sharing |
| `PATCH` | `/api/documents/{id}/share` | Author logged in | Disable sharing or toggle comments |
| `GET` | `/api/share/{token}/comments` | Public | Get share comments |
| `POST` | `/api/share/{token}/comments` | Public | Add a comment or reply |
| `PATCH` | `/api/share/{token}/comments/{cid}` | Author or comment owner | Resolve or reopen a comment |
| `DELETE` | `/api/share/{token}/comments/{cid}` | Author or comment owner | Delete a comment |

### 2.4 Assets and Uploads

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/assets` | Logged in | List assets |
| `POST` | `/api/assets` | Admin | Backfill legacy OSS objects into the asset library |
| `GET` | `/api/assets/{id}/usage` | Logged in | Find documents that reference an asset |
| `DELETE` | `/api/assets/{id}` | Logged in, writable | Delete an asset and its OSS object |
| `POST` | `/api/upload/direct` | Logged in, writable | Get a signature for direct OSS upload |
| `PUT` | `/api/upload/direct` | Logged in, writable | Confirm a direct upload and register the asset |
| `POST` | `/api/upload` | Logged in, writable | Upload an image via the server |
| `GET` | `/api/export/media` | Logged in | Proxy images from this site's image hosting |

### 2.5 Feishu Wiki

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/feishu/connection` | Logged in | Get Feishu connection status |
| `PUT` | `/api/feishu/connection` | Logged in, writable | Save Feishu app credentials |
| `DELETE` | `/api/feishu/connection` | Logged in | Revoke Feishu user authorization |
| `GET` | `/api/feishu/authorize` | Logged in | Redirect to the Feishu OAuth consent page |
| `GET` | `/api/feishu/callback` | OAuth callback | Receive the Feishu authorization result |
| `GET` | `/api/feishu/spaces` | Logged in | List accessible wiki spaces |
| `POST` | `/api/feishu/sync` | Logged in, writable | Sync a Feishu wiki into xEdit in batches |
| `POST` | `/api/feishu/push` | Logged in, writable | Push an xEdit document to Feishu |

### 2.6 MCP and OAuth 2.1

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/.well-known/oauth-protected-resource` | Public | Protected resource metadata |
| `GET` | `/.well-known/oauth-authorization-server` | Public | OAuth authorization server metadata |
| `POST` | `/api/oauth/register` | Public | Dynamically register a public OAuth client |
| `GET` | `/oauth/authorize` | Logged in | User consent page; PKCE S256 required |
| `POST` | `/api/oauth/token` | Public | Exchange an authorization code or refresh a token |
| `GET` | `/api/oauth/connections` | Logged in | List MCP clients the current user has authorized |
| `DELETE` | `/api/oauth/connections` | Logged in | Revoke the refresh tokens of an MCP client |
| `GET/POST/DELETE` | `/api/mcp` | Bearer token | MCP Streamable HTTP session endpoint |

### 2.7 Admin

| Method | Path | Auth | Description |
| --- | --- | --- | --- |
| `GET` | `/api/admin/overview` | Admin | Site-wide overview of users, documents, and assets |
| `GET` | `/api/admin/dau` | Admin | Daily, weekly, and monthly active user charts |
| `GET` | `/api/admin/users` | Admin | Paginated user search |
| `GET` | `/api/admin/users/{id}` | Admin | Get user details |
| `PATCH` | `/api/admin/users/{id}` | Admin | Ban, unban, or adjust storage quota |
| `DELETE` | `/api/admin/users/{id}` | Admin | Delete a user and associated data |

## 3. Core Endpoints

### 3.1 Register

`POST /api/register`

Request:

```json
{
  "email": "user@example.com",
  "password": "your-password",
  "name": "Jane Doe"
}
```

Rules: the email must be valid; the password must be 8–200 characters; the name may be up to 40 characters. After registering, the client still needs to sign in through the NextAuth
credentials flow to obtain a session.

Success response:

```json
{ "ok": true }
```

### 3.2 List Documents

`GET /api/documents`

Query parameters:

| Parameter | Type | Description |
| --- | --- | --- |
| `trash` | `0 \| 1` | `1` returns only the trash; by default, non-deleted documents are returned |
| `full` | `0 \| 1` | `1` includes content, for full local mirroring |
| `since` | ISO 8601 | Returns documents changed at or after this time; takes precedence over `full` |

By default the response omits content:

```json
[
  {
    "id": "cm123",
    "title": "API design notes",
    "category": "Tech/Backend",
    "updatedAt": "2026-09-12T08:00:00.000Z",
    "excerpt": "A summary with Markdown syntax stripped...",
    "chars": 1280
  }
]
```

`full=1` response:

```json
[
  {
    "id": "cm123",
    "title": "API design notes",
    "category": "Tech/Backend",
    "content": "# API design notes\n",
    "updatedAt": "2026-09-12T08:00:00.000Z"
  }
]
```

The `since=<ISO>` response includes both the changed documents and the IDs of all current non-deleted documents, so the client can reconcile:

```json
{
  "docs": [
    {
      "id": "cm123",
      "title": "API design notes",
      "category": "Tech/Backend",
      "content": "# API design notes\n",
      "deletedAt": null,
      "updatedAt": "2026-09-12T08:00:00.000Z"
    }
  ],
  "ids": ["cm123", "cm456"]
}
```

### 3.3 Create a Document

`POST /api/documents`

```json
{
  "title": "New article",
  "content": "# Body",
  "category": "未分类"
}
```

- `title` is optional, up to 200 characters; defaults to `未命名文章` ("Untitled article").
- `content` is optional and must be a string; defaults to an empty string.
- `category` is optional, up to 100 characters; defaults to `未分类` ("Uncategorized"). Both defaults are reserved names stored as data; the UI translates them for display.
- The response is the full created document object.

### 3.4 Get, Update, and Delete a Document

#### Get a Document

`GET /api/documents/{id}` returns the full document object, including `id`, `title`, `content`, `category`, `createdAt`, `updatedAt`,
and other fields. Documents in the trash are treated as not found.

#### Update a Document

`PUT /api/documents/{id}`

```json
{
  "title": "Revised title",
  "content": "# Revised body",
  "category": "Tech/Frontend"
}
```

Send only the fields you want to change. A content change triggers an automatic version snapshot and records the day's save count and net characters added.

To restore a document from the trash:

```json
{ "restore": true }
```

#### Delete a Document

- `DELETE /api/documents/{id}`: soft delete; moves the document to the trash.
- `DELETE /api/documents/{id}?hard=1`: permanent delete; cannot be undone.

Both return `{ "ok": true }` on success.

### 3.5 Bulk Category Operations

`POST /api/categories`

Rename a category and all its subcategories:

```json
{
  "action": "rename",
  "from": "Old category",
  "to": "New category"
}
```

Delete a category tree and move its documents to `未分类` ("Uncategorized"):

```json
{
  "action": "remove",
  "from": "Category to delete"
}
```

Category paths use `/` as the level separator, e.g. `Tech/Frontend/React`.

### 3.6 Document Versions

`GET /api/documents/{id}/versions` returns the version list without content:

```json
[
  {
    "id": "version-id",
    "title": "Article title",
    "kind": "manual",
    "createdAt": "2026-09-12T08:00:00.000Z",
    "chars": 1280
  }
]
```

Version kinds: `auto` (automatic snapshot), `manual` (manual save), `restore` (backup taken before a rollback).

- `POST /api/documents/{id}/versions`: create a manual version.
- `POST /api/documents/{id}/versions` with `{ "kind": "auto" }`: create an automatic version according to the idle-save rules.
- `GET /api/documents/{id}/versions/{versionId}`: get the version object with content.
- `POST /api/documents/{id}/versions/{versionId}`: roll back; the server backs up the current content first.
- `DELETE /api/documents/{id}/versions/{versionId}`: delete the version.

### 3.7 User Settings

`PUT /api/settings` accepts the following optional fields:

```json
{
  "themeId": "classic",
  "codeThemeId": "github",
  "customCss": "",
  "macCode": true,
  "linkFootnote": true,
  "customThemes": [],
  "categories": ["Work", "Tech/Frontend"],
  "sidebarOrder": {
    "items": { "": ["c:Work", "d:document-id"] },
    "cats": {},
    "docs": {}
  }
}
```

`GET /api/settings` returns the settings object from the database. `categories`, `sidebarOrder`, and `customThemes` are currently
JSON strings that the caller must parse again.

## 4. Sharing and Comment Endpoints

### 4.1 Enable and Manage Sharing

`POST /api/documents/{id}/share`

```json
{ "allowComment": true }
```

Success response:

```json
{
  "enabled": true,
  "allowComment": true,
  "token": "32-character random hex string",
  "commentCount": 3
}
```

- Enabling for the first time, or re-enabling after disabling, generates a new token; the old link stops working immediately.
- Calling again while sharing is enabled keeps the existing token, so the endpoint is idempotent.
- Shares currently never expire and can only be disabled manually by the author.

Update sharing:

```http
PATCH /api/documents/{id}/share
Content-Type: application/json

{ "enabled": false }
```

Or:

```json
{ "allowComment": false }
```

### 4.2 Get Comments

`GET /api/share/{token}/comments`

Guests can send a locally generated random identity key in a request header:

```http
X-Guest-Key: <random-key>
```

The server uses only the hash of the key to determine `mine` and never returns the hash.

Response (`访客`, "Guest", is the default author name the server stores when none is given):

```json
[
  {
    "id": "comment-id",
    "parentId": null,
    "author": "访客",
    "isOwner": false,
    "mine": true,
    "anchorType": "text",
    "anchorText": "Selected text",
    "anchorPrefix": "Text before the anchor",
    "anchorIndex": 0,
    "body": "This needs a change",
    "resolvedAt": null,
    "createdAt": "2026-09-12T08:00:00.000Z"
  }
]
```

### 4.3 Add a Comment or Reply

`POST /api/share/{token}/comments`

Add a top-level text comment:

```json
{
  "author": "John Smith",
  "key": "browser-generated-random-key",
  "anchorType": "text",
  "anchorText": "Selected text",
  "anchorPrefix": "Text before the anchor",
  "anchorIndex": 0,
  "body": "Suggest making this more concise"
}
```

For a media comment, set `anchorType` to `media` and pass the media URL in `anchorText`. A reply only needs `parentId`,
`author`, `key`, and `body`. Constraints:

- Comment body: up to 2,000 characters.
- Guest name: up to 30 characters.
- Key: up to 64 characters.
- Up to 1,000 comments per share, including replies.
- Replies can only be attached to top-level comments in the same share.

### 4.4 Resolve and Delete Comments

Resolve or reopen a top-level comment:

```http
PATCH /api/share/{token}/comments/{cid}
Content-Type: application/json

{ "resolved": true, "key": "browser-generated-random-key" }
```

Delete a comment:

```http
DELETE /api/share/{token}/comments/{cid}
X-Guest-Key: browser-generated-random-key
```

The document author can act on every comment in the share; guests can act only on their own comments using the original key. Deleting a top-level comment also deletes its replies.

## 5. Asset and Upload Endpoints

### 5.1 List Assets

`GET /api/assets`

- Without `limit`: returns the full asset array, for compatibility with older callers.
- With `limit`: enables cursor pagination; range 1–100, default 24.
- `cursor`: the `nextCursor` from the previous page.

Paginated response:

```json
{
  "items": [
    {
      "id": "asset-id",
      "key": "xedit/2026/example.png",
      "url": "https://cdn.example.com/xedit/2026/example.png",
      "size": 102400,
      "mime": "image/png",
      "source": "upload",
      "createdAt": "2026-09-12T08:00:00.000Z"
    }
  ],
  "total": 1,
  "nextCursor": null
}
```

### 5.2 Direct Browser Upload to OSS

Step 1: get a time-limited signed URL:

```http
POST /api/upload/direct
Content-Type: application/json

{ "mime": "image/png", "size": 102400 }
```

Response:

```json
{
  "key": "xedit/2026/example.png",
  "uploadUrl": "https://signed-oss-url",
  "url": "https://cdn.example.com/xedit/2026/example.png"
}
```

Step 2: the client uploads the file to `uploadUrl` with `PUT`, using the same `Content-Type`.

Step 3: confirm and register the asset:

```http
PUT /api/upload/direct
Content-Type: application/json

{ "key": "xedit/2026/example.png" }
```

The server confirms the object exists with an OSS HEAD request and runs the final quota check against the actual type and size.

Supported formats and limits:

| Type | MIME | Max size |
| --- | --- | --- |
| Image | `image/png`, `image/jpeg`, `image/gif`, `image/webp`, `image/svg+xml` | 10 MB |
| Video | `video/mp4`, `video/webm`, `video/quicktime` | 100 MB |

### 5.3 Upload via the Server

`POST /api/upload`, with a `multipart/form-data` request whose file field is named `file`.

```bash
curl -b cookies.txt \
  -F 'file=@./example.png' \
  'https://<your-domain>/api/upload'
```

This endpoint only accepts images up to 10 MB. Videos must use direct browser upload to OSS.

### 5.4 Asset References and Deletion

- `GET /api/assets/{id}/usage` returns `{ "docs": [...] }`, listing up to 50 documents that reference the object key.
- `DELETE /api/assets/{id}` deletes the database index and attempts to delete the OSS object; this cannot be undone.
- `POST /api/assets` is only for super admins migrating legacy OSS objects. It assigns `xedit/` objects not yet in the database to
  the current admin and should not be used as a regular sync endpoint.

## 6. Feishu Wiki Endpoints

### 6.1 Save and Get the Connection

`PUT /api/feishu/connection`

```json
{
  "appId": "cli_xxx",
  "appSecret": "your-app-secret"
}
```

Changing the App ID clears the old OAuth token. If the frontend changes only settings other than the App ID, it can set `appSecret` to
`__keep__` or omit it to keep the existing secret.

`GET /api/feishu/connection` response:

```json
{
  "hasApp": true,
  "appId": "cli_xxx",
  "secretLast4": "1234",
  "connected": true,
  "feishuName": "Jane Doe",
  "spaceId": "space-id",
  "spaceName": "Team wiki",
  "lastSyncAt": "2026-09-12T08:00:00.000Z"
}
```

The server never returns the full App Secret or token. `DELETE /api/feishu/connection` clears only the user authorization token,
keeping the app credentials and document mappings.

### 6.2 Start Authorization

- `GET /api/feishu/authorize`: requests read-only sync permission.
- `GET /api/feishu/authorize?write=1`: additionally requests document write permission.

The endpoint returns `302` and redirects to the Feishu consent page. `/api/feishu/callback` is an internal OAuth callback and should not be called directly by clients.

### 6.3 List Wiki Spaces

`GET /api/feishu/spaces`

```json
{
  "spaces": [
    { "id": "space-id", "name": "Team wiki" }
  ]
}
```

When the token needs re-authorization, the error response includes `needReconnect: true`.

### 6.4 Sync a Wiki in Batches

`POST /api/feishu/sync`

```json
{
  "spaceId": "space-id",
  "spaceName": "Team wiki",
  "skip": []
}
```

Each call processes at most 5 documents within a time budget of about 20 seconds. The client should keep calling until `done=true`, putting the
`nodeToken` of every node that has failed so far into `skip` on the next request, so a broken document does not block the whole sync.

```json
{
  "done": false,
  "total": 30,
  "pending": 20,
  "created": 3,
  "updated": 2,
  "skipped": 5,
  "unsupported": 1,
  "failed": [],
  "items": [
    { "title": "Project overview", "action": "created" }
  ],
  "nextUp": ["Next document"]
}
```

### 6.5 Push to Feishu

`POST /api/feishu/push`

```json
{
  "documentId": "document-id",
  "force": false
}
```

Success response:

```json
{ "ok": true, "action": "updated", "imageFailed": 0 }
```

Special responses:

- `403 { "needWriteAuth": true }`: write permission must be granted via `authorize?write=1`.
- `409 { "conflict": true }`: the document was modified on the Feishu side; pass `force: true` after confirming the overwrite.
- `400 { "error": "..." }`: the document, wiki space, or content does not meet the push requirements.

## 7. MCP and OAuth 2.1

MCP server URL:

```text
https://<your-domain>/api/mcp
```

OAuth support:

- `authorization_code`, with PKCE `S256` required;
- `refresh_token`, rotated on every refresh;
- public clients only; no `client_secret` is issued;
- scope is fixed to `mcp:documents`;
- access tokens are valid for 1 hour, refresh tokens for 30 days;
- the access token audience is bound to the current MCP URL.

Dynamic registration example:

```http
POST /api/oauth/register
Content-Type: application/json

{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://127.0.0.1:3001/callback"]
}
```

Token exchange uses `application/x-www-form-urlencoded`:

```text
grant_type=authorization_code
client_id=<client-id>
code=<authorization-code>
redirect_uri=<exact-redirect-uri>
code_verifier=<pkce-verifier>
```

Refresh a token:

```text
grant_type=refresh_token
client_id=<client-id>
refresh_token=<refresh-token>
```

Tools exposed over MCP:

| Tool | Description |
| --- | --- |
| `list_documents` | List documents, optionally filtered by category or trash |
| `search_documents` | Search titles and content |
| `get_document` | Get the full Markdown content |
| `create_document` | Create a document |
| `update_document` | Update the title, content, or category |
| `delete_document` | Soft-delete or permanently delete a document |
| `list_images` | List image and video assets |
| `get_image` | Get an asset URL, optionally with the image content |
| `upload_image` | Upload an image by URL or Base64 |
| `upload_video` | Upload a video by URL or Base64 |
| `delete_image` | Permanently delete an asset |

For full client setup, see the [MCP integration guide](./mcp.md).

## 8. Admin Endpoints

Admin status is determined by the admin emails configured on the server. Unauthorized requests always return `403`.

### 8.1 Site Overview

`GET /api/admin/overview`

```json
{
  "users": { "total": 100, "banned": 2, "newThisWeek": 8 },
  "docs": { "total": 1500 },
  "assets": { "count": 300, "bytes": 104857600 }
}
```

### 8.2 DAU Chart

`GET /api/admin/dau?g=day|week|month`

- `day`: last 30 days (default).
- `week`: last 12 weeks.
- `month`: last 12 months.

```json
{
  "granularity": "day",
  "points": [
    { "key": "2026-09-12", "count": 42 }
  ]
}
```

### 8.3 User List

`GET /api/admin/users?q=<keyword>&page=1`

- `q` fuzzy-matches email or nickname, up to 100 characters.
- Page size is fixed at 50.
- The response includes the total count, the default quota, and each user's document count, asset count, storage usage, last active date, and ban status.

### 8.4 User Details and Management

`GET /api/admin/users/{id}` returns the user's basic info, sign-in methods, and stats, plus up to 100 documents and 200 assets.

Ban or unban:

```http
PATCH /api/admin/users/{id}
Content-Type: application/json

{ "banned": true, "banReason": "Reason for the ban" }
```

Adjust the storage quota, in bytes:

```json
{ "storageQuota": 10737418240 }
```

- `null`: revert to the global default quota.
- `0`: unlimited.
- Maximum: 1 TB.

`DELETE /api/admin/users/{id}` deletes the user and their documents, versions, settings, authorizations, and asset index, and attempts to delete their OSS
assets. Admin accounts cannot be banned or deleted.

## 9. Examples

REST endpoints require a valid browser session cookie. The examples below assume the cookie is saved in `cookies.txt`.

```bash
# List documents
curl -b cookies.txt 'https://<your-domain>/api/documents'

# Create a document
curl -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"title":"Example","content":"# Hello","category":"Demo"}' \
  'https://<your-domain>/api/documents'

# Update content
curl -b cookies.txt \
  -X PUT \
  -H 'Content-Type: application/json' \
  -d '{"content":"# Updated"}' \
  'https://<your-domain>/api/documents/<document-id>'
```

Production callers should not rely on internal fields not explicitly described here. To offer the REST API to third parties long term, add versioned paths outside the existing
Route Handlers, e.g. `/api/v1/*`, along with stable token authentication, an OpenAPI schema,
and a compatibility policy.

## 10. Concurrency Protection (Create Deduplication and Conditional Saves)

When several clients edit the same article at once, the later write overwrites the earlier one in full. The server provides two **optional**
parameters for this; when omitted, behavior is identical to earlier versions and older clients are unaffected.

### 10.1 Create Deduplication: `clientKey`

The `POST /api/documents` body may include `clientKey` (string, ≤ 100 characters, unique per account):

```json
{ "title": "Example", "content": "# Hello", "clientKey": "1a2b3c-local-id-created-offline" }
```

- With `clientKey`, the endpoint is idempotent: the server first looks up `(userId, clientKey)` and, if a match exists, returns that
  existing document (still `200`, without modifying it); otherwise it creates one. Even if offline creation or retries on a weak network send the same "create" several times,
  only one document is created.
- If concurrent retries hit the database at the same moment, a unique index catches it; on a constraint violation the server re-queries, so the caller still sees the same document.
- Without `clientKey`, behavior is unchanged: every call creates a new document.

### 10.2 Conditional Save: `baseUpdatedAt`

The `PUT /api/documents/{id}` body may include `baseUpdatedAt` (ISO timestamp string), indicating "which server version this edit is based on",
usually the `updatedAt` returned by the server on the last save or fetch:

```json
{ "content": "# Updated", "baseUpdatedAt": "2026-09-18T03:00:00.000Z" }
```

- The server performs the version check and the write in a single `UPDATE ... WHERE updatedAt = :base`, so two devices saving at the same
  time cannot both succeed.
- On success: `200`, `{ "ok": true, "updatedAt": "<server time>" }`; the client stores this time as the next
  `baseUpdatedAt`.
- If the version was overwritten elsewhere: `409`, with the server's current version attached so the client can merge and save again:

```json
{
  "ok": false,
  "conflict": true,
  "doc": {
    "id": "...",
    "title": "...",
    "category": "...",
    "content": "...",
    "updatedAt": "2026-09-18T03:00:05.000Z"
  }
}
```

- Document not found or in the trash: `404`. `baseUpdatedAt` provided but not parseable as a time: `400` (it does not fall back to an unconditional overwrite).
- Without `baseUpdatedAt`, the save is an unconditional overwrite, as before.
- Restoring from the trash (`{ "restore": true }`) and version rollbacks are explicit user actions and skip the condition check.
- MCP `update_document` is likewise an explicit external write without a version condition; the web and desktop clients pick up
  this version on their next refresh.
