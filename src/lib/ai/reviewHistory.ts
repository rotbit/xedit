/**
 * AI 审核的历史记录（表 ReviewRecord）：每跑成一趟存一条，随时翻回来看。
 *
 * 存的只有审核结果和「忽略 / 知道了」这两种按钮动作。采纳不存——它从正文里现推（见
 * features/review/status.ts），所以翻出一份旧记录，已经改掉的那几条自己就是「已采纳 / 原文已修改」。
 * 每条记录都按 userId 过一遍：别人的记录，知道 id 也读不到、改不了。
 */
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { cleanReviewKinds, type ReviewKind } from "./reviewKinds";

/** 每篇文章留最近这么多条，再多就把最老的挤掉 */
export const MAX_RECORDS_PER_DOC = 20;
const MAX_DOC_ID_CHARS = 100;
/** 一趟审核给不出这么多条意见；超了就是有人在灌 */
const MAX_ACTIONS = 500;

export type ReviewActions = Record<string, "ignored" | "acked">;

interface StoredResult {
  summary: string;
  categories: unknown[];
  items: unknown[];
}

/** 列表里的一行：够认出是哪一趟就行，整份结果点开再取 */
export interface ReviewRecordMeta {
  id: string;
  createdAt: string;
  kinds: ReviewKind[];
  model: string;
  /** 这一趟一共给了几条意见 */
  total: number;
}

export interface ReviewRecordFull extends ReviewRecordMeta {
  result: StoredResult;
  actions: ReviewActions;
}

/** 客户端报上来的文章 id：只当个标签用，不连外键，但也不能什么都收 */
export function cleanDocId(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const id = value.trim();
  return id !== "" && id.length <= MAX_DOC_ID_CHARS ? id : null;
}

/** 只认两种动作、只认字符串 id；其余的丢掉而不是报错——这只是几个按钮的记忆 */
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

/** 存一条，顺手把这篇文章超出上限的老记录清掉 */
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

/** 这篇文章的历史，新的在前 */
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

/** 整份覆盖：界面上那份动作表本来就是完整的，不必做合并 */
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
