"use server";

import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { createAuthCode, getClient, parseRedirectUris } from "@/lib/oauth/store";

/** Re-validate the client and redirect URI (a server action trusts nothing in hidden form fields) */
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

/** User clicks 「允许」 (Allow): issue a one-time authorization code and redirect back to the client with state */
export async function approveAuthorization(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") || "");
  const redirectUri = String(formData.get("redirect_uri") || "");
  const codeChallenge = String(formData.get("code_challenge") || "");
  const codeMethod = String(formData.get("code_method") || "S256");
  const scope = String(formData.get("scope") || "");
  const resource = String(formData.get("resource") || "");
  const state = String(formData.get("state") || "");

  // userId comes only from the session, never from the form
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) redirect("/");

  const client = await validate(clientId, redirectUri);
  if (!client) redirect("/"); // untrusted redirect URI: don't redirect back, go home

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

/** User clicks 「拒绝」 (Deny): redirect back with error=access_denied per the OAuth spec */
export async function denyAuthorization(formData: FormData): Promise<void> {
  const clientId = String(formData.get("client_id") || "");
  const redirectUri = String(formData.get("redirect_uri") || "");
  const state = String(formData.get("state") || "");
  const client = await validate(clientId, redirectUri);
  if (!client) redirect("/");
  backTo(redirectUri, { error: "access_denied", state });
}
