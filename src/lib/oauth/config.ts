import { scryptSync } from "crypto";

/**
 * Shared config for the built-in MCP OAuth 2.1 authorization server (AS) + resource server (RS).
 * xedit is both the RS (protecting /api/mcp) and the AS (issuing access/refresh tokens).
 */

export const OAUTH = {
  /** Access token lifetime (seconds): short, to limit leak impact */
  accessTokenTtl: 60 * 60, // 1h
  /** Authorization code lifetime (seconds): minutes, single use */
  authCodeTtl: 5 * 60, // 5min
  /** Refresh token lifetime (seconds) */
  refreshTokenTtl: 60 * 60 * 24 * 30, // 30d
  /** Supported and default-granted scope (one scope covers document CRUD) */
  scopesSupported: ["mcp:documents"] as const,
} as const;

/** Default granted scope string (used when the client doesn't request one explicitly) */
export const DEFAULT_SCOPE = OAUTH.scopesSupported.join(" ");

let jwtKeyCache: Uint8Array | null = null;

/** HS256 signing key: derived from AUTH_SECRET, stable and not sharing a derivation string with other uses */
export function jwtKey(): Uint8Array {
  if (jwtKeyCache) return jwtKeyCache;
  const secret = process.env.AUTH_SECRET;
  if (!secret) throw new Error("缺少 AUTH_SECRET，无法签发 MCP access token"); // i18n-ignore deployment misconfiguration, meant for ops
  jwtKeyCache = new Uint8Array(scryptSync(secret, "xedit-oauth-jwt-v1", 32));
  return jwtKeyCache;
}

/**
 * Public origin: behind a reverse proxy (Dokploy) we must honor X-Forwarded-*, or we'd get the internal localhost:3000.
 * Matches next-auth's trustHost behavior.
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

/** Canonical URI of the MCP resource (RS) per RFC 8707, i.e. the access token audience */
export function mcpResourceUrl(origin: string): string {
  return `${origin}/api/mcp`;
}

/** Audiences accepted when verifying tokens: both the canonical URI and bare origin, for client compatibility */
export function acceptedAudiences(origin: string): string[] {
  return [mcpResourceUrl(origin), origin];
}
