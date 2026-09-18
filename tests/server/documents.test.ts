import type { Mock } from "vitest";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * 服务层的并发保护（条件更新 + 新建去重）。本机没有数据库，
 * 所以把 prisma 换成假客户端：验证的是这一层自己的判断与递给数据库的参数，
 * 「条件是否真的原子」由 SQL 的 UPDATE … WHERE 保证，不在单测范围内。
 */
vi.mock("@/lib/prisma", () => ({
  prisma: {
    document: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    writingActivity: { upsert: vi.fn() },
  },
}));

/** 留版自己会写库，这里只关心副作用有没有被触发 */
vi.mock("@/lib/versions", () => ({
  autoSnapshot: vi.fn(async () => true),
  AUTOSAVE_RULE: { minIntervalMs: 0, minChars: 0 },
}));

import { prisma } from "@/lib/prisma";
import { autoSnapshot } from "@/lib/versions";
import { createDocumentRow, updateDocument } from "@/lib/documents";

const db = prisma as unknown as {
  document: { findFirst: Mock; updateMany: Mock; update: Mock; create: Mock };
  writingActivity: { upsert: Mock };
};
const snapshot = autoSnapshot as unknown as Mock;

const BASE = new Date("2026-09-18T03:00:00.000Z");
const NEWER = new Date("2026-09-18T03:00:05.000Z");

/** 一行文档；只给被测代码用得上的字段 */
function row(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: "d1",
    userId: "u1",
    title: "旧标题",
    content: "旧正文",
    category: "未分类",
    clientKey: null,
    deletedAt: null,
    createdAt: BASE,
    updatedAt: BASE,
    ...over,
  };
}

beforeEach(() => {
  db.document.findFirst.mockReset();
  db.document.updateMany.mockReset();
  db.document.update.mockReset();
  db.document.create.mockReset();
  db.writingActivity.upsert.mockReset().mockResolvedValue({});
  snapshot.mockReset().mockResolvedValue(true);
});

describe("updateDocument 带 baseUpdatedAt（条件更新）", () => {
  it("服务端已被别人写过：回冲突与当前版本，不落任何写入", async () => {
    db.document.findFirst
      .mockResolvedValueOnce(row()) // 前置读：取旧正文、判在不在回收站
      .mockResolvedValueOnce(row({ updatedAt: NEWER, content: "别的设备写的正文" }));
    db.document.updateMany.mockResolvedValue({ count: 0 });

    const out = await updateDocument("u1", "d1", {
      content: "本地正文",
      baseUpdatedAt: BASE.toISOString(),
    });

    expect(out).toEqual({
      conflict: true,
      doc: expect.objectContaining({ id: "d1", content: "别的设备写的正文", updatedAt: NEWER }),
    });
    // 关键：没有退回无条件覆盖，也没留版、没记流水
    expect(db.document.update).not.toHaveBeenCalled();
    expect(snapshot).not.toHaveBeenCalled();
    expect(db.writingActivity.upsert).not.toHaveBeenCalled();
  });

  it("没匹配上且文档已被删：按不存在处理（null → 路由回 404）", async () => {
    db.document.findFirst.mockResolvedValueOnce(row()).mockResolvedValueOnce(null);
    db.document.updateMany.mockResolvedValue({ count: 0 });

    const out = await updateDocument("u1", "d1", { content: "x", baseUpdatedAt: BASE });
    expect(out).toBeNull();
  });

  it("命中版本：条件写入成功，正文变化触发留版与当日流水", async () => {
    db.document.findFirst.mockResolvedValue(row());
    db.document.updateMany.mockResolvedValue({ count: 1 });

    const out = await updateDocument("u1", "d1", {
      title: "新标题",
      content: "新正文",
      baseUpdatedAt: BASE.toISOString(),
    });

    const args = db.document.updateMany.mock.calls[0][0];
    // where 把版本条件交给数据库；deletedAt 一并带上，回收站里的文章写不进去
    expect(args.where).toEqual({ id: "d1", userId: "u1", deletedAt: null, updatedAt: BASE });
    expect(args.data.title).toBe("新标题");
    expect(args.data.content).toBe("新正文");
    // 时间戳自己盖：回给客户端的就是写进库的那个值，中间不再回查
    expect(args.data.updatedAt.getTime()).toBeGreaterThan(BASE.getTime());
    if (!out || out.conflict) throw new Error("应当写入成功");
    expect(out.updatedAt).toEqual(args.data.updatedAt);

    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(snapshot.mock.calls[0][2]).toBe("新正文");
    expect(db.writingActivity.upsert).toHaveBeenCalledTimes(1);
    expect(db.document.update).not.toHaveBeenCalled();
  });

  it("正文没变只改分类：不留版、不记流水", async () => {
    db.document.findFirst.mockResolvedValue(row());
    db.document.updateMany.mockResolvedValue({ count: 1 });

    await updateDocument("u1", "d1", { category: " 随笔 ", baseUpdatedAt: BASE });

    expect(db.document.updateMany.mock.calls[0][0].data.category).toBe("随笔");
    expect(snapshot).not.toHaveBeenCalled();
    expect(db.writingActivity.upsert).not.toHaveBeenCalled();
  });

  it("同一毫秒内连写：新时间戳至少比基准晚 1ms，否则这次写入对后来者不可见", async () => {
    const future = new Date(Date.now() + 60_000);
    db.document.findFirst.mockResolvedValue(row({ updatedAt: future }));
    db.document.updateMany.mockResolvedValue({ count: 1 });

    await updateDocument("u1", "d1", { content: "x", baseUpdatedAt: future });

    const stamp: Date = db.document.updateMany.mock.calls[0][0].data.updatedAt;
    expect(stamp.getTime()).toBe(future.getTime() + 1);
  });
});

