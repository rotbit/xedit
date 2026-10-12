import { describe, expect, it } from "vitest";
import type { TodoItem } from "@/lib/todos/collect";
import type { DayEvent } from "@/lib/todos/events";
import {
  dayDigest,
  earliestLogKey,
  earliestLogMonth,
  mondayOf,
  monthGrid,
  pendingByDay,
  rangeEnd,
  rangeKeys,
  rangeStart,
  shiftMonth,
} from "@/lib/todos/history";

let seq = 0;
const ev = (e: Omit<DayEvent, "id" | "ts"> & { ts?: number }): DayEvent => ({ id: `e${seq++}`, ts: e.ts ?? seq, ...e });
const task = (text: string, ts: number, docId = "notes") => ev({ kind: "task", text, ts, docId });
const write = (docId: string, chars: number, title = docId) => ev({ kind: "write", docId, chars, title });
const create = (docId: string, title = docId) => ev({ kind: "create", docId, title });

describe("dayDigest", () => {
  it("任务按时间升序，同一篇同一句只留最后一条", () => {
    const read = () => [task("b", 5), task("a", 1), task("a", 9), task("a", 3, "other")];
    const d = dayDigest("2026-10-12", read);
    expect(d.tasks.map((e) => `${e.docId}|${e.text}|${e.ts}`)).toEqual(["other|a|3", "notes|b|5", "notes|a|9"]);
    expect(d.active).toBe(true);
  });

  it("文章按篇合并、按字数降序；负字数不计入合计但篇数照算", () => {
    const read = () => [write("x", 100), write("y", -50), write("x", 200), create("z"), write("z", 30)];
    const d = dayDigest("2026-10-12", read);
    expect(d.docs.map((x) => [x.docId, x.chars, x.created])).toEqual([
      ["x", 300, false],
      ["z", 30, true],
      ["y", -50, false],
    ]);
    expect(d.chars).toBe(330);
  });

  it("没有 docId 的按标题合并；没事件则 inactive", () => {
    const read = () => [ev({ kind: "write", title: "旧", chars: 10 }), ev({ kind: "write", title: "旧", chars: 5 })];
    expect(dayDigest("k", read).docs).toHaveLength(1);
    expect(dayDigest("k", () => []).active).toBe(false);
  });
});

