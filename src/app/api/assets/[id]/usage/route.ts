import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { tk } from "@/i18n/t";

type Params = { params: Promise<{ id: string }> };

/** Find which articles reference an asset. Matches the object key (URL path part) in the body,
 *  so old links in old articles still hit after a CDN domain change. */
export async function GET(_req: Request, { params }: Params) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: tk("未登录") }, { status: 401 });
  }
  const { id } = await params;
  const asset = await prisma.asset.findFirst({
    where: { id, userId: session.user.id },
    select: { key: true },
  });
  if (!asset) return NextResponse.json({ error: tk("素材不存在") }, { status: 404 });

  const docs = await prisma.document.findMany({
    where: { userId: session.user.id, content: { contains: asset.key } },
    orderBy: { updatedAt: "desc" },
    take: 50,
    select: { id: true, title: true, category: true, updatedAt: true, deletedAt: true },
  });
  return NextResponse.json({ docs });
}
