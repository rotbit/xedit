import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId, isAdminEmail } from "@/lib/admin";
import { DEFAULT_STORAGE_QUOTA } from "@/lib/guards";

const PAGE_SIZE = 50;

/** 账号列表：分页 + 按邮箱/昵称搜索，附每人的文档数与存储用量 */
export async function GET(req: Request) {
  const session = await auth();
  if (!adminSessionUserId(session)) {
    return NextResponse.json({ error: "无权访问" }, { status: 403 });
  }

  const params = new URL(req.url).searchParams;
  const q = (params.get("q") ?? "").trim().slice(0, 100);
  const page = Math.max(1, Number(params.get("page")) || 1);
  const where = q
    ? {
        OR: [
          { email: { contains: q, mode: "insensitive" as const } },
          { name: { contains: q, mode: "insensitive" as const } },
        ],
      }
    : {};

  const [total, users] = await Promise.all([
    prisma.user.count({ where }),
    prisma.user.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        name: true,
        email: true,
        image: true,
        createdAt: true,
        bannedAt: true,
        banReason: true,
        storageQuota: true,
        _count: { select: { documents: { where: { deletedAt: null } }, assets: true } },
      },
    }),
  ]);

  // 每人已用存储：对本页用户一次 groupBy 汇总，别逐人查
  const sums = users.length
    ? await prisma.asset.groupBy({
        by: ["userId"],
        where: { userId: { in: users.map((u) => u.id) } },
        _sum: { size: true },
      })
    : [];
  const usedBy = new Map(sums.map((s) => [s.userId, s._sum.size ?? 0]));

  return NextResponse.json({
    total,
    page,
    pageSize: PAGE_SIZE,
    defaultQuota: DEFAULT_STORAGE_QUOTA,
    users: users.map((u) => ({
      id: u.id,
      name: u.name,
      email: u.email,
      image: u.image,
      createdAt: u.createdAt,
      bannedAt: u.bannedAt,
      banReason: u.banReason,
      // BigInt 不能进 JSON，统一转 number（字节数在 2^53 内绰绰有余）
      storageQuota: u.storageQuota == null ? null : Number(u.storageQuota),
      storageUsed: usedBy.get(u.id) ?? 0,
      docCount: u._count.documents,
      assetCount: u._count.assets,
      admin: isAdminEmail(u.email),
    })),
  });
}
