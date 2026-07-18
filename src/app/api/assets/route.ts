import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { ossConfigured, ossList, ossUrlOf } from "@/lib/oss";

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

/** 同步 OSS 历史图片：把 xedit/ 前缀下未入库的对象补录到当前账号 */
export async function POST() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  if (!ossConfigured()) {
    return NextResponse.json({ error: "服务端未配置 OSS" }, { status: 501 });
  }

  const userId = session.user.id;
  const [objects, existing] = await Promise.all([
    ossList(),
    prisma.asset.findMany({ where: { userId }, select: { key: true } }),
  ]);
  const known = new Set(existing.map((e) => e.key));
  const mimeOf = (key: string): string => {
    const ext = key.split(".").pop()?.toLowerCase() ?? "";
    return (
      {
        png: "image/png",
        jpg: "image/jpeg",
        jpeg: "image/jpeg",
        gif: "image/gif",
        webp: "image/webp",
        svg: "image/svg+xml",
      }[ext] ?? ""
    );
  };
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
