import { describe, expect, it } from "vitest";
import { CHANGELOG, APP_VERSION, formatChangelogDate } from "@/features/changelog/data";
import pkg from "../../package.json";

const semver = (v: string) => v.split(".").map(Number);
const newer = (a: string, b: string) => {
  const [x, y] = [semver(a), semver(b)];
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] > y[i];
  return false;
};

/** The changelog is hand-written data; the easiest mistakes are wrong dates, reversed order and empty entries */
describe("更新日志数据", () => {
  it("日期合法、新的在前（同一天可以有多次发布）", () => {
    const dates = CHANGELOG.map((e) => e.date);
    for (const d of dates) {
      expect(d).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(Number.isNaN(new Date(d).getTime())).toBe(false);
    }
    expect([...dates].sort().reverse()).toEqual(dates);
  });

  it("版本号合法、严格递减（版本号同时是页面锚点）", () => {
    for (const e of CHANGELOG) expect(e.version).toMatch(/^\d+\.\d+\.\d+$/);
    for (let i = 1; i < CHANGELOG.length; i++) {
      expect(newer(CHANGELOG[i - 1].version, CHANGELOG[i].version)).toBe(true);
    }
  });

  it("package.json 的版本与最新一条一致（每次发布两边一起改）", () => {
    expect(pkg.version).toBe(APP_VERSION);
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
