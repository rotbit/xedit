import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { tk } from "@/i18n/t";

export const runtime = "nodejs";

// MCP clients the current user has authorized that are still valid (refresh token not revoked or expired).
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const rows = await prisma.oAuthRefreshToken.findMany({
    where: { userId: session.user.id, revokedAt: null, expiresAt: { gt: new Date() } },
    select: { clientId: true, createdAt: true, client: { select: { name: true } } },
    orderBy: { createdAt: "desc" },
  });
  // Multiple authorizations of the same client show only the latest
  const seen = new Map<string, { clientId: string; name: string; since: Date }>();
  for (const r of rows) {
    if (!seen.has(r.clientId)) {
      seen.set(r.clientId, {
        clientId: r.clientId,
        name: r.client.name || tk("未命名应用"),
        since: r.createdAt,
      });
    }
  }
  return NextResponse.json([...seen.values()]);
}

// Revoke a client's authorization: invalidate all its refresh tokens.
// Already-issued access tokens are stateless JWTs and can't be revoked instantly, but expire within an hour.
export async function DELETE(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const body = await req.json().catch(() => ({}));
  const clientId = typeof body?.clientId === "string" ? body.clientId : "";
  if (!clientId) {
    return NextResponse.json({ error: tk("缺少 clientId") }, { status: 400 });
  }
  const result = await prisma.oAuthRefreshToken.updateMany({
    where: { userId: session.user.id, clientId, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return NextResponse.json({ ok: true, revoked: result.count });
}
