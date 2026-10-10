import { describe, expect, it } from "vitest";
import { storage } from "../../setup";
import type { TodoItem } from "@/lib/todos/collect";
import { doneRecent, doneToday } from "@/features/workspace/components/today/doneToday";

const TODAY = "2026-10-10";
const ts = (day: string, h: number, m = 0) => {
  const [y, mo, d] = day.split("-").map(Number);
  return new Date(y, mo - 1, d, h, m).getTime();
};

let seq = 0;
/** 直接写原始日志：绕开 logEvent，事件的 id / ts 都由测试掌控 */
function seed(day: string, events: { h: number; m?: number; text: string; docId?: string; kind?: string }[]) {
  const list = events.map((e) => ({
    id: `e${++seq}`,
    ts: ts(day, e.h, e.m),
    kind: e.kind ?? "task",
    text: e.text,
    docId: e.docId,
  }));
  storage.setItem(`xedit-day-log:${day}`, JSON.stringify(list));
}

const row = (text: string, docId = "") => ({ text, docId }) as unknown as TodoItem;
const texts = (r: ReturnType<typeof doneRecent>) => r.map((g) => [g.day, g.events.map((e) => e.text)]);

describe("doneRecent", () => {
  it("只取昨天到 7 天前：不含今天、不含第 8 天；按日期倒序、空的天跳过", () => {
    seed(TODAY, [{ h: 9, text: "今天的" }]);
    seed("2026-10-09", [{ h: 9, text: "昨天的" }]);
    seed("2026-10-06", [{ h: 9, text: "四天前" }]);
    seed("2026-10-03", [{ h: 9, text: "七天前" }]);
    seed("2026-10-02", [{ h: 9, text: "八天前" }]);
    expect(texts(doneRecent(TODAY, []))).toEqual([
      ["2026-10-09", ["昨天的"]],
      ["2026-10-06", ["四天前"]],
      ["2026-10-03", ["七天前"]],
    ]);
  });

  it("每天内按时间升序，只看 task 事件", () => {
    seed("2026-10-08", [
      { h: 15, text: "下午" },
      { h: 8, text: "早上" },
      { h: 10, text: "写作", kind: "write" },
    ]);
    expect(texts(doneRecent(TODAY, []))).toEqual([["2026-10-08", ["早上", "下午"]]]);
  });

  it("同一篇同一句勾了又勾只留最后一条，落在最后一次的位置；不同篇的同名句各算各的", () => {
    seed("2026-10-08", [
      { h: 8, text: "改稿", docId: "a" },
      { h: 9, text: "发布" },
      { h: 11, text: "改稿", docId: "a" },
      { h: 12, text: "改稿", docId: "b" },
    ]);
    const [g] = doneRecent(TODAY, []);
    expect(g.events.map((e) => [e.text, e.docId, e.ts])).toEqual([
      ["发布", undefined, ts("2026-10-08", 9)],
      ["改稿", "a", ts("2026-10-08", 11)],
      ["改稿", "b", ts("2026-10-08", 12)],
    ]);
  });

  it("左栏列表里还在的条目（取消了勾选）不进回顾；整天都被排除时那天也不出现", () => {
    seed("2026-10-09", [{ h: 9, text: "取消了的", docId: "a" }]);
    seed("2026-10-08", [
      { h: 9, text: "取消了的", docId: "a" },
      { h: 10, text: "真做完的" },
    ]);
    expect(texts(doneRecent(TODAY, [row("取消了的", "a")]))).toEqual([["2026-10-08", ["真做完的"]]]);
  });

  it("days 可调；与 doneToday 口径一致", () => {
    seed("2026-10-09", [{ h: 9, text: "昨天的" }]);
    seed("2026-10-08", [{ h: 9, text: "前天的" }]);
    seed(TODAY, [{ h: 9, text: "今天的" }]);
    expect(texts(doneRecent(TODAY, [], 1))).toEqual([["2026-10-09", ["昨天的"]]]);
    expect(doneToday(TODAY, []).map((e) => e.text)).toEqual(["今天的"]);
  });
});
