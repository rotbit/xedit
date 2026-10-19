import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/ai/crypto";
import { FEISHU } from "./config";
import { tk } from "@/i18n/t";

/**
 * Token lifecycle management for Feishu user-identity OAuth.
 * App credentials (App ID/Secret) are per account, stored with the user's FeishuConnection;
 * access_token (~2h) and refresh_token are both stored encrypted; on use, near-expiry tokens are refreshed and rotated automatically.
 */

/** Thrown when the connection is invalid (no app configured / refresh_token expired or revoked); the route layer turns it into "please reconnect" */
export class FeishuReconnectError extends Error {
  constructor(msg = tk("飞书授权已失效，请重新连接")) {
    super(msg);
  }
}

interface TokenResponse {
  code: number;
  error_description?: string;
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  /** Scopes actually granted (space-separated); checked for write permission before pushing */
  scope?: string;
}

async function requestToken(
  appId: string,
  appSecret: string,
  body: Record<string, string>
): Promise<TokenResponse> {
  const res = await fetch(FEISHU.tokenUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: appId, client_secret: appSecret, ...body }),
    signal: AbortSignal.timeout(15000),
  });
  const data = (await res.json().catch(() => ({}))) as TokenResponse;
  if (!res.ok && typeof data.code !== "number") {
    throw new Error(`飞书 token 接口异常: HTTP ${res.status}`); // i18n-ignore server error message with variables; client-side t() can't match it, keep Chinese for now
  }
  return data;
}

/** Get the user's saved app credentials; null if not configured */
async function appCredentials(
  userId: string
): Promise<{ appId: string; appSecret: string } | null> {
  const conn = await prisma.feishuConnection.findUnique({
    where: { userId },
    select: { appId: true, appSecretEnc: true },
  });
  if (!conn?.appId) return null;
  const appSecret = decryptSecret(conn.appSecretEnc);
  return appSecret ? { appId: conn.appId, appSecret } : null;
}

/** Exchange the auth code for tokens and store them. Returns an error message; null means success.
 *  requestedScope is the scope requested at authorization, recorded as a fallback when the token response lacks a scope field */
export async function exchangeFeishuCode(
  userId: string,
  code: string,
  redirectUri: string,
  requestedScope = ""
): Promise<string | null> {
  const cred = await appCredentials(userId);
  if (!cred) return tk("请先在对话框里保存你的飞书应用凭证");

  const data = await requestToken(cred.appId, cred.appSecret, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  if (data.code !== 0 || !data.access_token) {
    return `飞书授权失败：${data.error_description ?? `错误码 ${data.code}`}`; // i18n-ignore server error message with variables; client-side t() can't match it, keep Chinese for now
  }

  // With the token in hand, also fetch user info for display; failure doesn't block connecting
  let openId = "";
  let name = "";
  try {
    const res = await fetch(`${FEISHU.apiBase}/authen/v1/user_info`, {
      headers: { Authorization: `Bearer ${data.access_token}` },
      signal: AbortSignal.timeout(10000),
    });
    const info = await res.json();
    openId = info?.data?.open_id ?? "";
    name = info?.data?.name ?? "";
  } catch {
    /* ignore */
  }

  await prisma.feishuConnection.update({
    where: { userId },
    data: {
      feishuOpenId: openId,
      feishuName: name,
      accessTokenEnc: encryptSecret(data.access_token),
      refreshTokenEnc: encryptSecret(data.refresh_token ?? ""),
      expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000),
      scopes: data.scope || requestedScope,
    },
  });
  return null;
}

/**
 * Single-flight per user in-process: refresh_token is single-use, so if two concurrent requests each exchange the old token,
 * Feishu issues two new tokens and the later write overwrites the earlier one — but the overwritten one is the valid one,
 * and the user's connection breaks. So a user's refresh runs only once, and other callers await the same Promise.
 */
const refreshing = new Map<string, Promise<string>>();

/**
 * The actual refresh: exchange the token, then write back with optimistic concurrency.
 * The where clause includes the refreshTokenEnc we read; count === 0 means another process/instance already rotated it,
 * and we must never write ours (it would clobber the refresh_token just saved there); use the new token from the DB instead.
 */
async function refreshAccessToken(
  userId: string,
  conn: { appId: string; appSecretEnc: string; refreshTokenEnc: string }
): Promise<string> {
  const refresh = decryptSecret(conn.refreshTokenEnc);
  const appSecret = decryptSecret(conn.appSecretEnc);
  if (!refresh || !conn.appId || !appSecret) throw new FeishuReconnectError();
  const data = await requestToken(conn.appId, appSecret, {
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  if (data.code !== 0 || !data.access_token) throw new FeishuReconnectError();

  const { count } = await prisma.feishuConnection.updateMany({
    where: { userId, refreshTokenEnc: conn.refreshTokenEnc },
    data: {
      accessTokenEnc: encryptSecret(data.access_token),
      // Feishu rotates refresh_token; keep the old value if none is returned
      ...(data.refresh_token ? { refreshTokenEnc: encryptSecret(data.refresh_token) } : {}),
      expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000),
      ...(data.scope ? { scopes: data.scope } : {}),
    },
  });
  if (count === 0) {
    const winner = await prisma.feishuConnection.findUnique({
      where: { userId },
      select: { accessTokenEnc: true },
    });
    const access = winner ? decryptSecret(winner.accessTokenEnc) : "";
    // Only truly invalid if the connection was deleted, or the winning refresh also failed to store a usable token
    if (!access) throw new FeishuReconnectError();
    return access;
  }
  return data.access_token;
}

/**
 * Get a usable user_access_token: use it directly if not expired; near expiry (<5min) exchange the refresh_token for a new one and store it.
 * Throws FeishuReconnectError if not connected or the refresh fails.
 */
export async function getFeishuAccessToken(userId: string): Promise<string> {
  const conn = await prisma.feishuConnection.findUnique({ where: { userId } });
  if (!conn) throw new FeishuReconnectError();

  const access = decryptSecret(conn.accessTokenEnc);
  if (access && conn.expiresAt.getTime() - Date.now() > 5 * 60_000) return access;

  const inflight = refreshing.get(userId);
  if (inflight) return inflight;
  const task = refreshAccessToken(userId, conn).finally(() => {
    refreshing.delete(userId);
  });
  refreshing.set(userId, task);
  return task;
}
