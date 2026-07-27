import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { adminSessionUserId } from "@/lib/admin";
import { ossConfigured, ossList, ossUrlOf } from "@/lib/oss";
import { MIME_BY_EXT } from "@/lib/media";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const assets = await prisma.asset.findMany({
    where: { userId: session.user.id },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(assets);
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
