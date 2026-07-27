import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";

type Params = { params: Promise<{ id: string }> };

/** 反查素材被哪些文章引用。按对象 key（URL 的路径部分）在正文里匹配，
 *  换 CDN 域名后旧文章里的旧链接也照样命中。 */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "未登录" }, { status: 401 });
  }
  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, userId: session.user.id },
    select: { key: true },
  });
  if (!asset) return NextResponse.json({ error: "素材不存在" }, { status: 404 });

  const docs = await prisma.document.findMany({
    where: { userId: session.user.id, content: { contains: asset.key } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, category: true, updatedAt: true, deletedAt: true },
  });
  return NextResponse.json({ docs });
}
