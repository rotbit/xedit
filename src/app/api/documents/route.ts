import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { readOnlyGuard } from "@/lib/guards";
import { isResponse, requireUserId } from "@/lib/routeAuth";
import { touchDailyActive } from "@/lib/active";
import { createDocumentRow, listDocuments } from "@/lib/documents";

export async function GET(req: Request) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  // Every workspace open goes through this API, so it's the DAU tracking point; failures don't affect the response
  void touchDailyActive(userId);
  const params = new URL(req.url).searchParams;
  const trash = params.get("trash") === "1";
  // full=1: include bodies so the local-first sync engine can pull a full mirror in one go
  const full = params.get("full") === "1";
  // since=<ISO>: incremental sync, only docs changed after that time (including soft deletes, marked by deletedAt),
  // plus all live ids so the client can reconcile hard deletes. With a large library, each return-to-foreground sync no longer ships every body.
  const since = params.get("since");
  if (since) {
    const sinceDate = new Date(since);
    if (!Number.isNaN(sinceDate.getTime())) {
      const [changed, live] = await Promise.all([
        prisma.document.findMany({
          // gte not gt: better to resend a doc on the cursor boundary; the client's mirror writes are idempotent
          where: { userId, updatedAt: { gte: sinceDate } },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            title: true,
            createdAt: true,
            updatedAt: true,
            content: true,
            category: true,
            deletedAt: true,
          },
        }),
        prisma.document.findMany({
          where: { userId, deletedAt: null },
          select: { id: true },
        }),
      ]);
      return NextResponse.json({ docs: changed, ids: live.map((d) => d.id) });
    }
  }
  if (full) {
    const docs = await prisma.document.findMany({
      where: { userId, deletedAt: trash ? { not: null } : null },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        title: true,
        createdAt: true,
        updatedAt: true,
        content: true,
        category: true,
      },
    });
    return NextResponse.json(docs);
  }
  // The list includes a plain-text excerpt and word count but not the body (computed in-process and discarded, so response size doesn't grow with article length).
  // Excerpt and word-count rules live in the service layer, so MCP's list_documents gets the same shape;
  // limit="all" is the only difference from MCP: the frontend sidebar needs the whole library and can't be cut off by the default cap.
  return NextResponse.json(await listDocuments(userId, { trash, limit: "all" }));
}

/** Create an article. Uses the service layer's createDocumentRow (not createDocument): the frontend needs the full row for its local mirror,
 *  and createDocument only returns id/title/category (MCP needs no more).
 *  Field trimming and clientKey dedupe both live in the service layer, so the REST and MCP paths can't drift. */
export async function POST(req: Request) {
  const userId = await requireUserId();
  if (isResponse(userId)) return userId;
  const denied = await readOnlyGuard(userId);
  if (denied) return denied;
  const body = await req.json().catch(() => ({}));
  // clientKey is optional: offline creation and flaky-network retries can send the same 「新建」 (create) several times;
  // resends with the same key create only one doc, and later ones get back the first (without a key, behavior is unchanged)
  const doc = await createDocumentRow(userId, {
    title: body.title,
    content: body.content,
    category: body.category,
    clientKey: body.clientKey,
  });
  return NextResponse.json(doc);
}
