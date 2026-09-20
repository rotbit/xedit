# xEdit API 说明文档

> 依据当前仓库 Route Handler 整理，最后更新：2026-09-12。
> 本文描述现有实现，不承诺所有接口均为长期稳定的公共 API。

## 1. 基本约定

- Base URL：`https://<your-domain>`，本地开发通常为 `http://localhost:3000`。
- 除注册、分享批注、OAuth 发现/注册/换令牌和 MCP 外，接口通常依赖 xEdit 浏览器登录会话。
- 普通 REST 接口通过 NextAuth 会话 Cookie 鉴权，不支持直接使用 MCP Access Token。
- MCP 接口使用 OAuth 2.1 Bearer Token，传输协议为 Streamable HTTP。
- JSON 请求应带 `Content-Type: application/json`。
- 时间字段均为 ISO 8601 字符串，例如 `2026-09-12T08:00:00.000Z`。
- 成功写操作通常返回 `{ "ok": true }`，失败通常返回 `{ "error": "错误说明" }`。
- 被管理员设为只读的账号仍可读取和导出，但写入、上传等操作会返回 `403`。

常见状态码：

| 状态码 | 含义 |
| --- | --- |
| `200` | 请求成功 |
| `201` | OAuth 客户端注册成功 |
| `400` | 请求参数或业务状态不正确 |
| `401` | 未登录、会话失效或资源不属于当前用户 |
| `403` | 无权限、账号只读或功能未开放 |
| `404` | 资源不存在 |
| `409` | 资源冲突，例如飞书侧内容已更新 |
| `413` | 上传文件过大 |
| `415` | 不支持的媒体类型 |
| `429` | 分享批注数量已达上限 |
| `501` | 服务端未配置相关能力，例如 OSS |
| `502` | 上游媒体或 OSS 请求失败 |

## 2. 接口总览

### 2.1 账号与配置

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `POST` | `/api/register` | 公开 | 邮箱密码注册 |
| `GET/POST` | `/api/auth/*` | NextAuth | 登录、回调、会话等认证流程 |
| `GET` | `/api/config` | 公开 | 查询 OAuth、OSS 能力是否已配置 |
| `GET` | `/api/settings` | 登录 | 获取用户设置 |
| `PUT` | `/api/settings` | 登录、可写 | 更新用户设置 |
| `POST` | `/api/categories` | 登录、可写 | 重命名或删除分类树 |

### 2.2 文档与版本

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/documents` | 登录 | 文档列表、全量镜像或增量同步 |
| `POST` | `/api/documents` | 登录、可写 | 新建文档 |
| `GET` | `/api/documents/{id}` | 登录 | 获取文档全文 |
| `PUT` | `/api/documents/{id}` | 登录、可写 | 更新或恢复文档 |
| `DELETE` | `/api/documents/{id}` | 登录、可写 | 软删除或永久删除文档 |
| `GET` | `/api/documents/{id}/versions` | 登录 | 获取版本列表 |
| `POST` | `/api/documents/{id}/versions` | 登录、可写 | 创建版本快照 |
| `GET` | `/api/documents/{id}/versions/{versionId}` | 登录 | 获取版本全文 |
| `POST` | `/api/documents/{id}/versions/{versionId}` | 登录、可写 | 回滚到指定版本 |
| `DELETE` | `/api/documents/{id}/versions/{versionId}` | 登录、可写 | 删除指定版本 |

### 2.3 分享与批注

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/documents/{id}/share` | 作者登录 | 查询分享状态 |
| `POST` | `/api/documents/{id}/share` | 作者登录、可写 | 开启分享 |
| `PATCH` | `/api/documents/{id}/share` | 作者登录 | 关闭分享或修改批注开关 |
| `GET` | `/api/share/{token}/comments` | 公开 | 获取分享批注 |
| `POST` | `/api/share/{token}/comments` | 公开 | 新增批注或回复 |
| `PATCH` | `/api/share/{token}/comments/{cid}` | 作者或批注本人 | 销记或恢复批注 |
| `DELETE` | `/api/share/{token}/comments/{cid}` | 作者或批注本人 | 删除批注 |