describe("周与月", () => {
  it("mondayOf 以周一为首", () => {
    expect(mondayOf("2026-10-12")).toBe("2026-10-12");
    expect(mondayOf("2026-10-11")).toBe("2026-10-05");
    expect(mondayOf("2026-10-01")).toBe("2026-09-28");
  });

  it("monthGrid：2026-10 从周四起，首尾补 null，monday 可在上月", () => {
    const g = monthGrid("2026-10");
    expect(g).toHaveLength(5);
    expect(g[0].monday).toBe("2026-09-28");
    expect(g[0].days).toEqual([null, null, null, "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
    expect(g[4].days).toEqual(["2026-10-26", "2026-10-27", "2026-10-28", "2026-10-29", "2026-10-30", "2026-10-31", null]);
    expect(g.every((r) => r.days.length === 7)).toBe(true);
  });

  it("monthGrid：2026-09 从周二起", () => {
    const g = monthGrid("2026-09");
    expect(g[0].monday).toBe("2026-08-31");
    expect(g[0].days.slice(0, 2)).toEqual([null, "2026-09-01"]);
    expect(g.at(-1)!.days.filter(Boolean).at(-1)).toBe("2026-09-30");
  });

  it("monthGrid：2028-02 闰年 29 天", () => {
    const g = monthGrid("2028-02");
    const days = g.flatMap((r) => r.days).filter(Boolean);
    expect(days).toHaveLength(29);
    expect(days.at(-1)).toBe("2028-02-29");
    expect(g[0].days.indexOf("2028-02-01")).toBe(1); // 2028-02-01 是周二
  });

  it("shiftMonth 跨年", () => {
    expect(shiftMonth("2026-01", -1)).toBe("2025-12");
    expect(shiftMonth("2026-12", 1)).toBe("2027-01");
  });

  it("earliestLogMonth", () => {
    expect(earliestLogMonth(["2026-10-01", "2026-08-30", "junk"])).toBe("2026-08");
    expect(earliestLogMonth([])).toBeNull();
  });
});

describe("rangeKeys", () => {
  const logs = ["2025-12-31", "2026-01-01", "2026-09-30", "2026-10-01", "2026-10-11", "2026-10-12", "2026-10-13", "junk"];

  it("本周：周一到周日，只含有日志的", () => {
    expect(rangeKeys("week", "2026-10-12", logs)).toEqual(["2026-10-12", "2026-10-13"]);
    expect(rangeKeys("week", "2026-10-11", logs)).toEqual(["2026-10-11"]);
  });

  it("本月：1 号到月底，升序", () => {
    expect(rangeKeys("month", "2026-10-12", [...logs].reverse())).toEqual([
      "2026-10-01",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
    ]);
  });

  it("有没做完待办的日子并入（含未来、去重），范围外的与没日志没待办的不收", () => {
    const extra = ["2026-10-16", "2026-10-12", "2026-10-19", "2026-11-02"];
    expect(rangeKeys("week", "2026-10-12", logs, extra)).toEqual(["2026-10-12", "2026-10-13", "2026-10-16"]);
    expect(rangeKeys("month", "2026-10-12", logs, extra)).toEqual([
      "2026-10-01",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
      "2026-10-16",
      "2026-10-19",
    ]);
    expect(rangeKeys("week", "2026-10-12", [], [])).toEqual([]);
  });

  it("rangeEnd", () => {
    expect(rangeEnd("week", "2026-10-11")).toBe("2026-10-11");
    expect(rangeEnd("week", "2026-10-12")).toBe("2026-10-18");
    expect(rangeEnd("month", "2026-02-10")).toBe("2026-02-28");
    expect(rangeEnd("year", "2026-10-12")).toBe("2026-12-31");
  });

  it("本年：1 月 1 日到年底，不含去年和非法键", () => {
    expect(rangeKeys("year", "2026-10-12", logs)).toEqual([
      "2026-01-01",
      "2026-09-30",
      "2026-10-01",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
    ]);
  });

  it("rangeStart 与 earliestLogKey", () => {
    expect(rangeStart("week", "2026-10-11")).toBe("2026-10-05");
    expect(rangeStart("month", "2026-10-12")).toBe("2026-10-01");
    expect(rangeStart("year", "2026-10-12")).toBe("2026-01-01");
    expect(earliestLogKey(logs)).toBe("2025-12-31");
    expect(earliestLogKey(["junk"])).toBeNull();
  });
});

describe("pendingByDay", () => {
  const todo = (text: string, due: string | null, end: string | null = null, checked = false): TodoItem => ({
    key: `d:${text}`,
    docId: "d",
    docTitle: "D",
    line: 0,
    text,
    due,
    end,
    checked,
    repeat: null,
    source: "doc",
    link: null,
  });

  it("单日的落在 due 那天，同一天保持原顺序；没日期的不收", () => {
    const m = pendingByDay([todo("a", "2026-10-12"), todo("x", null), todo("b", "2026-10-12")]);
    expect([...m.keys()]).toEqual(["2026-10-12"]);
    expect(m.get("2026-10-12")!.map((i) => i.text)).toEqual(["a", "b"]);
  });

  it("时间段铺满开始到结束的每一天（跨月）", () => {
    const m = pendingByDay([todo("span", "2026-10-30", "2026-11-02")]);
    expect([...m.keys()]).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });

  it("已勾掉的不收", () => {
    expect(pendingByDay([todo("done", "2026-10-12", "2026-10-14", true)]).size).toBe(0);
  });
});
