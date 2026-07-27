import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { pruneVersions } from "@/lib/versions";

type Params = { params: Promise<{ id: string; versionId: string }> };

async function ownedDoc(id: string) {
  const session = await auth();
  if (!session?.user?.id) return null;
  return prisma.document.findFirst({ where: { id, userId: session.user.id } });
}

/** 读取单个版本（含正文，用于回滚前预览） */
export async function GET(_req: Request, { params }: Params) {
  const { id, versionId } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: id },
  });
  if (!version) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  return NextResponse.json(version);
}

/**
 * 回滚到该版本：先把当前内容自动备份为一个版本（kind=restore），
 * 再用版本内容覆盖文档，返回更新后的文档。
 */
export async function POST(_req: Request, { params }: Params) {
  const { id, versionId } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
  const denied = await readOnlyGuard(doc.userId);
  if (denied) return denied;

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: id },
  });
  if (!version) return NextResponse.json({ error: "版本不存在" }, { status: 404 });

  const [, updated] = await prisma.$transaction([
    prisma.documentVersion.create({
      data: { documentId: id, title: doc.title, content: doc.content, kind: "restore" },
    }),
    prisma.document.update({
      where: { id },
      data: { title: version.title, content: version.content },
    }),
  ]);
  await pruneVersions(id);
  return NextResponse.json(updated);
}

/** 删除单个版本 */
export async function DELETE(_req: Request, { params }: Params) {
  const { id, versionId } = await params;
  const doc = await ownedDoc(id);
  if (!doc) return NextResponse.json({ error: "未登录或文档不存在" }, { status: 401 });
  const denied = await readOnlyGuard(doc.userId);
  if (denied) return denied;

  const result = await prisma.documentVersion.deleteMany({
    where: { id: versionId, documentId: id },
  });
  if (result.count === 0) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
