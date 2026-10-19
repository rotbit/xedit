import type { Document } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { chinaDate } from "@/lib/active";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { plainText, summarize } from "@/lib/excerpt";
import { autoSnapshot, AUTOSAVE_RULE } from "@/lib/versions";
import { wordCount } from "@/lib/wordCount";

/**
 * Shared service layer for document CRUD: REST routes and MCP tools use the same logic to avoid behavior drift.
 * Every operation is scoped by userId; nothing is visible or editable across users.
 */

function clampLimit(v: number | undefined, def: number, max: number): number {
  if (!v || !Number.isFinite(v)) return def;
  return Math.min(Math.max(Math.floor(v), 1), max);
}

export interface DocSummary {
  id: string;
  title: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
  excerpt: string;
  chars: number;
}

export interface DocFull {
  id: string;
  title: string;
  content: string;
  category: string;
  createdAt: Date;
  updatedAt: Date;
}

/** Full row → the public DocFull shape (internal fields beyond the body don't leak) */
function toDocFull(doc: Document): DocFull {
  return {
    id: doc.id,
    title: doc.title,
    content: doc.content,
    category: doc.category,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
  };
}

/**
 * Library listing. limit="all" means no cap: the REST list API sends the whole library to the frontend,
 * while MCP always applies a cap (default 50) so a tool call doesn't dump hundreds of docs.
 *
 * The full body is still fetched: char count covers the whole doc and would be wrong if truncated;
 * but the excerpt only scans the beginning (see the pre-slice in excerpt.ts), so long docs don't run five regexes over the whole body.
 */
export async function listDocuments(
  userId: string,
  opts: { trash?: boolean; category?: string; limit?: number | "all" } = {}
): Promise<DocSummary[]> {
  const docs = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: opts.trash ? { not: null } : null,
      ...(opts.category ? { category: opts.category } : {}),
    },
    orderBy: { updatedAt: "desc" },
    take: opts.limit === "all" ? undefined : clampLimit(opts.limit, 50, 200),
    select: {
      id: true,
      title: true,
      category: true,
      createdAt: true,
      updatedAt: true,
      content: true,
    },
  });
  return docs.map((d) => ({
    id: d.id,
    title: d.title,
    category: d.category,
    createdAt: d.createdAt,
    updatedAt: d.updatedAt,
    excerpt: summarize(d.content),
    chars: wordCount(d.content),
  }));
}

/** Snippet window for matches: keep 40 chars before the match, 120 total.
 *  This is search context, not a list excerpt, so it doesn't share EXCERPT_MAX. */
const SNIPPET_BEFORE = 40;
const SNIPPET_WIDTH = 120;

/** Extract a short context around the match position to help locate hits.
 *  plain is passed in by the caller: plain-text conversion of a body happens once, don't redo it here. */
function snippetAround(plain: string, query: string): string {
  const idx = plain.toLowerCase().indexOf(query.toLowerCase());
  if (idx < 0) return plain.slice(0, SNIPPET_WIDTH);
  const start = Math.max(0, idx - SNIPPET_BEFORE);
  return (start > 0 ? "…" : "") + plain.slice(start, start + SNIPPET_WIDTH);
}

export async function searchDocuments(
  userId: string,
  query: string,
  limit = 20
): Promise<DocSummary[]> {
  const q = query.trim();
  if (!q) return [];
  const docs = await prisma.document.findMany({
    where: {
      userId,
      deletedAt: null,
      OR: [
        { title: { contains: q, mode: "insensitive" } },
        { content: { contains: q, mode: "insensitive" } },
      ],
    },
    orderBy: { updatedAt: "desc" },
    take: clampLimit(limit, 20, 100),
    select: {
      id: true,
      title: true,
      category: true,
      createdAt: true,
      updatedAt: true,
      content: true,
    },
  });
  return docs.map((d) => {
    const plain = plainText(d.content);
    return {
      id: d.id,
      title: d.title,
      category: d.category,
      createdAt: d.createdAt,
      updatedAt: d.updatedAt,
      excerpt: snippetAround(plain, q),
      chars: wordCount(d.content),
    };
  });
}

