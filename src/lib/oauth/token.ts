import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "crypto";
import { OAUTH, jwtKey } from "./config";

/**
 * Access tokens are JWTs (HS256); the resource server verifies statelessly, nothing stored.
 * Revocation relies on short TTLs; long-term revocation is done via refresh token rotation.
 */

export async function signAccessToken(params: {
  userId: string;
  clientId: string;
  scope: string;
  issuer: string;
  /** RFC 8707 target resource, written into aud */
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
 * Verify signature + audience (the token must be issued for this MCP server) + expiry.
 * Any failure returns null, and the caller responds 401.
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
