import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { OAUTH, jwtKey } from "./config";

/**
 * access token 用 JWT（HS256）表示，资源服务器无状态验签，不落库。
 * 撤销靠短 TTL；长效撤销通过刷新令牌轮换实现。
 */

export async function signAccessToken(params: {
  userId: string;
  clientId: string;
  scope: string;
  issuer: string;
  /** RFC 8707 目标资源，写入 aud */
  resource: string;
}): Promise<string> {
  return new SignJWT({ scope: params.scope, client_id: params.clientId })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setSubject(params.userId)
    .setIssuer(params.issuer)
    .setAudience(params.resource)
    .setIssuedAt()
    .setExpirationTime(`${OAUTH.accessTokenTtl}s`)
    .setJti(randomUUID())
    .sign(jwtKey());
}

export interface VerifiedToken {
  userId: string;
  clientId: string;
  scopes: string[];
  expiresAt?: number;
}

/**
 * 验签 + 校验 audience（token 必须是发给本 MCP 服务器的）+ 校验过期。
 * 任一环节不过一律返回 null，由调用方回 401。
 */
export async function verifyAccessToken(
  token: string,
  acceptedAudiences: string[]
): Promise<VerifiedToken | null> {
  try {
    const { payload } = await jwtVerify(token, jwtKey(), {
      audience: acceptedAudiences,
    });
    const userId = typeof payload.sub === "string" ? payload.sub : "";
    if (!userId) return null;
    const scope = typeof payload.scope === "string" ? payload.scope : "";
    return {
      userId,
      clientId: typeof payload.client_id === "string" ? payload.client_id : "",
      scopes: scope ? scope.split(" ").filter(Boolean) : [],
      expiresAt: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}
