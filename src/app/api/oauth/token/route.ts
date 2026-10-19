/**
 * Token endpoint of the self-hosted authorization server, used with /api/oauth/authorize and /api/mcp.
 * All clients are public: no client_secret, so security rests on PKCE S256 checks and refresh token rotation.
 * Every response carries CORS headers (corsJson / oauthError / corsPreflight) because MCP clients call in directly from other origins.
 */
import { OAUTH, mcpResourceUrl, publicOrigin } from "@/lib/oauth/config";
import { corsJson, corsPreflight, oauthError, readCredentials } from "@/lib/oauth/http";
import {
  consumeAuthCode,
  getClient,
  issueRefreshToken,
  rotateRefreshToken,
  verifyPkceS256,
} from "@/lib/oauth/store";
import { signAccessToken } from "@/lib/oauth/token";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Issue a token set. A non-empty existingRefresh means the caller already rotated in a new refresh token, so reuse it;
 *  don't sign another here, or one refresh would leave two valid refresh tokens. */
async function issueTokens(
  origin: string,
  clientId: string,
  userId: string,
  scope: string,
  resource: string,
  existingRefresh?: string
): Promise<Response> {
  // Access tokens must be audience-bound (RFC 8707); if the client didn't pass resource, fall back to this site's MCP resource identifier
  const aud = resource || mcpResourceUrl(origin);
  const accessToken = await signAccessToken({ userId, clientId, scope, issuer: origin, resource: aud });
  const refreshToken =
    existingRefresh ?? (await issueRefreshToken({ clientId, userId, scope, resource: aud }));
  return corsJson({
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: OAUTH.accessTokenTtl,
    refresh_token: refreshToken,
    scope,
  });
}

// OAuth 2.1 token endpoint: authorization code exchange (PKCE enforced) and refresh token rotation. Public clients, no client_secret.
export async function POST(req: Request): Promise<Response> {
  const origin = publicOrigin(req);
  const form = await readCredentials(req);
  const grantType = form.get("grant_type") ?? "";
  const clientId = form.get("client_id") ?? "";

  // Client identity errors return 401 per the spec; other parameter errors use oauthError's default 400
  if (!clientId) return oauthError("invalid_client", "缺少 client_id", 401); // i18n-ignore
  const client = await getClient(clientId);
  if (!client) return oauthError("invalid_client", "客户端不存在", 401); // i18n-ignore

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const codeVerifier = form.get("code_verifier") ?? "";
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError("invalid_request", "缺少 code / redirect_uri / code_verifier"); // i18n-ignore
    }
    const consumed = await consumeAuthCode(code, clientId, redirectUri);
    if (!consumed) return oauthError("invalid_grant", "授权码无效、已过期或已被使用"); // i18n-ignore
    if (consumed.codeMethod !== "S256" || !verifyPkceS256(codeVerifier, consumed.codeChallenge)) {
      return oauthError("invalid_grant", "PKCE 校验失败"); // i18n-ignore
    }
    return issueTokens(origin, clientId, consumed.userId, consumed.scope, consumed.resource);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token") ?? "";
    if (!refreshToken) return oauthError("invalid_request", "缺少 refresh_token"); // i18n-ignore
    const rotated = await rotateRefreshToken(refreshToken, clientId);
    if (!rotated) return oauthError("invalid_grant", "刷新令牌无效或已失效"); // i18n-ignore
    return issueTokens(
      origin,
      clientId,
      rotated.userId,
      rotated.scope,
      rotated.resource,
      rotated.refreshToken
    );
  }

  return oauthError("unsupported_grant_type", `不支持的 grant_type: ${grantType}`); // i18n-ignore
}

/** CORS preflight. Without it, in-browser MCP clients can't even exchange tokens. */
export function OPTIONS(): Response {
  return corsPreflight();
}
