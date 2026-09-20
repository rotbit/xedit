// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 审核历史的存取：存得进、按文章翻得出、只留最近 N 条、别人的记录碰不到。
 * 库用一个内存数组顶替。
 */
type Row = {
  id: string;
  userId: string;
  docId: string;
  kinds: string;
  model: string;
  result: unknown;
  actions: unknown;
  createdAt: Date;
};
const db = vi.hoisted(() => ({ rows: [] as Row[], seq: 0 }));

vi.mock("@/lib/prisma", () => {
  const match = (where: Partial<Row> & { id?: string | { in: string[] } }) => (r: Row) =>
    Object.entries(where).every(([k, v]) =>
      v && typeof v === "object" && "in" in v
        ? (v as { in: string[] }).in.includes(r[k as keyof Row] as string)
        : r[k as keyof Row] === v
    );
  const newestFirst = (a: Row, b: Row) => b.createdAt.getTime() - a.createdAt.getTime();
  return {
    prisma: {
      reviewRecord: {
        create: async ({ data }: { data: Omit<Row, "id" | "createdAt" | "actions"> }) => {
          db.seq += 1;
          const row: Row = {
            actions: {},
            ...data,
            id: `r${db.seq}`,
            createdAt: new Date(2026, 8, 20, 10, 0, db.seq),
          };
          db.rows.push(row);
          return row;
        },
        findMany: async ({ where, skip = 0, take }: { where: Partial<Row>; skip?: number; take?: number }) =>
          db.rows.filter(match(where)).sort(newestFirst).slice(skip, take ? skip + take : undefined),
        findFirst: async ({ where }: { where: Partial<Row> }) => db.rows.find(match(where)) ?? null,
        updateMany: async ({ where, data }: { where: Partial<Row>; data: Partial<Row> }) => {
          const hit = db.rows.filter(match(where));
          hit.forEach((r) => Object.assign(r, data));
          return { count: hit.length };
        },
        deleteMany: async ({ where }: { where: Partial<Row> }) => {
          const before = db.rows.length;
          db.rows = db.rows.filter((r) => !match(where)(r));
          return { count: before - db.rows.length };
        },
      },
    },
  };
});

import {
  MAX_RECORDS_PER_DOC,
  cleanActions,
  cleanDocId,
  deleteReviewRecord,
  getReviewRecord,
  listReviewRecords,
  saveReviewRecord,
  setReviewActions,
} from "@/lib/ai/reviewHistory";

const RESULT = {
  summary: "整体通顺",
  categories: [{ id: "grammar", label: "语病", color: "#c0392b" }],
  items: [{ id: "a1", category: "grammar", quote: "的的", line: 3, problem: "重复" }],
};
const save = (userId = "u1", docId = "d1") =>
  saveReviewRecord({ userId, docId, kinds: ["expression"], model: "deepseek/deepseek-chat", result: RESULT });

beforeEach(() => {
  db.rows = [];
  db.seq = 0;
});

describe("审核历史", () => {
  it("存一条，按文章列得出来：新的在前，只有摘要没有整份结果", async () => {
    await save();
    await saveReviewRecord({ userId: "u1", docId: "d1", kinds: ["expression", "wechat_rules"], model: "m", result: RESULT });
    await save("u1", "另一篇");
    const list = await listReviewRecords("u1", "d1");
    expect(list.map((r) => r.id)).toEqual(["r2", "r1"]);
    expect(list[0]).toMatchObject({ kinds: ["expression", "wechat_rules"], total: 1 });
    expect(list[0]).not.toHaveProperty("result");
  });

  it("取一条是整份结果，连同当时按过的「忽略 / 知道了」", async () => {
    const meta = await save();
    expect(await setReviewActions("u1", meta.id, { a1: "ignored" })).toBe(true);
    const full = await getReviewRecord("u1", meta.id);
    expect(full?.result).toEqual(RESULT);
    expect(full?.actions).toEqual({ a1: "ignored" });
    expect(full?.model).toBe("deepseek/deepseek-chat");
  });

  it("别人的记录：知道 id 也读不到、改不了、删不掉", async () => {
    const meta = await save("u1");
    expect(await getReviewRecord("u2", meta.id)).toBeNull();
    expect(await setReviewActions("u2", meta.id, { a1: "acked" })).toBe(false);
    expect(await deleteReviewRecord("u2", meta.id)).toBe(false);
    expect(await deleteReviewRecord("u1", meta.id)).toBe(true);
    expect(await listReviewRecords("u1", "d1")).toEqual([]);
  });

  it("每篇只留最近若干条，老的自己挤掉；别的文章不受牵连", async () => {
    await save("u1", "另一篇");
    for (let i = 0; i < MAX_RECORDS_PER_DOC + 3; i++) await save();
    const list = await listReviewRecords("u1", "d1");
    expect(list).toHaveLength(MAX_RECORDS_PER_DOC);
    expect(list[0].id).toBe(`r${MAX_RECORDS_PER_DOC + 4}`);
    expect(await listReviewRecords("u1", "另一篇")).toHaveLength(1);
  });

  it("动作表只认两种按钮，乱七八糟的丢掉", () => {
    expect(cleanActions({ a: "ignored", b: "acked", c: "accepted", d: 1 })).toEqual({
      a: "ignored",
      b: "acked",
    });
    expect(cleanActions(["ignored"])).toEqual({});
    expect(cleanActions(null)).toEqual({});
  });

  it("文章 id：空的、不是字符串的、长得离谱的都不收", () => {
    expect(cleanDocId(" abc ")).toBe("abc");
    expect(cleanDocId("")).toBeNull();
    expect(cleanDocId(12)).toBeNull();
    expect(cleanDocId("x".repeat(101))).toBeNull();
  });
});
