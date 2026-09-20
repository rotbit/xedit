import { describe, expect, it } from "vitest";
import { CHANGELOG, formatChangelogDate } from "@/features/changelog/data";

/** 更新日志是手写的数据，最容易犯的错就是日期写错、顺序放反、留了空条目 */
describe("更新日志数据", () => {
  it("日期合法、新的在前、不重复（日期同时是页面锚点）", () => {
    const dates = CHANGELOG.map((e) => e.date);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(d).getTime())).toBe(false);
    }
    expect([...dates].sort().reverse()).toEqual(dates);
    expect(new Set(dates).size).toBe(dates.length);
  });

  it("每条都有标题和至少一项内容", () => {
    for (const e of CHANGELOG) {
      expect(e.title.trim()).not.toBe("");
      expect(e.items.length).toBeGreaterThan(0);
      expect(e.items.every((i) => i.text.trim() !== "")).toBe(true);
    }
  });

  it("日期显示成中文", () => {
    expect(formatChangelogDate("2026-09-05")).toBe("2026 年 9 月 5 日");
  });
});
