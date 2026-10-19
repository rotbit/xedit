import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireUserId } from "@/lib/routeAuth";
import { touchDailyActive } from "@/lib/active";
import { deleteDocument, parseBaseUpdatedAt, updateDocument } from "@/lib/documents";
import { tk } from "@/i18n/t";

type Params = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  // Opening /edit/[id] directly bypasses the doc list, so add a DAU tracking point here
  void touchDailyActive(userId);
  const { id } = await params;

  // since= means a background freshness check "I have a mirror, just tell me if the cloud has changed":
  // compare timestamps with a lightweight select first, and if unchanged return 204 without shipping the whole body.
  // Without it (or with an unparseable time string) everything is as before; cold-path loads and other callers are unaffected.
  const since = new URL(req.url).searchParams.get("since");
  const sinceAt = since ? new Date(since) : null;
  if (sinceAt && !Number.isNaN(sinceAt.getTime())) {
    const head = await prisma.document.findFirst({
      where: { id, userId },
      select: { updatedAt: true, deletedAt: true },
    });
    if (!head || head.deletedAt) {
      return NextResponse.json({ error: tk("文档不存在") }, { status: 404 });
    }
    if (head.updatedAt.getTime() <= sinceAt.getTime()) {
      return new Response(null, { status: 204 });
    }
  }

  // The editor needs the full row (body and timestamps are in the response), so this doesn't use requireOwnedDoc's lightweight select
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc || doc.deletedAt) {
    return NextResponse.json({ error: tk("文档不存在") }, { status: 404 });
  }
  return NextResponse.json(doc);
}

export async function PUT(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id } = await params;
  const body = await req.json().catch(() => ({}));

  // Restore from trash
  if (body?.restore === true) {
    const restored = await prisma.document.updateMany({
      where: { id, userId, deletedAt: { not: null } },
      data: { deletedAt: null },
    });
    if (restored.count === 0) {
      return NextResponse.json({ error: tk("文档不存在") }, { status: 404 });
    }
    return NextResponse.json({ ok: true });
  }

  // baseUpdatedAt = the server version time this client edit is based on; if given, it's a conditional save (optimistic lock):
  // if another device already wrote to the server, return 409 with the current version for the client to merge, rather than last-write-wins.
  // Without it, behavior matches history (old clients overwrite unconditionally). If given but unparseable, it's rejected:
  // silently falling back to an unconditional overwrite would mean losing the protection without anyone knowing.
  const baseUpdatedAt = parseBaseUpdatedAt(body?.baseUpdatedAt);
  if (body?.baseUpdatedAt != null && !baseUpdatedAt) {
    return NextResponse.json({ error: tk("baseUpdatedAt 无法解析") }, { status: 400 });
  }

  // Save side effects (field trimming, automatic versions, the daily writing log, and refusing writes to trashed articles)
  // all live in the service layer; MCP's update_document goes through the same path, so the two channels can't drift
  const saved = await updateDocument(userId, id, {
    title: body.title,
    content: body.content,
    category: body.category,
    baseUpdatedAt,
  });
  if (!saved) return NextResponse.json({ error: tk("文档不存在") }, { status: 404 });
  if (saved.conflict) {
    // 409 returns the server's current version: the client merges from it instead of retrying the same save unchanged
    return NextResponse.json(
      {
        ok: false,
        conflict: true,
        doc: {
          id: saved.doc.id,
          title: saved.doc.title,
          category: saved.doc.category,
          content: saved.doc.content,
          updatedAt: saved.doc.updatedAt.toISOString(),
        },
      },
      { status: 409 }
    );
  }
  // Return the server time: the client mirror records updatedAt from it, so local clock skew won't affect later freshness comparisons
  return NextResponse.json({ ok: true, updatedAt: saved.updatedAt.toISOString() });
}

export async function DELETE(req: Request, { params }: Params) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const { id } = await params;
  const hard = new URL(req.url).searchParams.get("hard") === "1";

  const removed = await deleteDocument(userId, id, hard);
  if (!removed) return NextResponse.json({ error: tk("文档不存在") }, { status: 404 });
  return NextResponse.json({ ok: true });
}
