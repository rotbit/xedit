import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { pruneVersions } from "@/lib/versions";

type Params = { params: Promise<{ id: string }> };

async function ownedDoc(id: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.document.findFirst({ where: { id, userId: session.user.id } });
}

/** 版本列表（不含正文，附字数便于展示） */
export async function GET(_req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });

  const versions = await prisma.documentVersion.findMany({
    where: { documentId: id },
    orderBy: { createdAt: "desc" },
    select: { id: true, title: true, kind: true, createdAt: true, content: true },
  });
  return NextResponse.json(
    versions.map((v) => ({
      id: v.id,
      title: v.title,
      kind: v.kind,
      createdAt: v.createdAt,
      chars: v.content.replace(/\s/g, "").length,
    }))
  );
}

/** 手动存档当前内容 */
export async function POST(_req: Request, { params }: Params) {
  const { id } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });

  const version = await prisma.documentVersion.create({
    data: { documentId: id, title: doc.title, content: doc.content, kind: "manual" },
  });
  await pruneVersions(id);
  return NextResponse.json({ id: version.id, createdAt: version.createdAt });
}