### 2.4 素材与上传

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/assets` | 登录 | 获取素材列表 |
| `POST` | `/api/assets` | 管理员 | 把 OSS 历史对象补录到素材库 |
| `GET` | `/api/assets/{id}/usage` | 登录 | 查询引用素材的文档 |
| `DELETE` | `/api/assets/{id}` | 登录、可写 | 删除素材和对应 OSS 对象 |
| `POST` | `/api/upload/direct` | 登录、可写 | 获取 OSS 直传签名 |
| `PUT` | `/api/upload/direct` | 登录、可写 | 确认直传并登记素材 |
| `POST` | `/api/upload` | 登录、可写 | 服务端中转上传图片 |
| `GET` | `/api/export/media` | 登录 | 代理读取本站图床图片 |

### 2.5 飞书知识库

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/feishu/connection` | 登录 | 查询飞书连接状态 |
| `PUT` | `/api/feishu/connection` | 登录、可写 | 保存飞书应用凭证 |
| `DELETE` | `/api/feishu/connection` | 登录 | 断开飞书用户授权 |
| `GET` | `/api/feishu/authorize` | 登录 | 跳转至飞书 OAuth 授权页 |
| `GET` | `/api/feishu/callback` | OAuth 回调 | 接收飞书授权结果 |
| `GET` | `/api/feishu/spaces` | 登录 | 获取可访问的知识空间 |
| `POST` | `/api/feishu/sync` | 登录、可写 | 分批同步飞书知识库到 xEdit |
| `POST` | `/api/feishu/push` | 登录、可写 | 推送 xEdit 文档到飞书 |

