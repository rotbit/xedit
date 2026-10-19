import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { OAUTH } from "./config";

/** Tokens/auth codes are stored only as sha256 digests; plaintext never hits the database */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** High-entropy random string (base64url), used as auth code / refresh token plaintext */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Constant-time string comparison to avoid timing side channels */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** PKCE S256 check: base64url(sha256(verifier)) === challenge */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

// ---- Clients (dynamic registration, RFC 7591) ----

export async function registerClient(params: {
  name: string;
  redirectUris: string[];
}): Promise<{ id: string; createdAt: Date }> {
  const client = await prisma.oAuthClient.create({
    data: {
      name: params.name.slice(0, 200),
      redirectUris: JSON.stringify(params.redirectUris),
      tokenAuthMethod: "none",
    },
    select: { id: true, createdAt: true },
  });
  return client;
}

export function getClient(clientId: string) {
  return prisma.oAuthClient.findUnique({ where: { id: clientId } });
}

export function parseRedirectUris(client: { redirectUris: string }): string[] {
  try {
    const arr = JSON.parse(client.redirectUris);
    return Array.isArray(arr) ? arr.filter((x) => typeof x === "string") : [];
  } catch {
    return [];
  }
}

// ---- Authorization codes ----

export async function createAuthCode(params: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeMethod: string;
  scope: string;
  resource: string;
}): Promise<string> {
  const code = randomToken(32);
  await prisma.oAuthAuthCode.create({
    data: {
      codeHash: sha256(code),
      clientId: params.clientId,
      userId: params.userId,
      redirectUri: params.redirectUri,
      codeChallenge: params.codeChallenge,
      codeMethod: params.codeMethod,
      scope: params.scope,
      resource: params.resource,
      expiresAt: new Date(Date.now() + OAUTH.authCodeTtl * 1000),
    },
  });
  return code;
}

export interface ConsumedAuthCode {
  userId: string;
  scope: string;
  resource: string;
  codeChallenge: string;
  codeMethod: string;
}

/**
 * Redeem an auth code: verify it exists / isn't expired / is unused / client and redirect match exactly, and consume it atomically once.
 * Returns null on failed checks or if consumed concurrently. PKCE verification is done by the caller once it has codeChallenge.
 */
export async function consumeAuthCode(
  code: string,
  clientId: string,
  redirectUri: string
): Promise<ConsumedAuthCode | null> {
  const rec = await prisma.oAuthAuthCode.findUnique({
    where: { codeHash: sha256(code) },
  });
  if (!rec) return null;
  if (rec.consumedAt) return null;
  if (rec.clientId !== clientId) return null;
  if (rec.redirectUri !== redirectUri) return null;
  if (rec.expiresAt.getTime() < Date.now()) return null;
  // Atomic consume: conditioned on consumedAt=null, preventing concurrent double-spend
  const consumed = await prisma.oAuthAuthCode.updateMany({
    where: { id: rec.id, consumedAt: null },
    data: { consumedAt: new Date() },
  });
  if (consumed.count === 0) return null;
  return {
    userId: rec.userId,
    scope: rec.scope,
    resource: rec.resource,
    codeChallenge: rec.codeChallenge,
    codeMethod: rec.codeMethod,
  };
}

// ---- Refresh tokens ----

export async function issueRefreshToken(params: {
  clientId: string;
  userId: string;
  scope: string;
  resource: string;
}): Promise<string> {
  const token = randomToken(32);
  await prisma.oAuthRefreshToken.create({
    data: {
      tokenHash: sha256(token),
      clientId: params.clientId,
      userId: params.userId,
      scope: params.scope,
      resource: params.resource,
      expiresAt: new Date(Date.now() + OAUTH.refreshTokenTtl * 1000),
    },
  });
  return token;
}

export interface RotatedRefresh {
  userId: string;
  scope: string;
  resource: string;
  refreshToken: string;
}

/**
 * Rotate a refresh token: verify the old one is valid and belongs to this client, atomically revoke it and issue a new one.
 * Public clients must rotate (spec requirement); old tokens die on use, so replay is detectable.
 */
export async function rotateRefreshToken(
  oldToken: string,
  clientId: string
): Promise<RotatedRefresh | null> {
  const rec = await prisma.oAuthRefreshToken.findUnique({
    where: { tokenHash: sha256(oldToken) },
  });
  if (!rec) return null;
  if (rec.clientId !== clientId) return null;
  if (rec.revokedAt || rec.expiresAt.getTime() < Date.now()) return null;
  const revoked = await prisma.oAuthRefreshToken.updateMany({
    where: { id: rec.id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  if (revoked.count === 0) return null; // Rotated/revoked concurrently
  const refreshToken = await issueRefreshToken({
    clientId,
    userId: rec.userId,
    scope: rec.scope,
    resource: rec.resource,
  });
  return { userId: rec.userId, scope: rec.scope, resource: rec.resource, refreshToken };
}