export async function getDocument(userId: string, id: string): Promise<DocFull | null> {
  const doc = await prisma.document.findFirst({ where: { id, userId } });
  if (!doc || doc.deletedAt) return null;
  return toDocFull(doc);
}

/** Max length of the client dedup key; truncated on the server like the title, without trusting the client's length */
const CLIENT_KEY_MAX = 100;

export interface CreateDocInput {
  title?: string;
  content?: string;
  category?: string;
  /**
   * Client dedup key (optional), unique per account. Offline creation and flaky-network retries can send the same "create"
   * several times; with the same key only one doc is created, and later attempts get back the one created first.
   */
  clientKey?: string;
}

/** Normalize the dedup key: blank strings count as absent, overly long ones are truncated */
function normalizeClientKey(v: unknown): string | null {
  return typeof v === "string" && v.trim() ? v.trim().slice(0, CLIENT_KEY_MAX) : null;
}

/** Unique constraint violation. Checks only the error code rather than importing Prisma's error class, so pure logic tests can construct it easily */
function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && (e as { code?: unknown }).code === "P2002";
}

/**
 * Create a document and return the full row: the REST create API needs the full row for the local mirror, while MCP and Feishu sync only need three fields;
 * dedup and field trimming live here in one place so the two channels don't drift.
 *
 * Idempotent with clientKey: first look up by (userId, clientKey); if found, return the existing doc as-is (without rewriting it),
 * otherwise create; if two retries reach create at once, the unique constraint catches it, and on a clash (P2002) we look up again to get the winner.
 * The lookup doesn't exclude trash: the unique constraint itself ignores deletedAt, so this matches it;
 * otherwise a retry with the same key after the user deleted the doc would hit the constraint and error.
 */
export async function createDocumentRow(
  userId: string,
  input: CreateDocInput
): Promise<Document> {
  const clientKey = normalizeClientKey(input.clientKey);
  if (clientKey) {
    const existing = await prisma.document.findFirst({ where: { userId, clientKey } });
    if (existing) return existing;
  }
  const data = {
    userId,
    title: input.title && input.title.trim() ? input.title.slice(0, 200) : UNTITLED_DOC,
    content: typeof input.content === "string" ? input.content : "",
    category:
      input.category && input.category.trim()
        ? input.category.trim().slice(0, 100)
        : UNCATEGORIZED,
    ...(clientKey ? { clientKey } : {}),
  };
  try {
    return await prisma.document.create({ data });
  } catch (e) {
    if (!clientKey || !isUniqueViolation(e)) throw e;
    const raced = await prisma.document.findFirst({ where: { userId, clientKey } });
    if (!raced) throw e;
    return raced;
  }
}

/** Create a document, returning only the three fields callers need (MCP tools, Feishu sync) */
export async function createDocument(
  userId: string,
  input: CreateDocInput
): Promise<{ id: string; title: string; category: string }> {
  const { id, title, category } = await createDocumentRow(userId, input);
  return { id, title, category };
}

/**
 * Update result. On success, carries the server timestamp; if another device wrote first, carries the server's current version
 * for the caller to merge. A missing doc (or one in the trash) is uniformly represented as null.
 */
export type UpdateOutcome =
  | { conflict: false; updatedAt: Date }
  | { conflict: true; doc: DocFull };

export interface UpdateDocInput {
  title?: string;
  content?: string;
  category?: string;
  /**
   * The server version time this client edit is based on. If given, it's a conditional update (optimistic locking):
   * the write only lands if the server is still at that time; otherwise a conflict is returned for the client to merge.
   * Omitted = unconditional overwrite, exactly the legacy behavior; old clients, MCP tools, and Feishu sync all use this path.
   */
  baseUpdatedAt?: string | number | Date | null;
}