### 2.6 MCP 与 OAuth 2.1

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/.well-known/oauth-protected-resource` | 公开 | 受保护资源元数据 |
| `GET` | `/.well-known/oauth-authorization-server` | 公开 | OAuth 授权服务器元数据 |
| `POST` | `/api/oauth/register` | 公开 | 动态注册 OAuth 公有客户端 |
| `GET` | `/oauth/authorize` | 登录 | 用户授权页，强制 PKCE S256 |
| `POST` | `/api/oauth/token` | 公开 | 授权码换令牌或刷新令牌 |
| `GET` | `/api/oauth/connections` | 登录 | 查询当前用户已授权的 MCP 客户端 |
| `DELETE` | `/api/oauth/connections` | 登录 | 撤销指定 MCP 客户端的刷新令牌 |
| `GET/POST/DELETE` | `/api/mcp` | Bearer Token | MCP Streamable HTTP 会话入口 |

### 2.7 管理后台

| 方法 | 路径 | 鉴权 | 说明 |
| --- | --- | --- | --- |
| `GET` | `/api/admin/overview` | 管理员 | 全站用户、文档、素材概览 |
| `GET` | `/api/admin/dau` | 管理员 | 日、周、月活跃用户曲线 |
| `GET` | `/api/admin/users` | 管理员 | 分页查询用户 |
| `GET` | `/api/admin/users/{id}` | 管理员 | 获取用户详情 |
| `PATCH` | `/api/admin/users/{id}` | 管理员 | 封禁、解封或调整存储配额 |
| `DELETE` | `/api/admin/users/{id}` | 管理员 | 删除用户及关联数据 |

## 3. 核心接口

### 3.1 注册账号

`POST /api/register`

请求：

```json
{
  "email": "user@example.com",
  "password": "your-password",
  "name": "张三"
}
```

规则：邮箱需合法；密码长度为 8～200；名称最多 40 个字符。注册成功后，客户端仍需通过 NextAuth
credentials 流程登录以获得会话。

成功响应：

```json
{ "ok": true }
```

### 3.2 查询文档列表

`GET /api/documents`

查询参数：

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `trash` | `0 \| 1` | `1` 仅查询回收站，默认查询未删除文档 |
| `full` | `0 \| 1` | `1` 返回正文，供本地全量镜像使用 |
| `since` | ISO 8601 | 返回该时间点及之后变化的文档，优先级高于 `full` |

默认响应不返回正文：

```json
[
  {
    "id": "cm123",
    "title": "API 设计笔记",
    "category": "技术/后端",
    "updatedAt": "2026-09-12T08:00:00.000Z",
    "excerpt": "这是一段去除 Markdown 标记后的摘要……",
    "chars": 1280
  }
]
```

`full=1` 响应：

```json
[
  {
    "id": "cm123",
    "title": "API 设计笔记",
    "category": "技术/后端",
    "content": "# API 设计笔记\n",
    "updatedAt": "2026-09-12T08:00:00.000Z"
  }
]
```

`since=<ISO>` 响应同时提供变化文档和当前未删除文档 ID，用于客户端对账：

```json
{
  "docs": [
    {
      "id": "cm123",
      "title": "API 设计笔记",
      "category": "技术/后端",
      "content": "# API 设计笔记\n",
      "deletedAt": null,
      "updatedAt": "2026-09-12T08:00:00.000Z"
    }
  ],
  "ids": ["cm123", "cm456"]
}
```

### 3.3 新建文档

`POST /api/documents`

```json
{
  "title": "新文章",
  "content": "# 正文",
  "category": "未分类"
}
```

- `title` 可选，最多 200 个字符，默认为“未命名文章”。
- `content` 可选，必须为字符串，默认为空字符串。
- `category` 可选，最多 100 个字符，默认为“未分类”。
- 响应为创建后的完整文档对象。

### 3.4 获取、更新与删除文档

#### 获取文档

`GET /api/documents/{id}` 返回包含 `id`、`title`、`content`、`category`、`createdAt`、`updatedAt`
等字段的完整文档对象。回收站中的文档按不存在处理。

#### 更新文档

`PUT /api/documents/{id}`

```json
{
  "title": "修改后的标题",
  "content": "# 修改后的正文",
  "category": "技术/前端"
}
```

只传需要修改的字段。正文变化会触发自动版本快照，并记录当日保存次数和净增字数。

恢复回收站文档使用：

```json
{ "restore": true }
```

#### 删除文档

- `DELETE /api/documents/{id}`：软删除，移入回收站。
- `DELETE /api/documents/{id}?hard=1`：永久删除，不可恢复。

成功响应均为 `{ "ok": true }`。

### 3.5 分类批量操作

`POST /api/categories`

重命名分类及其全部子分类：

```json
{
  "action": "rename",
  "from": "旧分类",
  "to": "新分类"
}
```

删除分类树，并把其中的文档移至“未分类”：

```json
{
  "action": "remove",
  "from": "待删除分类"
}
```

分类路径使用 `/` 分层，例如 `技术/前端/React`。

### 3.6 文档版本

`GET /api/documents/{id}/versions` 返回不含正文的版本列表：

```json
[
  {
    "id": "version-id",
    "title": "文章标题",
    "kind": "manual",
    "createdAt": "2026-09-12T08:00:00.000Z",
    "chars": 1280
  }
]
```

版本类型：`auto` 自动留存、`manual` 手动存档、`restore` 回滚前备份。

- `POST /api/documents/{id}/versions`：创建手动版本。
- `POST /api/documents/{id}/versions`，请求 `{ "kind": "auto" }`：按空闲保存规则创建自动版本。
- `GET /api/documents/{id}/versions/{versionId}`：获取含正文的版本对象。
- `POST /api/documents/{id}/versions/{versionId}`：回滚；服务端会先备份当前内容。
- `DELETE /api/documents/{id}/versions/{versionId}`：删除版本。

### 3.7 用户设置

`PUT /api/settings` 接受以下可选字段：

```json
{
  "themeId": "classic",
  "codeThemeId": "github",
  "customCss": "",
  "macCode": true,
  "linkFootnote": true,
  "customThemes": [],
  "categories": ["工作", "技术/前端"],
  "sidebarOrder": {
    "items": { "": ["c:工作", "d:document-id"] },
    "cats": {},
    "docs": {}
  }
}
```

`GET /api/settings` 返回数据库中的设置对象。其中 `categories`、`sidebarOrder`、`customThemes` 当前为
JSON 字符串，调用方需要再次解析。

## 4. 分享与批注接口

### 4.1 开启与管理分享

`POST /api/documents/{id}/share`

```json
{ "allowComment": true }
```

成功响应：

```json
{
  "enabled": true,
  "allowComment": true,
  "token": "32位随机十六进制字符串",
  "commentCount": 3
}
```

- 首次开启或关闭后重开会生成新 token，旧链接立即失效。
- 已开启时重复调用保持原 token，接口具有幂等性。
- 当前分享默认永久有效，只能由作者手动关闭。

更新分享：

```http
PATCH /api/documents/{id}/share
Content-Type: application/json

