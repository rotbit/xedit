import { describe, expect, it, vi } from "vitest";
import { applyServerEvents, pushDayLog, type ServerDayEvent } from "@/lib/todos/dayLogSync";
import { logEvent, readDayEvents, readDeleted, readDirty, removeDayEvent, type DayEvent } from "@/lib/todos/events";

const srv = (id: string, day: string, ts: number, extra: Partial<ServerDayEvent> = {}): ServerDayEvent => ({
  id,
  day,
  ts,
  end: null,
  kind: "task",
  docId: null,
  title: null,
  chars: null,
  text: "t",
  deleted: false,
  updatedAt: "2026-10-10T00:00:00.000Z",
  ...extra,
});
const ev = (id: string, ts: number, text = "t"): DayEvent => ({ id, ts, kind: "task", text });

describe("applyServerEvents", () => {
  it("新事件插入对应日期并按 ts 升序；null 字段省略", () => {
    const local = { "2026-10-08": [ev("a", 10), ev("c", 30)] };
    const { days, changed } = applyServerEvents(local, [srv("b", "2026-10-08", 20, { end: 25 })], new Set());
    expect(changed).toEqual(["2026-10-08"]);
    expect(days["2026-10-08"].map((e) => e.id)).toEqual(["a", "b", "c"]);
    expect(days["2026-10-08"][1]).toEqual({ id: "b", ts: 20, end: 25, kind: "task", text: "t" });
    // 不改入参
    expect(local["2026-10-08"].map((e) => e.id)).toEqual(["a", "c"]);
  });

  it("同 id 覆盖本地那份", () => {
    const local = { "2026-10-08": [ev("a", 10, "旧")] };
    const { days } = applyServerEvents(local, [srv("a", "2026-10-08", 10, { text: "新" })], new Set());
    expect(days["2026-10-08"]).toEqual([{ id: "a", ts: 10, kind: "task", text: "新" }]);
  });

  it("本地脏 / 待删的 id 跳过：本地优先", () => {
    const local = { "2026-10-08": [ev("a", 10, "本地")] };
    const { days, changed } = applyServerEvents(
      local,
      [srv("a", "2026-10-08", 10, { text: "云端" }), srv("gone", "2026-10-08", 5)],
      new Set(["a", "gone"])
    );
    expect(changed).toEqual([]);
    expect(days["2026-10-08"]).toEqual([ev("a", 10, "本地")]);
  });

  it("墓碑把本地那条删掉，按 id 找，不管 day 字段", () => {
    const local = { "2026-10-07": [ev("a", 1)], "2026-10-08": [ev("b", 2)] };
    const { days, changed } = applyServerEvents(
      local,
      [srv("a", "2026-10-08", 1, { deleted: true }), srv("zz", "2026-10-08", 3, { deleted: true })],
      new Set()
    );
    expect(changed).toEqual(["2026-10-07"]);
    expect(days["2026-10-07"]).toEqual([]);
    expect(days["2026-10-08"]).toEqual([ev("b", 2)]);
  });

  it("跨 day 搬家：从旧日期删掉，插进新日期", () => {
    const local = { "2026-10-07": [ev("a", 1), ev("x", 2)], "2026-10-08": [ev("b", 5)] };
    const { days, changed } = applyServerEvents(local, [srv("a", "2026-10-08", 3)], new Set());
    expect(changed.sort()).toEqual(["2026-10-07", "2026-10-08"]);
    expect(days["2026-10-07"].map((e) => e.id)).toEqual(["x"]);
    expect(days["2026-10-08"].map((e) => e.id)).toEqual(["a", "b"]);
  });

  it("本地没有的日期新建键", () => {
    const { days, changed } = applyServerEvents({}, [srv("b", "2026-10-09", 9), srv("a", "2026-10-09", 1)], new Set());
    expect(changed).toEqual(["2026-10-09"]);
    expect(days["2026-10-09"].map((e) => e.id)).toEqual(["a", "b"]);
  });
});

describe("pushDayLog", () => {
  it("成功后按 rev 清脏与待删；401 时全部保留", async () => {
    const ts = new Date(2026, 9, 8, 9).getTime();
    logEvent({ kind: "task", text: "a", ts });
    logEvent({ kind: "task", text: "b", ts: ts + 1 });
    const [a] = readDayEvents("2026-10-08");
    removeDayEvent("2026-10-08", a.id);

    const fail = vi.fn(async () => new Response("{}", { status: 401 }));
    vi.stubGlobal("fetch", fail);
    await pushDayLog();
    expect(fail).toHaveBeenCalledTimes(1);
    expect(Object.keys(readDirty())).toHaveLength(1);
    expect(readDeleted()).toEqual([a.id]);

    let sent: { upsert: { id: string; day: string }[]; delete: string[] } | null = null;
    const ok = vi.fn(async (_url: string, init: RequestInit) => {
      sent = JSON.parse(String(init.body));
      return new Response(JSON.stringify({ ok: true, cursor: null }), { status: 200 });
    });
    vi.stubGlobal("fetch", ok);
    await pushDayLog();
    vi.unstubAllGlobals();
    expect(sent!.delete).toEqual([a.id]);
    expect(sent!.upsert.map((u) => u.day)).toEqual(["2026-10-08"]);
    expect(readDirty()).toEqual({});
    expect(readDeleted()).toEqual([]);
  });
});
