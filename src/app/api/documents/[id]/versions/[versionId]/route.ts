import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireOwnedDoc, requireUserId } from "@/lib/routeAuth";
import { pruneVersions } from "@/lib/versions";

type Params = { params: Promise<{ id: string; versionId: string }> };

/** 读取单个版本（含正文，用于回滚前预览） */
export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const { id, versionId } = await params;
  // 版本正文从 documentVersion 取，这里只确认这篇归你
  const doc = await requireOwnedDoc(id, userId);
  if (isResponse(doc)) return doc;

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
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id, versionId } = await params;
  // 回滚前要把当前标题与正文备份成一版，这两个字段得取
  const doc = await requireOwnedDoc(id, userId, {
    select: { id: true, title: true, content: true },
  });
  if (isResponse(doc)) return doc;

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
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id, versionId } = await params;
  const doc = await requireOwnedDoc(id, userId);
  if (isResponse(doc)) return doc;

  const result = await prisma.documentVersion.deleteMany({
    where: { id: versionId, documentId: id },
  });
  if (result.count === 0) return NextResponse.json({ error: "版本不存在" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
