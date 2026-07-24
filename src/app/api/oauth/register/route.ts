import { registerClient } from "@/lib/oauth/store";
import { DEFAULT_SCOPE } from "@/lib/oauth/config";
import { corsJson, corsPreflight, oauthError } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 7591 动态客户端注册：MCP 客户端（Claude Desktop / Cursor）无需人工干预即可拿到 client_id。
// 一律注册为公有客户端（token_endpoint_auth_method=none，走 PKCE，无 secret）。
export async function POST(req: Request): Promise<Response> {
  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return oauthError("invalid_client_metadata", "请求体需为 JSON");
  }

  const rawUris = (body as { redirect_uris?: unknown }).redirect_uris;
  const redirectUris = Array.isArray(rawUris)
    ? rawUris.filter((u): u is string => typeof u === "string")
    : [];
  if (redirectUris.length === 0) {
    return oauthError("invalid_redirect_uri", "redirect_uris 必填且至少一项");
  }
  for (const u of redirectUris) {
    let parsed: URL;
    try {
      parsed = new URL(u);
    } catch {
      return oauthError("invalid_redirect_uri", `非法回调地址: ${u}`);
    }
    // http 回调仅允许本机回环；https 与自定义 scheme（cursor:// 等）放行
    if (
      parsed.protocol === "http:" &&
      parsed.hostname !== "localhost" &&
      parsed.hostname !== "127.0.0.1"
    ) {
      return oauthError("invalid_redirect_uri", "http 回调仅允许 localhost / 127.0.0.1");
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
