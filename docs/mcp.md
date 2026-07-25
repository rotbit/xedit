# MCP 接入指南

xEdit 内置一个 [MCP](https://modelcontextprotocol.io)（Model Context Protocol）服务端。接进 Claude、Cursor 等 AI 客户端后，可以直接用自然语言让 AI 读写你的文章库和图床：

> 「把我上周写的那篇讲 Rust 的文章找出来，帮我改写开头，改完存回去。」
>
> 「用『AI 编程』分类新建一篇文章，把我们刚讨论的内容整理成 Markdown 写进去。」
>
> 「列一下我图床里的图片，把第三张插到当前文章的第二段后面。」

授权走标准 OAuth 2.1——在客户端里点「连接」会自动弹出 xEdit 的授权页，登录点「允许」即可，**全程不需要手动生成、复制任何密钥**。

- [快速接入](#快速接入)
- [可用工具](#可用工具)
- [管理与撤销授权](#管理与撤销授权)
- [自托管注意事项](#自托管注意事项)
- [安全设计](#安全设计)
- [排查](#排查)

---

## 快速接入

服务器地址就是你的站点地址 + `/api/mcp`：

```
https://xedit.me/api/mcp
```

自托管的话换成你自己的域名。登录 xEdit 后在 **设置 → MCP 连接** 里可以直接复制这个地址。

传输方式为 **Streamable HTTP**（不支持 SSE）。

### Claude Desktop / Claude 网页版

1. **Settings → Connectors → Add custom connector**
2. Name 填 `xEdit`，URL 填 `https://xedit.me/api/mcp`
3. 点添加后会弹出 xEdit 授权页，登录并点「允许」
4. 回到对话框，工具图标里就能看到 xEdit 的工具了

### Claude Code

```bash
claude mcp add --transport http xedit https://xedit.me/api/mcp
```

首次调用工具时会提示授权，按提示在浏览器里完成即可。也可以用 `/mcp` 命令查看连接状态、手动触发认证。

### Cursor

**Settings → MCP → Add new MCP server**，或直接编辑 `~/.cursor/mcp.json`：

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

保存后在 MCP 设置页点一下连接，浏览器会打开授权页。

### 其他客户端

任何支持 **Streamable HTTP + OAuth 2.1（含动态客户端注册）** 的 MCP 客户端都能接。填服务器地址即可，客户端会自己发现下面这些端点：

| 端点 | 地址 |
| --- | --- |
| 受保护资源元数据（RFC 9728） | `/.well-known/oauth-protected-resource` |
| 授权服务器元数据（RFC 8414） | `/.well-known/oauth-authorization-server` |
| 动态客户端注册（RFC 7591） | `/api/oauth/register` |
| 授权页 | `/oauth/authorize` |
| 换取令牌 | `/api/oauth/token` |

支持的 grant type：`authorization_code`（强制 PKCE / S256）与 `refresh_token`。客户端按公有客户端处理，无 `client_secret`。scope 只有一个：`mcp:documents`。

---

## 可用工具

### 文档

| 工具 | 说明 |
| --- | --- |
| `list_documents` | 列出文档（按更新时间倒序）。可按 `category` 过滤，`trash: true` 只看回收站，`limit` 默认 50 |
| `search_documents` | 在标题与正文中全文搜索（不含回收站），返回命中片段 |
| `get_document` | 按 `id` 取文档全文（Markdown） |
| `create_document` | 新建文档，可带 `title` / `content` / `category`，返回新文档 id |
| `update_document` | 更新标题/正文/分类，只传要改的字段。**正文变化会自动留一个版本快照** |
| `delete_document` | 默认软删除（进回收站可恢复）；`hard: true` 为永久删除 |

### 图床

| 工具 | 说明 |
| --- | --- |
| `list_images` | 列出图床里的图片，返回可访问 URL、类型、尺寸 |
| `get_image` | 按 `id` 取图片 URL；`include_data: true` 时连图片本体一起返回，供模型「看」图 |
| `upload_image` | 上传到图床。`url=` 从网址抓取转存（推荐），或 `data=` 传 base64。限 10MB，支持 png/jpg/gif/webp/svg |
| `delete_image` | 从图床删除（同时删 OSS 对象），不可恢复 |

图床相关工具需要服务端配好阿里云 OSS，否则会返回上传失败。

所有工具都严格按令牌里的用户身份隔离，AI 只能看到、改到**你自己**的文章。

---

## 管理与撤销授权

登录 xEdit → **设置 → MCP 连接**，可以看到所有已授权的客户端和授权时间，点「撤销」即可解除。

撤销后该应用需要重新走一遍授权；已经签发出去的访问令牌**最长 1 小时内**失效（access token TTL 就是 1 小时）。

---

## 自托管注意事项

**必须是 HTTPS。** Claude Desktop、Cursor 等客户端只接受 `https://` 的 MCP 服务器地址（`localhost` 除外），自签证书也不行，用 Let's Encrypt 签一个正式的。

**反向代理要透传转发头。** 服务端靠 `X-Forwarded-Host` / `X-Forwarded-Proto` 推算公网 origin，用来生成发现文档里的端点地址和绑定令牌的 audience。漏掉这两个头，客户端会拿到 `http://localhost:3000` 之类的内网地址，授权直接失败。Nginx 配置见[部署教程](./deployment.md#三裸机--pm2-部署)。

**`/.well-known/` 必须能访问到。** 两份发现文档由 `next.config.ts` 里的 rewrites 映射到实际路由，别在反代层把 `/.well-known/` 拦去做 ACME 校验之类的事。验证一下：

```bash
curl -s https://你的域名/.well-known/oauth-protected-resource | jq
curl -s https://你的域名/.well-known/oauth-authorization-server | jq
```

**别乱改 `AUTH_SECRET`。** MCP 令牌的 HS256 签名密钥由它派生，改了之后所有已签发的令牌立即失效，全部客户端都得重新授权。

---

## 安全设计

- **access token 是 JWT（HS256）**，1 小时过期，资源服务端无状态验签，不落库
- **audience 绑定**（RFC 8707）：令牌里写死目标资源 `https://你的域名/api/mcp`，拿到别处用不了
- **授权码只存 sha256**，5 分钟过期，一次性——用过即标记，禁止重放；绑定 PKCE challenge、client_id 与回调地址（精确匹配，防开放重定向）
- **刷新令牌只存 sha256**，30 天有效，每次刷新即轮换，旧令牌立刻作废
- **强制 PKCE**（仅 S256），客户端按公有客户端处理，不发 `client_secret`
- 授权页需要先登录 xEdit，并显式点「允许」，不会静默授权

---

## 排查

**客户端提示「连接失败」或一直转圈**

先确认发现文档能访问（上面那两条 `curl`）。返回 404 说明 rewrites 没生效；返回的 `issuer` 是内网地址说明反代没透传转发头。

**授权页打开是 404 或跳登录后就卡住**

`/oauth/authorize` 需要登录态。先在浏览器里正常登录一次 xEdit 再重试连接。

**授权成功但调用工具报「未授权」**

多半是 audience 对不上：客户端拿到的服务器地址（比如带了尾斜杠、或用了别名域名）与令牌里绑定的资源 URI 不一致。统一用一个规范域名访问，别混用 `www` 和裸域。

**工具能列出来但调用报错**

看服务端日志。图床类工具报错通常是 OSS 没配；文档类报「文档不存在」是 id 不对或该文档不属于当前授权用户。

**换了域名之后全部失效**

令牌的 audience 绑的是旧域名。到设置里撤销所有连接，客户端重新授权一次即可。
