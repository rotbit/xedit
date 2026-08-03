import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId } from "@/lib/admin";
import { ossConfigured, ossList, ossUrlOf } from "@/lib/oss";
import { MIME_BY_EXT } from "@/lib/media";

export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const where = { userId: session.user.id };
  const { searchParams } = new URL(req.url);
  const limitParam = searchParams.get("limit");
  // 不带 limit 保持旧的全量数组形态，桌面端等旧调用方不受影响
  if (!limitParam) {
    const assets = await prisma.asset.findMany({ where, orderBy: { createdAt: "desc" } });
    return NextResponse.json(assets);
  }
  const limit = Math.min(Math.max(Number(limitParam) || 24, 1), 100);
  const cursor = searchParams.get("cursor");
  const [rows, total] = await Promise.all([
    prisma.asset.findMany({
      where,
      // createdAt 可能同秒重复，补 id 兜底保证 cursor 顺序稳定
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      take: limit + 1,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    }),
    prisma.asset.count({ where }),
  ]);
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return NextResponse.json({
    items,
    total,
    nextCursor: hasMore ? items[items.length - 1].id : null,
  });
}

/** 同步 OSS 历史文件：把 xedit/ 前缀下未入库的对象补录到当前账号。
 *  会把整个 bucket 的无主对象认领到调用者名下，多用户下等于越权 + 绕配额，
 *  因此只对超级管理员开放（单用户时代的数据迁移工具）。 */
export async function POST() {
  const session = await auth();
  const userId = adminSessionUserId(session);
  if (!userId) {
    return NextResponse.json({ error: "仅管理员可同步 OSS 历史文件" }, { status: 403 });
  }
  if (!ossConfigured()) {
    return NextResponse.json({ error: "服务端未配置 OSS" }, { status: 501 });
  }
  const [objects, existing] = await Promise.all([
    ossList(),
    prisma.asset.findMany({ where: { userId }, select: { key: true } }),
  ]);
  const known = new Set(existing.map((e) => e.key));
  const mimeOf = (key: string): string =>
    MIME_BY_EXT[key.split(".").pop()?.toLowerCase() ?? ""] ?? "";
  const fresh = objects.filter((o) => !known.has(o.key) && mimeOf(o.key));
  if (fresh.length > 0) {
    await prisma.asset.createMany({
      data: fresh.map((o) => ({
        userId,
        key: o.key,
        url: ossUrlOf(o.key),
        size: o.size,
        mime: mimeOf(o.key),
        source: "upload",
      })),
      skipDuplicates: true,
    });
  }
  return NextResponse.json({ added: fresh.length });
}
