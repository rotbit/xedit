/**
 * AI review history (ReviewRecord table): one record per successful run, available to look back at anytime.
 *
 * Only the review result and the two button actions "ignore / got it" are stored. Accepted isn't stored -- it's derived from the body (see
 * features/review/status.ts), so when an old record is opened, items already changed show up as "accepted / original modified" on their own.
 * Every record is filtered by userId: other people's records can't be read or modified even with the id.
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanReviewKinds, type ReviewKind } from "./reviewKinds";

/** Keep this many recent records per article; beyond that the oldest are pushed out */
export const MAX_RECORDS_PER_DOC = 20;
const MAX_DOC_ID_CHARS = 100;
/** One review run can't produce this many comments; more than this means someone is flooding */
const MAX_ACTIONS = 500;

export type ReviewActions = Record<string, "ignored" | "acked">;

interface StoredResult {
  summary: string;
  categories: unknown[];
  items: unknown[];
}

/** One row in the list: just enough to identify the run; the full result is fetched when opened */
export interface ReviewRecordMeta {
  id: string;
  createdAt: string;
  kinds: ReviewKind[];
  model: string;
  /** Total number of comments in this run */
  total: number;
}

export interface ReviewRecordFull extends ReviewRecordMeta {
  result: StoredResult;
  actions: ReviewActions;
}

/** Article id reported by the client: just a label, no foreign key, but we can't accept anything either */
export function cleanDocId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id !== "" && id.length <= MAX_DOC_ID_CHARS ? id : null;
}

/** Only the two known actions and string ids; anything else is dropped rather than erroring -- it's just memory for a few buttons */
export function cleanActions(value: unknown): ReviewActions {
  const out: ReviewActions = {};
  if (!value || typeof value !== "object" || Array.isArray(value)) return out;
  for (const [id, action] of Object.entries(value).slice(0, MAX_ACTIONS)) {
    if (id.length <= 100 && (action === "ignored" || action === "acked")) out[id] = action;
  }
  return out;
}

function asResult(value: unknown): StoredResult {
  const data = (value && typeof value === "object" ? value : {}) as Partial<StoredResult>;
  return {
    summary: typeof data.summary === "string" ? data.summary : "",
    categories: Array.isArray(data.categories) ? data.categories : [],
    items: Array.isArray(data.items) ? data.items : [],
  };
}

type Row = {
  id: string;
  createdAt: Date;
  kinds: string;
  model: string;
  result: unknown;
  actions: unknown;
};

function toMeta(row: Row): ReviewRecordMeta {
  return {
    id: row.id,
    createdAt: row.createdAt.toISOString(),
    kinds: cleanReviewKinds(row.kinds.split(",")),
    model: row.model,
    total: asResult(row.result).items.length,
  };
}

/** Save one record, and prune this article's old records beyond the cap */
export async function saveReviewRecord(input: {
  userId: string;
  docId: string;
  kinds: ReviewKind[];
  model: string;
  result: StoredResult;
}): Promise<ReviewRecordMeta> {
  const row = await prisma.reviewRecord.create({
    data: {
      userId: input.userId,
      docId: input.docId,
      kinds: input.kinds.join(","),
      model: input.model,
      result: input.result as unknown as Prisma.InputJsonValue,
    },
  });
  const stale = await prisma.reviewRecord.findMany({
    where: { userId: input.userId, docId: input.docId },
    orderBy: { createdAt: "desc" },
    skip: MAX_RECORDS_PER_DOC,
    select: { id: true },
  });
  if (stale.length > 0) {
    await prisma.reviewRecord.deleteMany({ where: { id: { in: stale.map((r) => r.id) } } });
  }
  return toMeta(row);
}

/** History for this article, newest first */
export async function listReviewRecords(userId: string, docId: string): Promise<ReviewRecordMeta[]> {
  const rows = await prisma.reviewRecord.findMany({
    where: { userId, docId },
    orderBy: { createdAt: "desc" },
    take: MAX_RECORDS_PER_DOC,
  });
  return rows.map(toMeta);
}

export async function getReviewRecord(userId: string, id: string): Promise<ReviewRecordFull | null> {
  const row = await prisma.reviewRecord.findFirst({ where: { id, userId } });
  if (!row) return null;
  return { ...toMeta(row), result: asResult(row.result), actions: cleanActions(row.actions) };
}

/** Overwrite the whole thing: the action table from the UI is already complete, no merge needed */
export async function setReviewActions(userId: string, id: string, actions: unknown): Promise<boolean> {
  const done = await prisma.reviewRecord.updateMany({
    where: { id, userId },
    data: { actions: cleanActions(actions) },
  });
  return done.count > 0;
}

export async function deleteReviewRecord(userId: string, id: string): Promise<boolean> {
  const done = await prisma.reviewRecord.deleteMany({ where: { id, userId } });
  return done.count > 0;
}
