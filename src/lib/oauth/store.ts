import { createHash, randomBytes, timingSafeEqual } from "crypto";
import { prisma } from "@/lib/prisma";
import { OAUTH } from "./config";

/** 令牌/授权码只存 sha256 摘要，明文绝不落库 */
export function sha256(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** 高熵随机串（base64url），用作授权码 / 刷新令牌明文 */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** 恒定时间字符串比较，避免时序侧信道 */
function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

/** PKCE S256 校验：base64url(sha256(verifier)) === challenge */
export function verifyPkceS256(verifier: string, challenge: string): boolean {
  if (!verifier || !challenge) return false;
  const computed = createHash("sha256").update(verifier).digest("base64url");
  return safeEqual(computed, challenge);
}

// ---- 客户端（动态注册 RFC 7591）----

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

// ---- 授权码 ----

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
 * 兑换授权码：校验存在/未过期/未用过/客户端与回调精确匹配，并原子性地一次性消费。
 * 校验不过或已被并发消费返回 null。PKCE 校验由调用方在拿到 codeChallenge 后完成。
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
  // 原子消费：条件 consumedAt=null，防并发双花
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

// ---- 刷新令牌 ----

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
 * 轮换刷新令牌：校验旧令牌有效且属于该客户端，原子撤销旧的、签发新的。
 * 公有客户端必须轮换（规范要求），旧令牌用过即废，可检测重放。
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
  if (revoked.count === 0) return null; // 被并发轮换/撤销
  const refreshToken = await issueRefreshToken({
    clientId,
    userId: rec.userId,
    scope: rec.scope,
    resource: rec.resource,
  });
  return { userId: rec.userId, scope: rec.scope, resource: rec.resource, refreshToken };
}
