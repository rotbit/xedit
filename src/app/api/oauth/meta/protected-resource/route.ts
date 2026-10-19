import { protectedResourceHandler, getPublicOrigin } from "mcp-handler";
import { corsPreflight } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728 protected resource metadata: tells clients "who the authorization server is and what the canonical resource URI is".
// Mapped via next.config rewrites from /.well-known/oauth-protected-resource.
export function GET(req: Request): Response {
  const origin = getPublicOrigin(req);
  return protectedResourceHandler({
    authServerUrls: [origin],
    resourceUrl: `${origin}/api/mcp`,
  })(req);
}

export function OPTIONS(): Response {
  return corsPreflight();
}