{ "enabled": false }
```

或：

```json
{ "allowComment": false }
```

### 4.2 查询批注

`GET /api/share/{token}/comments`

访客可在请求头携带本地生成的随机身份 key：

```http
X-Guest-Key: <random-key>
```

服务端只使用 key 的哈希判断 `mine`，不会返回哈希值。

响应：

```json
[
  {
    "id": "comment-id",
    "parentId": null,
    "author": "访客",
    "isOwner": false,
    "mine": true,
    "anchorType": "text",
    "anchorText": "被选中的正文",
    "anchorPrefix": "锚点前文",
    "anchorIndex": 0,
    "body": "这里需要修改",
    "resolvedAt": null,
    "createdAt": "2026-09-12T08:00:00.000Z"
  }
]
```

### 4.3 新增批注或回复

`POST /api/share/{token}/comments`

新增顶级文本批注：

```json
{
  "author": "李四",
  "key": "browser-generated-random-key",
  "anchorType": "text",
  "anchorText": "被选中的正文",
  "anchorPrefix": "锚点前文",
  "anchorIndex": 0,
  "body": "建议改得更简洁"
}
```

媒体批注把 `anchorType` 设为 `media`，并在 `anchorText` 中传媒体 URL。回复只需传 `parentId`、
`author`、`key` 和 `body`。约束如下：

- 批注正文最多 2,000 个字符。
- 访客名称最多 30 个字符。
- key 最多 64 个字符。
- 单个分享最多 1,000 条批注，包含回复。
- 回复只能挂在同一分享的顶级批注下。

### 4.4 销记与删除批注

销记或恢复顶级批注：

```http
PATCH /api/share/{token}/comments/{cid}
Content-Type: application/json

{ "resolved": true, "key": "browser-generated-random-key" }
```

删除批注：

```http
DELETE /api/share/{token}/comments/{cid}
X-Guest-Key: browser-generated-random-key
```

文档作者可操作该分享下的全部批注；访客只能凭原 key 操作自己的批注。删除顶级批注会连带删除回复。

## 5. 素材与上传接口

### 5.1 素材列表

`GET /api/assets`

- 不传 `limit`：返回完整素材数组，兼容旧调用方。
- 传 `limit`：启用游标分页，范围 1～100，默认 24。
- `cursor`：上一页响应中的 `nextCursor`。

分页响应：

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

### 5.2 OSS 浏览器直传

第一步，获取限时签名 URL：

```http
POST /api/upload/direct
Content-Type: application/json

{ "mime": "image/png", "size": 102400 }
```

响应：

```json
{
  "key": "xedit/2026/example.png",
  "uploadUrl": "https://signed-oss-url",
  "url": "https://cdn.example.com/xedit/2026/example.png"
}
```

第二步，客户端使用 `PUT` 把文件上传至 `uploadUrl`，并保持相同 `Content-Type`。

第三步，确认并登记素材：

```http
PUT /api/upload/direct
Content-Type: application/json

{ "key": "xedit/2026/example.png" }
```

服务端会通过 OSS HEAD 请求确认对象存在，并以真实类型和大小完成配额终检。

支持格式及限制：

| 类型 | MIME | 最大大小 |
| --- | --- | --- |
| 图片 | `image/png`、`image/jpeg`、`image/gif`、`image/webp`、`image/svg+xml` | 10 MB |
| 视频 | `video/mp4`、`video/webm`、`video/quicktime` | 100 MB |

### 5.3 服务端中转上传

`POST /api/upload`，请求类型为 `multipart/form-data`，文件字段名为 `file`。

```bash
curl -b cookies.txt \
  -F 'file=@./example.png' \
  'https://<your-domain>/api/upload'