/** Parse baseUpdatedAt into a Date; empty and invalid values count as absent (callers that need to reject them validate first) */
export function parseBaseUpdatedAt(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (typeof v !== "string" && typeof v !== "number" && !(v instanceof Date)) return null;
  const d = v instanceof Date ? v : new Date(v);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * The timestamp this conditional update stamps: we stamp it ourselves instead of letting @updatedAt refresh and then querying again.
 *
 * @updatedAt also auto-refreshes under updateMany (same write-arg path as update),
 * but updateMany doesn't return rows: getting the refreshed value needs another findFirst, and if someone else writes between the two,
 * the client gets the other writer's time; using it as the base for its own save, the next conditional save
 * would end up overwriting the other writer. Stamping ourselves closes that gap: what we write is what we return.
 *
 * Millisecond precision: DateTime maps to timestamp(3) on Postgres, the same ms granularity as JS Date,
 * so equality on updatedAt in where is reliable and won't fail forever due to precision truncation.
 * Two writes in the same millisecond would keep the same timestamp and make this write "invisible" to later ones, so bump by at least 1ms.
 */
function nextStamp(base: Date): Date {
  const now = Date.now();
  return new Date(now > base.getTime() ? now : base.getTime() + 1);
}

/** Only when the body actually changed, save a version and log today's writing activity; editor saves and MCP writes share this side effect */
async function recordContentChange(
  userId: string,
  id: string,
  existing: { title: string; content: string },
  data: { title?: string; content?: string }
): Promise<void> {
  if (typeof data.content !== "string" || data.content === existing.content) return;
  await autoSnapshot(id, data.title ?? existing.title, data.content, AUTOSAVE_RULE);
  const delta = Math.max(0, wordCount(data.content) - wordCount(existing.content));
  const date = chinaDate();
  await prisma.writingActivity.upsert({
    where: { userId_date: { userId, date } },
    update: { saves: { increment: 1 }, charsAdded: { increment: delta } },
    create: { userId, date, saves: 1, charsAdded: delta },
  });
}

/**
 * Update a document. Only the provided fields are updated; body changes automatically save a version and log today's writing activity,
 * with exactly the same side effects as an editor save. Returns null if the doc doesn't exist (or is in the trash).
 *
 * On success the server updatedAt is returned: the client mirror must store server time;
 * a machine with a fast clock using local time as the save time would later misjudge the "replace only if server is newer" check as a local update.
 */
export async function updateDocument(
  userId: string,
  id: string,
  input: UpdateDocInput
): Promise<UpdateOutcome | null> {
  const existing = await prisma.document.findFirst({ where: { id, userId } });
  if (!existing || existing.deletedAt) return null;

  const data: { title?: string; content?: string; category?: string } = {};
  if (typeof input.title === "string") data.title = input.title.slice(0, 200) || UNTITLED_DOC;
  if (typeof input.content === "string") data.content = input.content;
  if (typeof input.category === "string") {
    data.category = input.category.trim().slice(0, 100) || UNCATEGORIZED;
  }

  const base = parseBaseUpdatedAt(input.baseUpdatedAt);
  if (base) {
    // Conditional update: updatedAt=base goes in the where, so comparison and write happen in the same UPDATE inside the database;
    // two devices saving concurrently can't both succeed: the first moves the timestamp, the second matches 0 rows.
    const stamp = nextStamp(base);
    const { count } = await prisma.document.updateMany({
      where: { id, userId, deletedAt: null, updatedAt: base },
      data: { ...data, updatedAt: stamp },
    });
    if (count === 0) {
      // Not written: either someone wrote first (conflict; return the server's current version for the client to merge),
      // or it was deleted/moved to trash meanwhile (treated as missing, consistent with the unconditional path)
      const fresh = await prisma.document.findFirst({ where: { id, userId } });
      if (!fresh || fresh.deletedAt) return null;
      return { conflict: true, doc: toDocFull(fresh) };
    }
    await recordContentChange(userId, id, existing, data);
    return { conflict: false, updatedAt: stamp };
  }

  // The version saving and activity logging below don't touch the document row, so this updatedAt is the final time of this save
  const updated = await prisma.document.update({
    where: { id },
    data,
    select: { updatedAt: true },
  });
  await recordContentChange(userId, id, existing, data);
  return { conflict: false, updatedAt: updated.updatedAt };
}

/** Delete a document: soft delete by default (move to trash); hard=true deletes permanently. Returns false if not found. */
export async function deleteDocument(
  userId: string,
  id: string,
  hard = false
): Promise<boolean> {
  const result = hard
    ? await prisma.document.deleteMany({ where: { id, userId } })
    : await prisma.document.updateMany({
        where: { id, userId, deletedAt: null },
        data: { deletedAt: new Date() },
      });
  return result.count > 0;
}
