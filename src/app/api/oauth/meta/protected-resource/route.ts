import { protectedResourceHandler, getPublicOrigin } from "mcp-handler";
import { corsPreflight } from "@/lib/oauth/http";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// RFC 9728 受保护资源元数据：告诉客户端「授权服务器是谁、资源规范 URI 是什么」。
// 经 next.config rewrites 映射自 /.well-known/oauth-protected-resource。
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