```

该接口只支持不超过 10 MB 的图片。视频必须使用 OSS 浏览器直传。

### 5.4 素材引用和删除

- `GET /api/assets/{id}/usage` 返回 `{ "docs": [...] }`，最多列出 50 篇引用该对象 key 的文档。
- `DELETE /api/assets/{id}` 删除数据库索引并尝试删除 OSS 对象，不可恢复。
- `POST /api/assets` 仅供超级管理员迁移历史 OSS 对象使用，会把尚未入库的 `xedit/` 对象归属给
  当前管理员，不应作为普通同步接口调用。

## 6. 飞书知识库接口

### 6.1 保存与查询连接

`PUT /api/feishu/connection`

```json
{
  "appId": "cli_xxx",
  "appSecret": "your-app-secret"
}
```

更新 App ID 会清除旧 OAuth Token。前端若只修改 App ID 之外的设置，可把 `appSecret` 设为
`__keep__` 或省略，以保留已有 Secret。

`GET /api/feishu/connection` 响应：

```json
{
  "hasApp": true,
  "appId": "cli_xxx",
  "secretLast4": "1234",
  "connected": true,
  "feishuName": "张三",
  "spaceId": "space-id",
  "spaceName": "团队知识库",
  "lastSyncAt": "2026-09-12T08:00:00.000Z"
}
```

服务端不会返回完整 App Secret 或 Token。`DELETE /api/feishu/connection` 只清除用户授权 Token，
保留应用凭证和文档映射。

### 6.2 发起授权

- `GET /api/feishu/authorize`：请求只读同步权限。
- `GET /api/feishu/authorize?write=1`：额外请求文档写入权限。

接口返回 `302` 并跳转飞书授权页。`/api/feishu/callback` 是 OAuth 内部回调，不应由业务客户端主动调用。

### 6.3 获取知识空间

`GET /api/feishu/spaces`

```json
{
  "spaces": [
    { "id": "space-id", "name": "团队知识库" }
  ]
}
```

Token 需要重新授权时，错误响应会包含 `needReconnect: true`。

### 6.4 分批同步知识库

`POST /api/feishu/sync`

```json
{
  "spaceId": "space-id",
  "spaceName": "团队知识库",
  "skip": []
}
```

每次最多处理 5 篇且时间预算约 20 秒。客户端应循环调用，直到 `done=true`；把累计失败节点的
`nodeToken` 放入下一次请求的 `skip`，避免坏文档阻塞整轮同步。

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
    { "title": "项目说明", "action": "created" }
  ],
  "nextUp": ["下一篇文档"]
}
```

### 6.5 推送到飞书

`POST /api/feishu/push`

```json
{
  "documentId": "document-id",
  "force": false
}
```

成功响应：

```json
{ "ok": true, "action": "updated", "imageFailed": 0 }
```

特殊响应：

- `403 { "needWriteAuth": true }`：需要通过 `authorize?write=1` 补充写权限。
- `409 { "conflict": true }`：飞书侧已修改；确认覆盖后传 `force: true`。
- `400 { "error": "..." }`：文档、知识空间或内容不满足推送条件。

## 7. MCP 与 OAuth 2.1

MCP 服务地址：

```text
https://<your-domain>/api/mcp
```

OAuth 支持：

- `authorization_code`，强制 PKCE `S256`；
- `refresh_token`，每次刷新时轮换；
- 公有客户端，不发放 `client_secret`；
- scope 固定为 `mcp:documents`；
- Access Token 有效期 1 小时，Refresh Token 有效期 30 天；
- Access Token 的 audience 绑定当前 MCP URL。

动态注册示例：

```http
POST /api/oauth/register
Content-Type: application/json

{
  "client_name": "My MCP Client",
  "redirect_uris": ["http://127.0.0.1:3001/callback"]
}
```

换取令牌使用 `application/x-www-form-urlencoded`：

```text
grant_type=authorization_code
client_id=<client-id>
code=<authorization-code>
redirect_uri=<exact-redirect-uri>
code_verifier=<pkce-verifier>
```

刷新令牌：

```text
grant_type=refresh_token
client_id=<client-id>
refresh_token=<refresh-token>
```

MCP 暴露的工具：

| 工具 | 说明 |
| --- | --- |
| `list_documents` | 列出文档，可按分类或回收站过滤 |
| `search_documents` | 搜索标题和正文 |
| `get_document` | 获取 Markdown 全文 |
| `create_document` | 新建文档 |
| `update_document` | 更新标题、正文或分类 |
| `delete_document` | 软删除或永久删除文档 |
| `list_images` | 列出图片和视频素材 |
| `get_image` | 获取素材 URL，可选返回图片内容 |
| `upload_image` | 通过 URL 或 Base64 上传图片 |
| `upload_video` | 通过 URL 或 Base64 上传视频 |
| `delete_image` | 永久删除素材 |

更完整的客户端接入方式见 [MCP 接入指南](./mcp.md)。

## 8. 管理后台接口

管理员身份由服务端配置的管理员邮箱判断。无权限统一返回 `403`。

### 8.1 全站概览

`GET /api/admin/overview`

```json
{
  "users": { "total": 100, "banned": 2, "newThisWeek": 8 },
  "docs": { "total": 1500 },
  "assets": { "count": 300, "bytes": 104857600 }
}
```

### 8.2 DAU 曲线

`GET /api/admin/dau?g=day|week|month`

- `day`：近 30 天，默认值。
- `week`：近 12 周。
- `month`：近 12 个月。

