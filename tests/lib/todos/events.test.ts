import { describe, expect, it } from "vitest";
import { storage } from "../../setup";
import {
  clearDayLog,
  DAY_LOG_CHANGED_EVENT,
  logEvent,
  readDayEvents,
  readDeleted,
  readDirty,
  removeDayEvent,
  WRITE_MERGE_MS,
  type DayEvent,
} from "@/lib/todos/events";

const at = (h: number, m = 0, day = 8) => new Date(2026, 9, day, h, m).getTime();
const K = "2026-10-08";
/** 比较时去掉随机 id */
const strip = (list: DayEvent[]) =>
  list.map((e) => {
    const rest: Partial<DayEvent> = { ...e };
    delete rest.id;
    return rest;
  });

describe("logEvent", () => {
  it("同一篇 30 分钟内的连续保存合并：累加字数（可为负）、延长结束时间", () => {
    logEvent({ kind: "write", docId: "a", title: "旧名", chars: 100, ts: at(9) });
    logEvent({ kind: "write", docId: "a", title: "新名", chars: -20, ts: at(9, 20) });
    logEvent({ kind: "write", docId: "a", chars: 5, ts: at(9, 20) + WRITE_MERGE_MS });
    expect(strip(readDayEvents(K))).toEqual([
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
    expect(strip(readDayEvents("2026-10-09"))).toEqual([{ kind: "write", docId: "a", chars: 3, ts: at(0, 5, 9) }]);
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
    storage.setItem("xedit-day-log:2026-10-08", JSON.stringify([{ ts: "x" }, { ts: 1, kind: "write", id: "k" }, null]));
    expect(readDayEvents(K)).toEqual([{ ts: 1, kind: "write", id: "k" }]);
  });

  it("每条事件都有唯一 id；合并沿用原 id", () => {
    logEvent({ kind: "write", docId: "a", chars: 1, ts: at(9) });
    logEvent({ kind: "write", docId: "a", chars: 1, ts: at(9, 5) });
    logEvent({ kind: "task", text: "x", ts: at(9, 6) });
    const list = readDayEvents(K);
    expect(list).toHaveLength(2);
    expect(list[0].id).toBeTruthy();
    expect(list[1].id).toBeTruthy();
    expect(list[0].id).not.toBe(list[1].id);
  });

  it("新建与合并都标脏：同一条每改一次 rev +1，day 记所在日期", () => {
    logEvent({ kind: "write", docId: "a", chars: 1, ts: at(9) });
    const [e] = readDayEvents(K);
    expect(readDirty()).toEqual({ [e.id]: { day: K, rev: 1 } });
    logEvent({ kind: "write", docId: "a", chars: 1, ts: at(9, 5) });
    expect(readDirty()[e.id]).toEqual({ day: K, rev: 2 });
  });
});

describe("readDayEvents 旧数据迁移", () => {
  it("没有 id 的旧条目就地补 id、写回并标脏；再读 id 不变", () => {
    storage.setItem(
      "xedit-day-log:2026-10-08",
      JSON.stringify([
        { ts: 1, kind: "write", chars: 3 },
        { ts: 2, kind: "task", text: "x", id: "keep" },
      ])
    );
    const first = readDayEvents(K);
    expect(first[0].id).toBeTruthy();
    expect(first[1].id).toBe("keep");
    expect(readDirty()).toEqual({ [first[0].id]: { day: K, rev: 1 } });
    const again = readDayEvents(K);
    expect(again.map((e) => e.id)).toEqual(first.map((e) => e.id));
    // 第二次读没有新补的，不再加 rev
    expect(readDirty()[first[0].id].rev).toBe(1);
  });
});

describe("removeDayEvent", () => {
  it("按 id 删一条、记进待删、清掉它的脏标记并派发事件；对不上什么都不做", () => {
    logEvent({ kind: "create", docId: "a", title: "A", ts: at(9) });
    logEvent({ kind: "task", text: "x", ts: at(9) });
    logEvent({ kind: "version", docId: "a", title: "A", ts: at(10) });
    const task = readDayEvents(K).find((e) => e.kind === "task")!;
    let fired = 0;
    const on = () => fired++;
    window.addEventListener(DAY_LOG_CHANGED_EVENT, on);
    removeDayEvent(K, task.id);
    removeDayEvent(K, "nope");
    removeDayEvent("2026-10-09", task.id);
    window.removeEventListener(DAY_LOG_CHANGED_EVENT, on);
    expect(fired).toBe(1);
    expect(readDayEvents(K).map((e) => e.kind)).toEqual(["create", "version"]);
    expect(readDeleted()).toEqual([task.id]);
    expect(readDirty()[task.id]).toBeUndefined();
  });
});

describe("clearDayLog", () => {
  it("清掉所有日志键与同步状态，不碰别的键", () => {
    logEvent({ kind: "task", text: "x", ts: at(9) });
    removeDayEvent(K, readDayEvents(K)[0].id);
    logEvent({ kind: "task", text: "y", ts: at(10) });
    storage.setItem("xedit-day-log-cursor", "2026-10-08T00:00:00.000Z");
    storage.setItem("other", "1");
    clearDayLog();
    expect(readDayEvents(K)).toEqual([]);
    expect(readDirty()).toEqual({});
    expect(readDeleted()).toEqual([]);
    expect(storage.getItem("xedit-day-log-cursor")).toBeNull();
    expect(storage.getItem("xedit-day-log-pruned")).toBeNull();
    expect(storage.getItem("other")).toBe("1");
  });
});
