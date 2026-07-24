import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";

// 当前用户已授权、且仍有效（未撤销未过期刷新令牌）的 MCP 客户端列表。
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const rows = await prisma.oAuthRefreshToken.findMany({
    where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { clientId: true, createdAt: true, client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  // 同一客户端多次授权只展示最近一次
  const seen = new Map<string, { clientId: string; name: string; since: Date }>();
  for (const r of rows) {
    if (!seen.has(r.clientId)) {
      seen.set(r.clientId, {
        clientId: r.clientId,
        name: r.client.name || "未命名应用",
        since: r.createdAt,
      });
    }
  }
  return NextResponse.json([...seen.values()]);
}

// 撤销对某客户端的授权：作废其全部刷新令牌。
// 已签发的 access token 因是无状态 JWT 无法即时失效，但最长 1 小时内自动过期。
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json({ error: "缺少 clientId" }, { status: 400 });
  }
  const result = await prisma.oAuthRefreshToken.updateMany({
    where: { userId: session.user.id, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true, revoked: result.count });
}
