import { scryptSync } from "crypto";

/**
 * MCP 内置 OAuth 2.1 授权服务器（AS）+ 资源服务器（RS）的公共配置。
 * xedit 既是 RS（保护 /api/mcp），又是 AS（签发 access/refresh token）。
 */

export const OAUTH = {
  /** access token 有效期（秒）：短时，泄露影响小 */
  accessTokenTtl: 60 * 60, // 1h
  /** 授权码有效期（秒）：分钟级，用完即弃 */
  authCodeTtl: 5 * 60, // 5min
  /** 刷新令牌有效期（秒） */
  refreshTokenTtl: 60 * 60 * 24 * 30, // 30d
  /** 支持并默认授予的 scope（一个 scope 覆盖文档增删改查） */
  scopesSupported: ["mcp:documents"] as const,
} as const;

/** 默认授予的 scope 串（客户端未显式请求时用它） */
export const DEFAULT_SCOPE = OAUTH.scopesSupported.join(" ");

let jwtKeyCache: Uint8Array | null = null;

/** HS256 签名密钥：由 AUTH_SECRET 派生，稳定且不与其他用途共用同一派生串 */
export function jwtKey(): Uint8Array {
  if (jwtKeyCache) return jwtKeyCache;
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("缺少 AUTH_SECRET，无法签发 MCP access token");
  jwtKeyCache = new Uint8Array(scryptSync(secret, "xedit-oauth-jwt-v1", 32));
  return jwtKeyCache;
}

/**
 * 公网 origin：反向代理（Dokploy）后要认 X-Forwarded-*，否则会拿到内网 localhost:3000。
 * 与 next-auth 的 trustHost 行为一致。
 */
export function publicOrigin(req: Request): string {
  const h = req.headers;
  const xfHost = h.get("x-forwarded-host");
  if (xfHost) {
    const host = xfHost.split(",")[0].trim();
    const proto = (h.get("x-forwarded-proto")?.split(",")[0].trim()) || "https";
    return `${proto}://${host}`;
  }
  const host = h.get("host");
  if (host) {
    const isLocal = host.startsWith("localhost") || host.startsWith("127.0.0.1");
    return `${isLocal ? "http" : "https"}://${host}`;
  }
  return new URL(req.url).origin;
}

/** MCP 资源（RS）的规范 URI（RFC 8707），即 access token 的 audience */
export function mcpResourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

/** 校验 token 时可接受的 audience：规范 URI 与裸 origin 都认，兼容不同客户端 */
export function acceptedAudiences(origin: string): string[] {
  return [mcpResourceUrl(origin), origin];
}
