import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId } from "@/lib/admin";
import { tk } from "@/i18n/t";

/** Site-wide overview for the admin home: totals for users/documents/storage */
export async function GET() {
  const session = await auth();
  if (!adminSessionUserId(session)) {
    return NextResponse.json({ error: tk("无权访问") }, { status: 403 });
  }

  const weekAgo = new Date(Date.now() - 7 * 86400_000);
  const [userTotal, bannedTotal, newThisWeek, docTotal, assetAgg] = await Promise.all([
    prisma.user.count(),
    prisma.user.count({ where: { bannedAt: { not: null } } }),
    prisma.user.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.document.count({ where: { deletedAt: null } }),
    prisma.asset.aggregate({ _count: true, _sum: { size: true } }),
  ]);

  return NextResponse.json({
    users: { total: userTotal, banned: bannedTotal, newThisWeek },
    docs: { total: docTotal },
    assets: { count: assetAgg._count, bytes: assetAgg._sum.size ?? 0 },
  });
}
