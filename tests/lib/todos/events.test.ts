import { describe, expect, it } from "vitest";
import { storage } from "../../setup";
import { DAY_LOG_CHANGED_EVENT, logEvent, readDayEvents, removeDayEvent, WRITE_MERGE_MS } from "@/lib/todos/events";

const at = (h: number, m = 0, day = 8) => new Date(2026, 9, day, h, m).getTime();
const K = "2026-10-08";

describe("logEvent", () => {
  it("同一篇 30 分钟内的连续保存合并：累加字数（可为负）、延长结束时间", () => {
    logEvent({ kind: "write", docId: "a", title: "旧名", chars: 100, ts: at(9) });
    logEvent({ kind: "write", docId: "a", title: "新名", chars: -20, ts: at(9, 20) });
    logEvent({ kind: "write", docId: "a", chars: 5, ts: at(9, 20) + WRITE_MERGE_MS });
    expect(readDayEvents(K)).toEqual([
      { kind: "write", docId: "a", title: "新名", chars: 85, ts: at(9), end: at(9, 20) + WRITE_MERGE_MS },
    ]);
  });

  it("超过 30 分钟、换了一篇、中间插了别的事件都另起一条", () => {
    logEvent({ kind: "write", docId: "a", chars: 1, ts: at(9) });
    logEvent({ kind: "write", docId: "a", chars: 1, ts: at(9) + WRITE_MERGE_MS + 1 });
    logEvent({ kind: "write", docId: "b", chars: 1, ts: at(10) });
    logEvent({ kind: "version", docId: "b", title: "B", ts: at(10, 1) });
    logEvent({ kind: "write", docId: "b", chars: 1, ts: at(10, 2) });
    expect(readDayEvents(K).map((e) => [e.kind, e.docId])).toEqual([
      ["write", "a"],
      ["write", "a"],
      ["write", "b"],
      ["version", "b"],
      ["write", "b"],
    ]);
  });

  it("跨过零点记到新的一天，不与前一天合并", () => {
    logEvent({ kind: "write", docId: "a", chars: 10, ts: at(23, 55) });
    logEvent({ kind: "write", docId: "a", chars: 3, ts: at(0, 5, 9) });
    expect(readDayEvents(K)).toHaveLength(1);
    expect(readDayEvents("2026-10-09")).toEqual([{ kind: "write", docId: "a", chars: 3, ts: at(0, 5, 9) }]);
  });

  it("写后派发事件；顺手清掉 60 天前的日志，且一天只清一次", () => {
    storage.setItem("xedit-day-log:2026-08-01", "[]");
    storage.setItem("xedit-day-log:2026-08-09", "[]");
    let fired = "";
    const on = (e: Event) => (fired = (e as CustomEvent<string>).detail);
    window.addEventListener(DAY_LOG_CHANGED_EVENT, on);
    logEvent({ kind: "create", docId: "a", title: "A", ts: at(9) });
    window.removeEventListener(DAY_LOG_CHANGED_EVENT, on);
    expect(fired).toBe(K);
    expect(storage.getItem("xedit-day-log:2026-08-01")).toBeNull();
    expect(storage.getItem("xedit-day-log:2026-08-09")).toBe("[]");

    storage.setItem("xedit-day-log:2026-07-01", "[]");
    logEvent({ kind: "task", text: "x", ts: at(10) });
    expect(storage.getItem("xedit-day-log:2026-07-01")).toBe("[]");
  });

  it("存储里的脏数据不会让读取出错", () => {
    storage.setItem("xedit-day-log:2026-10-08", "{oops");
    expect(readDayEvents(K)).toEqual([]);
    storage.setItem("xedit-day-log:2026-10-08", JSON.stringify([{ ts: "x" }, { ts: 1, kind: "write" }, null]));
    expect(readDayEvents(K)).toEqual([{ ts: 1, kind: "write" }]);
  });
});

describe("removeDayEvent", () => {
  it("按 ts + kind 删一条并派发事件；对不上什么都不做", () => {
    logEvent({ kind: "create", docId: "a", title: "A", ts: at(9) });
    logEvent({ kind: "task", text: "x", ts: at(9) });
    logEvent({ kind: "version", docId: "a", title: "A", ts: at(10) });
    let fired = 0;
    const on = () => fired++;
    window.addEventListener(DAY_LOG_CHANGED_EVENT, on);
    removeDayEvent(K, at(9), "task");
    removeDayEvent(K, at(11), "task");
    removeDayEvent("2026-10-09", at(10), "version");
    window.removeEventListener(DAY_LOG_CHANGED_EVENT, on);
    expect(fired).toBe(1);
    expect(readDayEvents(K).map((e) => e.kind)).toEqual(["create", "version"]);
  });
});