describe("updateDocument 不带 baseUpdatedAt（历史行为）", () => {
  it("走无条件 update，不带任何版本条件", async () => {
    const served = new Date("2026-09-18T04:00:00.000Z");
    db.document.findFirst.mockResolvedValue(row());
    db.document.update.mockResolvedValue({ updatedAt: served });

    const out = await updateDocument("u1", "d1", { content: "新正文" });

    expect(db.document.updateMany).not.toHaveBeenCalled();
    expect(db.document.update).toHaveBeenCalledTimes(1);
    expect(db.document.update.mock.calls[0][0].where).toEqual({ id: "d1" });
    expect(out).toEqual({ conflict: false, updatedAt: served });
    // 副作用与条件路径一致
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(db.writingActivity.upsert).toHaveBeenCalledTimes(1);
  });

  it("文档在回收站：返回 null，一个写都不发", async () => {
    db.document.findFirst.mockResolvedValue(row({ deletedAt: new Date() }));
    expect(await updateDocument("u1", "d1", { content: "x" })).toBeNull();
    expect(db.document.update).not.toHaveBeenCalled();
    expect(db.document.updateMany).not.toHaveBeenCalled();
  });
});

describe("createDocumentRow 的 clientKey 去重", () => {
  it("同一 key 已有文档：原样返回，不再建一篇", async () => {
    const existing = row({ id: "d9", clientKey: "k1" });
    db.document.findFirst.mockResolvedValue(existing);

    const doc = await createDocumentRow("u1", { title: "重试的新建", clientKey: "k1" });

    expect(doc).toBe(existing);
    expect(db.document.findFirst).toHaveBeenCalledWith({ where: { userId: "u1", clientKey: "k1" } });
    expect(db.document.create).not.toHaveBeenCalled();
  });

  it("没有同 key 文档：照常创建，key 一并落库", async () => {
    db.document.findFirst.mockResolvedValue(null);
    db.document.create.mockImplementation(async (a: { data: Record<string, unknown> }) => a.data);

    const doc = await createDocumentRow("u1", { title: "新建", clientKey: "  k2  " });

    expect(db.document.create.mock.calls[0][0].data).toMatchObject({
      userId: "u1",
      title: "新建",
      clientKey: "k2", // 首尾空白裁掉
    });
    expect(doc).toMatchObject({ clientKey: "k2" });
  });

  it("并发重试撞唯一约束（P2002）：重查一次，拿回赢的那篇", async () => {
    const winner = row({ id: "d7", clientKey: "k3" });
    db.document.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    db.document.create.mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));

    expect(await createDocumentRow("u1", { clientKey: "k3" })).toBe(winner);
    expect(db.document.findFirst).toHaveBeenCalledTimes(2);
  });

  it("P2002 之外的错误照常抛出，不吞", async () => {
    db.document.findFirst.mockResolvedValue(null);
    db.document.create.mockRejectedValue(Object.assign(new Error("boom"), { code: "P2010" }));

    await expect(createDocumentRow("u1", { clientKey: "k4" })).rejects.toThrow("boom");
  });

  it("不带 clientKey：行为不变，不去查重、data 里也没有这个字段", async () => {
    db.document.create.mockImplementation(async (a: { data: Record<string, unknown> }) => a.data);

    await createDocumentRow("u1", { title: "普通新建" });

    expect(db.document.findFirst).not.toHaveBeenCalled();
    expect(db.document.create.mock.calls[0][0].data).not.toHaveProperty("clientKey");
  });
});
