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

async function issueTokens(
  origin: string,
  clientId: string,
  userId: string,
  scope: string,
  resource: string,
  existingRefresh?: string
): Promise<Response> {
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

// OAuth 2.1 token 端点：授权码兑换（强制 PKCE）与刷新令牌轮换。公有客户端，无 client_secret。
export async function POST(req: Request): Promise<Response> {
  const origin = publicOrigin(req);
  const form = await readCredentials(req);
  const grantType = form.get("grant_type") ?? "";
  const clientId = form.get("client_id") ?? "";

  if (!clientId) return oauthError("invalid_client", "缺少 client_id", 401);
  const client = await getClient(clientId);
  if (!client) return oauthError("invalid_client", "客户端不存在", 401);

  if (grantType === "authorization_code") {
    const code = form.get("code") ?? "";
    const redirectUri = form.get("redirect_uri") ?? "";
    const codeVerifier = form.get("code_verifier") ?? "";
    if (!code || !redirectUri || !codeVerifier) {
      return oauthError("invalid_request", "缺少 code / redirect_uri / code_verifier");
    }
    const consumed = await consumeAuthCode(code, clientId, redirectUri);
    if (!consumed) return oauthError("invalid_grant", "授权码无效、已过期或已被使用");
    if (consumed.codeMethod !== "S256" || !verifyPkceS256(codeVerifier, consumed.codeChallenge)) {
      return oauthError("invalid_grant", "PKCE 校验失败");
    }
    return issueTokens(origin, clientId, consumed.userId, consumed.scope, consumed.resource);
  }

  if (grantType === "refresh_token") {
    const refreshToken = form.get("refresh_token") ?? "";
    if (!refreshToken) return oauthError("invalid_request", "缺少 refresh_token");
    const rotated = await rotateRefreshToken(refreshToken, clientId);
    if (!rotated) return oauthError("invalid_grant", "刷新令牌无效或已失效");
    return issueTokens(
      origin,
      clientId,
      rotated.userId,
      rotated.scope,
      rotated.resource,
      rotated.refreshToken
    );
  }

  return oauthError("unsupported_grant_type", `不支持的 grant_type: ${grantType}`);
}

export function OPTIONS(): Response {
  return corsPreflight();
}