```json
{
  "granularity": "day",
  "points": [
    { "key": "2026-09-12", "count": 42 }
  ]
}
```

### 8.3 用户列表

`GET /api/admin/users?q=<keyword>&page=1`

- `q` 按邮箱或昵称模糊搜索，最多 100 个字符。
- 每页固定 50 条。
- 响应含总数、默认配额，以及用户的文档数、素材数、存储用量、最近活跃日期和封禁状态。

### 8.4 用户详情和管理

`GET /api/admin/users/{id}` 返回用户基本信息、登录方式、统计数据，以及最多 100 篇文档和 200 个素材。

封禁或解封：

```http
PATCH /api/admin/users/{id}
Content-Type: application/json

{ "banned": true, "banReason": "违规原因" }
```

调整存储配额，单位为字节：

```json
{ "storageQuota": 10737418240 }
```

- `null`：恢复全局默认配额。
- `0`：不限制。
- 最大值：1 TB。

`DELETE /api/admin/users/{id}` 会删除用户及其文档、版本、设置、授权和素材索引，并尝试删除 OSS
素材。管理员账号不能被封禁或删除。

## 9. 调用示例

REST 接口依赖有效的浏览器会话 Cookie。以下示例假定 Cookie 已保存到 `cookies.txt`。

```bash
# 获取普通文档列表
curl -b cookies.txt 'https://<your-domain>/api/documents'

# 新建文档
curl -b cookies.txt \
  -H 'Content-Type: application/json' \
  -d '{"title":"示例","content":"# Hello","category":"演示"}' \
  'https://<your-domain>/api/documents'

# 更新正文
curl -b cookies.txt \
  -X PUT \
  -H 'Content-Type: application/json' \
  -d '{"content":"# Updated"}' \
  'https://<your-domain>/api/documents/<document-id>'
```

生产调用方不应依赖未在本文明确描述的内部字段；若要向第三方长期开放 REST API，建议在现有
Route Handler 之外增加版本化路径，例如 `/api/v1/*`，并补充稳定的 Token 鉴权、OpenAPI Schema
和兼容性策略。

## 10. 并发保护（新建去重与条件保存）

多端同时编辑同一篇文章时，后写的一方会整篇覆盖先写的一方。服务端为此提供两个**可选**
参数；不传时所有行为与历史版本完全一致，老客户端不受影响。

### 10.1 新建去重：`clientKey`

`POST /api/documents` 的请求体可带 `clientKey`（字符串，≤ 100 字符，同一账号下唯一）：

```json
{ "title": "示例", "content": "# Hello", "clientKey": "1a2b3c-离线新建的本地 id" }
```

- 带 `clientKey` 时接口是幂等的：服务端先按 `(userId, clientKey)` 查，已有就直接返回已存在的
  那篇（仍是 `200`，不会改写它），没有才创建。离线新建、弱网重试把同一条「新建」发好几遍，
  最终也只会落一篇。
- 并发重试同时落库时由唯一索引兜底，撞约束后服务端自行重查，调用方看到的仍是同一篇。
- 不传 `clientKey` 时行为不变，每次调用都新建一篇。

### 10.2 条件保存：`baseUpdatedAt`

`PUT /api/documents/{id}` 的请求体可带 `baseUpdatedAt`（ISO 时间串），表示「这次编辑基于服务端
哪一版」——通常就是上一次保存或拉取时服务端回的 `updatedAt`：

```json
{ "content": "# Updated", "baseUpdatedAt": "2026-09-18T03:00:00.000Z" }
```

- 服务端把版本比较和写入放在同一条 `UPDATE ... WHERE updatedAt = :base` 里完成，两台设备同时
  保存不会都成功。
- 写成功：`200`，`{ "ok": true, "updatedAt": "<服务端时间>" }`，客户端把这个时间存为下一次的
  `baseUpdatedAt`。
- 版本已被别处改写：`409`，附带服务端当前这一版，供客户端做合并后重新保存：

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

- 文档不存在或在回收站：`404`。`baseUpdatedAt` 给了却解析不出时间：`400`（不会退回无条件覆盖）。
- 不传 `baseUpdatedAt` 时是无条件覆盖，与历史行为一致。
- 从回收站恢复（`{ "restore": true }`）和版本回滚是显式的用户操作，不走条件判断。
- MCP 的 `update_document` 同样是显式的外部写入，不带版本条件；网页 / 桌面端下次校新会拉到
  这一版。
