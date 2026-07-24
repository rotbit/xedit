"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createAuthCode, getClient, parseRedirectUris } from "@/lib/oauth/store";

/** 再次校验客户端与回调地址（server action 不信任隐藏表单里的任何东西） */
async function validate(clientId: string, redirectUri: string) {
  const client = clientId ? await getClient(clientId) : null;
  if (!client) return null;
  if (!redirectUri || !parseRedirectUris(client).includes(redirectUri)) return null;
  return client;
}

function backTo(redirectUri: string, params: Record<string, string>): never {
  const u = new URL(redirectUri);
  for (const [k, v] of Object.entries(params)) if (v) u.searchParams.set(k, v);
  redirect(u.toString());
}

/** 用户点「允许」：签发一次性授权码并按 state 回跳到客户端 */
export async function approveAuthorization(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") || "");
  const redirectUri = String(formData.get("redirect_uri") || "");
  const codeChallenge = String(formData.get("code_challenge") || "");
  const codeMethod = String(formData.get("code_method") || "S256");
  const scope = String(formData.get("scope") || "");
  const resource = String(formData.get("resource") || "");
  const state = String(formData.get("state") || "");

  // userId 只从会话取，绝不从表单取
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/");

  const client = await validate(clientId, redirectUri);
  if (!client) redirect("/"); // 回调地址不可信则不回跳，回首页

  const code = await createAuthCode({
    clientId,
    userId,
    redirectUri,
    codeChallenge,
    codeMethod,
    scope,
    resource,
  });
  backTo(redirectUri, { code, state });
}

/** 用户点「拒绝」：按 OAuth 规范回跳 error=access_denied */
export async function denyAuthorization(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") || "");
  const redirectUri = String(formData.get("redirect_uri") || "");
  const state = String(formData.get("state") || "");
  const client = await validate(clientId, redirectUri);
  if (!client) redirect("/");
  backTo(redirectUri, { error: "access_denied", state });
}
