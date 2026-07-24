import { OAUTH, publicOrigin } from "@/lib/oauth/config";
import { corsJson, corsPreflight } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 8414 授权服务器元数据。经 next.config rewrites 映射自
// /.well-known/oauth-authorization-server。
export function GET(req: Request): Response {
  const origin = publicOrigin(req);
  return corsJson({
    issuer: origin,
    authorization_endpoint: `${origin}/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [...OAUTH.scopesSupported],
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
  });
}

export function OPTIONS(): Response {
  return corsPreflight();
}
