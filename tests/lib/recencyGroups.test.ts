import { describe, expect, it } from "vitest";
import { groupByRecency } from "@/features/workspace/lib/recencyGroups";
import type { DocMeta } from "@/features/workspace/types";

/** 按本地时间造文档：月份按 1 起算，避免和 Date 的 0 起算月份混淆 */
function doc(id: string, y: number, m: number, d: number, h = 12): DocMeta {
  return { id, title: id, updatedAt: new Date(y, m - 1, d, h).toISOString() };
}

const shape = (docs: DocMeta[], now: Date, locale: "zh" | "en" = "zh") =>
  groupByRecency(docs, now, locale).map((g) => ({
    key: g.key,
    heading: g.heading,
    sub: g.sub,
    ids: g.docs.map((x) => x.id),
  }));

// 2026-10-09 是周五：本周一 10/5，上周 9/28 – 10/4
const FRI = new Date(2026, 9, 9, 15);

describe("groupByRecency：粒度随时间递减", () => {
  it("今天 / 昨天 / 本周每天 / 上周 / 按月", () => {
    const docs = [
      doc("a", 2026, 10, 9, 10),
      doc("b", 2026, 10, 9, 8),
      doc("c", 2026, 10, 8),
      doc("d", 2026, 10, 6),
      doc("e", 2026, 10, 5, 0),
      doc("f", 2026, 10, 4, 23),
      doc("g", 2026, 9, 28),
      doc("h", 2026, 9, 27),
      doc("i", 2026, 9, 1),
      doc("j", 2026, 8, 15),
    ];
    expect(shape(docs, FRI)).toEqual([
      { key: "today", heading: "9", sub: "十月 · 今天", ids: ["a", "b"] },
      { key: "yesterday", heading: "8", sub: "十月 · 昨天", ids: ["c"] },
      { key: "day:2026-10-6", heading: "6", sub: "十月", ids: ["d"] },
      { key: "day:2026-10-5", heading: "5", sub: "十月", ids: ["e"] },
      { key: "lastweek", heading: "上周", sub: "9/28 – 10/4", ids: ["f", "g"] },
      { key: "month:2026-9", heading: "九月", sub: "", ids: ["h", "i"] },
      { key: "month:2026-8", heading: "八月", sub: "", ids: ["j"] },
    ]);
  });

  it("英文标签走 Intl 与字典", () => {
    const docs = [doc("a", 2026, 10, 9), doc("b", 2026, 10, 1), doc("c", 2026, 9, 2)];
    expect(shape(docs, FRI, "en").map((g) => [g.heading, g.sub])).toEqual([
      ["9", "October · Today"],
      ["Last week", "9/28 – 10/4"],
      ["September", ""],
    ]);
  });

  it("今天是周一：昨天（上周日）归昨天，上周只剩周一到周六的日子", () => {
    const mon = new Date(2026, 9, 12, 9);
    const docs = [doc("a", 2026, 10, 11), doc("b", 2026, 10, 10), doc("c", 2026, 10, 5)];
    expect(shape(docs, mon).map((g) => [g.key, g.sub])).toEqual([
      ["yesterday", "十月 · 昨天"],
      ["lastweek", "10/5 – 10/11"],
    ]);
  });

  it("本周与上周跨年：1/1 周四，本周一在去年 12/29", () => {
    const now = new Date(2026, 0, 1, 9);
    const docs = [
      doc("a", 2025, 12, 30),
      doc("b", 2025, 12, 29),
      doc("c", 2025, 12, 22),
      doc("d", 2025, 12, 21),
      doc("e", 2025, 11, 3),
    ];
    expect(shape(docs, now)).toEqual([
      { key: "day:2025-12-30", heading: "30", sub: "十二月", ids: ["a"] },
      { key: "day:2025-12-29", heading: "29", sub: "十二月", ids: ["b"] },
      { key: "lastweek", heading: "上周", sub: "12/22 – 12/28", ids: ["c"] },
      { key: "month:2025-12", heading: "十二月", sub: "2025", ids: ["d"] },
      { key: "month:2025-11", heading: "十一月", sub: "2025", ids: ["e"] },
    ]);
  });

  it("只合并连续同组，不重排", () => {
    const docs = [doc("a", 2026, 9, 10), doc("b", 2026, 8, 10), doc("c", 2026, 9, 3)];
    expect(shape(docs, FRI).map((g) => [g.key, g.ids])).toEqual([
      ["month:2026-9", ["a"]],
      ["month:2026-8", ["b"]],
      ["month:2026-9", ["c"]],
    ]);
  });

  it("脏 updatedAt 回退到当下，落进今天", () => {
    const docs: DocMeta[] = [
      { id: "x", title: "x", updatedAt: "not-a-date" },
      doc("a", 2026, 10, 9),
    ];
    expect(shape(docs, FRI)).toEqual([{ key: "today", heading: "9", sub: "十月 · 今天", ids: ["x", "a"] }]);
  });

  it("传入 timeOf 时按它取时间分组", () => {
    // updatedAt 都是上个月，timeOf 把 a 提到今天
    const docs = [doc("a", 2026, 9, 1), doc("b", 2026, 9, 2)];
    const at: Record<string, string> = { a: new Date(2026, 9, 9, 10).toISOString() };
    const groups = groupByRecency(docs, FRI, "zh", (d) => at[d.id] ?? d.updatedAt);
    expect(groups.map((g) => [g.key, g.docs.map((x) => x.id)])).toEqual([
      ["today", ["a"]],
      ["month:2026-9", ["b"]],
    ]);
  });
});
