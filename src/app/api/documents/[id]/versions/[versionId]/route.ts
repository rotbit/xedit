import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireOwnedDoc, requireUserId } from "@/lib/routeAuth";
import { pruneVersions } from "@/lib/versions";
import { tk } from "@/i18n/t";

type Params = { params: Promise<{ id: string; versionId: string }> };

/** Read a single version (with body, for preview before rollback) */
export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const { id, versionId } = await params;
  // The version body comes from documentVersion; here we only confirm you own this doc
  const doc = await requireOwnedDoc(id, userId);
  if (isResponse(doc)) return doc;

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: id },
  });
  if (!version) return NextResponse.json({ error: tk("版本不存在") }, { status: 404 });
  return NextResponse.json(version);
}

/**
 * Roll back to this version: first auto-back up the current content as a version (kind=restore),
 * then overwrite the doc with the version content and return the updated doc.
 */
export async function POST(_req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id, versionId } = await params;
  // Rollback backs up the current title and body as a version first, so those two fields are needed
  const doc = await requireOwnedDoc(id, userId, {
    select: { id: true, title: true, content: true },
  });
  if (isResponse(doc)) return doc;

  const version = await prisma.documentVersion.findFirst({
    where: { id: versionId, documentId: id },
  });
  if (!version) return NextResponse.json({ error: tk("版本不存在") }, { status: 404 });

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

/** Delete a single version */
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
  if (result.count === 0) return NextResponse.json({ error: tk("版本不存在") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
