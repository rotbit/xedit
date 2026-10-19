import { registerClient } from "@/lib/oauth/store";
import { DEFAULT_SCOPE } from "@/lib/oauth/config";
import { corsJson, corsPreflight, oauthError } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 7591 dynamic client registration: MCP clients (Claude Desktop / Cursor) get a client_id without manual steps.
// Always registered as public clients (token_endpoint_auth_method=none, PKCE, no secret).
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return oauthError("invalid_client_metadata", "请求体需为 JSON"); // i18n-ignore
  }

  const rawUris = (body as { redirect_uris?: unknown }).redirect_uris;
  const redirectUris = Array.isArray(rawUris)
    ? rawUris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    return oauthError("invalid_redirect_uri", "redirect_uris 必填且至少一项"); // i18n-ignore
  }
  for (const u of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return oauthError("invalid_redirect_uri", `非法回调地址: ${u}`); // i18n-ignore
    }
    // http redirects only allowed for local loopback; https and custom schemes (cursor:// etc.) are allowed
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      return oauthError("invalid_redirect_uri", "http 回调仅允许 localhost / 127.0.0.1"); // i18n-ignore
    }
  }

  const name = typeof (body as { client_name?: unknown }).client_name === "string"
    ? (body as { client_name: string }).client_name
    : "";

  const { id, createdAt } = await registerClient({ name, redirectUris });
  return corsJson(
    {
      client_id: id,
      client_id_issued_at: Math.floor(createdAt.getTime() / 1000),
      redirect_uris: redirectUris,
      client_name: name,
      token_endpoint_auth_method: "none",
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
      scope: DEFAULT_SCOPE,
    },
    { status: 201 }
  );
}

export function OPTIONS(): Response {
  return corsPreflight();
}
