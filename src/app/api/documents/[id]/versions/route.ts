import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireOwnedDoc, requireUserId } from "@/lib/routeAuth";
import { snapshot, autoSnapshot, IDLE_RULE } from "@/lib/versions";
import { wordCount } from "@/lib/wordCount";

type Params = { params: Promise<{ id: string }> };

/** Version list (no body, with word counts for display) */
export async function GET(_req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const { id } = await params;
  // Listing versions only needs to confirm you own this doc; none of the doc's own fields are needed
  const doc = await requireOwnedDoc(id, userId);
  if (isResponse(doc)) return doc;

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
      chars: wordCount(v.content),
    }))
  );
}

/** Snapshot the current content (manual, or auto from the frontend idle timer) */
export async function POST(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id } = await params;
  // Snapshotting freezes the current title and body, so those two fields are needed
  const doc = await requireOwnedDoc(id, userId, {
    select: { id: true, title: true, content: true },
  });
  if (isResponse(doc)) return doc;

  const body = await req.json().catch(() => ({}));
  // auto comes from the frontend's pause-in-typing / page-close fallback and is throttled; manual means the user explicitly clicked 「存档」 (Save version), so only dedupe
  const created =
    body?.kind === "auto"
      ? await autoSnapshot(id, doc.title, doc.content, IDLE_RULE)
      : await snapshot(id, doc.title, doc.content, "manual");
  return NextResponse.json({ created });
}
