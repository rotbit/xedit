import { describe, expect, it, vi } from "vitest";
import type { DayEvent } from "@/lib/todos/events";
import { monthOf, monthStats } from "@/lib/todos/stats";

const ev = (kind: DayEvent["kind"], chars?: number): DayEvent => ({ ts: 1, kind, chars });

describe("monthOf", () => {
  it("取日期键的 YYYY-MM", () => {
    expect(monthOf("2026-10-08")).toBe("2026-10");
  });
});

describe("monthStats", () => {
  it("覆盖整月每一天、升序；2 月按平闰年给 28/29 天", () => {
    const none = () => [];
    const oct = monthStats("2026-10", "2026-12-31", none);
    expect(oct.days).toHaveLength(31);
    expect(oct.days[0].key).toBe("2026-10-01");
    expect(oct.days[30].key).toBe("2026-10-31");
    expect(monthStats("2026-02", "2026-12-31", none).days).toHaveLength(28);
    expect(monthStats("2028-02", "2028-12-31", none).days).toHaveLength(29);
    expect(monthStats("2026-09", "2026-12-31", none).days.at(-1)?.key).toBe("2026-09-30");
  });

  it("负数字数按 0 计，但那天仍算 active", () => {
    const read = (k: string) => (k === "2026-10-03" ? [ev("write", -50)] : k === "2026-10-04" ? [ev("write", 100), ev("write", -30)] : []);
    const s = monthStats("2026-10", "2026-10-08", read);
    expect(s.days[2]).toMatchObject({ chars: 0, active: true });
    expect(s.days[3]).toMatchObject({ chars: 100, active: true });
    expect(s.days[4]).toMatchObject({ chars: 0, active: false });
  });

  it("未来的日子不读存储，标记 future", () => {
    const read = vi.fn<(k: string) => DayEvent[]>(() => []);
    const s = monthStats("2026-10", "2026-10-08", read);
    expect(read).toHaveBeenCalledTimes(8);
    expect(read.mock.calls.every(([k]) => k <= "2026-10-08")).toBe(true);
    expect(s.days[7].future).toBe(false);
    expect(s.days[8].future).toBe(true);
  });

  it("逐日计数与月汇总", () => {
    const data: Record<string, DayEvent[]> = {
      "2026-10-01": [ev("write", 300), ev("task"), ev("task"), ev("create")],
      "2026-10-02": [ev("version"), ev("write", 200)],
      "2026-10-05": [ev("task")],
    };
    const s = monthStats("2026-10", "2026-10-08", (k) => data[k] ?? []);
    expect(s.days[0]).toEqual({ key: "2026-10-01", chars: 300, tasks: 2, created: 1, versions: 0, active: true, future: false });
    expect(s.days[1]).toMatchObject({ chars: 200, versions: 1 });
    expect(s).toMatchObject({ month: "2026-10", chars: 500, tasks: 3, created: 1, activeDays: 3 });
  });
});
