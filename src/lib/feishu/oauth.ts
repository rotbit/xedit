import { prisma } from "@/lib/prisma";
import { encryptSecret, decryptSecret } from "@/lib/ai/crypto";
import { FEISHU } from "./config";

/**
 * 飞书用户身份 OAuth 的 token 生命周期管理。
 * 应用凭证（App ID/Secret）是账号维度的，随用户的 FeishuConnection 存取；
 * access_token（~2h）与 refresh_token 都加密落库；取用时临期自动刷新并轮换存储。
 */

/** 连接失效（未配置应用 / refresh_token 过期或被撤销）时抛出，路由层转成「请重新连接」 */
export class FeishuReconnectError extends Error {
  constructor(msg = "飞书授权已失效，请重新连接") {
    super(msg);
  }
}

interface TokenResponse {
  code: number;
  error_description?: string;
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  /** 实际授予的权限列表（空格分隔）；推送前据此判断写入权限 */
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
    throw new Error(`飞书 token 接口异常: HTTP ${res.status}`);
  }
  return data;
}

/** 取用户已保存的应用凭证；未配置时返回 null */
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

/** 授权码换 token 并落库。返回错误文案；null 表示成功。
 *  requestedScope 是授权时请求的 scope，token 响应缺 scope 字段时作兜底记录 */
export async function exchangeFeishuCode(
  userId: string,
  code: string,
  redirectUri: string,
  requestedScope = ""
): Promise<string | null> {
  const cred = await appCredentials(userId);
  if (!cred) return "请先在对话框里保存你的飞书应用凭证";

  const data = await requestToken(cred.appId, cred.appSecret, {
    grant_type: "authorization_code",
    code,
    redirect_uri: redirectUri,
  });
  if (data.code !== 0 || !data.access_token) {
    return `飞书授权失败：${data.error_description ?? `错误码 ${data.code}`}`;
  }

  // 拿到 token 后顺手取一次用户信息用于回显；失败不阻断连接
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
 * 取可用的 user_access_token：未到期直接用，临期（<5min）用 refresh_token 换新并落库。
 * 未连接或刷新失败抛 FeishuReconnectError。
 */
export async function getFeishuAccessToken(userId: string): Promise<string> {
  const conn = await prisma.feishuConnection.findUnique({ where: { userId } });
  if (!conn) throw new FeishuReconnectError();

  const access = decryptSecret(conn.accessTokenEnc);
  if (access && conn.expiresAt.getTime() - Date.now() > 5 * 60_000) return access;

  const refresh = decryptSecret(conn.refreshTokenEnc);
  const appSecret = decryptSecret(conn.appSecretEnc);
  if (!refresh || !conn.appId || !appSecret) throw new FeishuReconnectError();
  const data = await requestToken(conn.appId, appSecret, {
    grant_type: "refresh_token",
    refresh_token: refresh,
  });
  if (data.code !== 0 || !data.access_token) throw new FeishuReconnectError();

  await prisma.feishuConnection.update({
    where: { userId },
    data: {
      accessTokenEnc: encryptSecret(data.access_token),
      // 飞书会轮换 refresh_token；未返回时保留旧值
      ...(data.refresh_token ? { refreshTokenEnc: encryptSecret(data.refresh_token) } : {}),
      expiresAt: new Date(Date.now() + (data.expires_in ?? 0) * 1000),
      ...(data.scope ? { scopes: data.scope } : {}),
    },
  });
  return data.access_token;
}
