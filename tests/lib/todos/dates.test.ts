import { describe, expect, it } from "vitest";
import { dayKeyOf, formatDayTitle, formatDue, parseDueTag, relativeDayLabel, shiftDay, todayKey } from "@/lib/todos/dates";

const T = "2026-10-08";

describe("dates", () => {
  it("本地日期键补零，挪日跨月跨年", () => {
    expect(dayKeyOf(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
    expect(todayKey(new Date(2026, 9, 8, 0, 1))).toBe(T);
    expect(shiftDay("2026-10-31", 1)).toBe("2026-11-01");
    expect(shiftDay("2026-01-01", -1)).toBe("2025-12-31");
    expect(shiftDay("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("相对日期标签", () => {
    expect(parseDueTag("交稿 @今天", T)).toEqual({ text: "交稿", due: T });
    expect(parseDueTag("交稿 @明天", T)).toEqual({ text: "交稿", due: "2026-10-09" });
    expect(parseDueTag("交稿 @昨天", T)).toEqual({ text: "交稿", due: "2026-10-07" });
  });

  it("M/D、M月D日、完整日期", () => {
    expect(parseDueTag("改图 @10/10", T)).toEqual({ text: "改图", due: "2026-10-10" });
    expect(parseDueTag("改图 @10月10日", T)).toEqual({ text: "改图", due: "2026-10-10" });
    expect(parseDueTag("改图 @2026-10-10", T)).toEqual({ text: "改图", due: "2026-10-10" });
    expect(parseDueTag("改图 @2027-1-3", T)).toEqual({ text: "改图", due: "2027-01-03" });
  });

  it("不带年份：早于今天超过 180 天算明年，否则算今年（逾期）", () => {
    expect(parseDueTag("年会 @1/3", T).due).toBe("2027-01-03");
    expect(parseDueTag("复盘 @9/1", T).due).toBe("2026-09-01");
    // 4/12 距 10/8 正好 179 天，仍算今年
    expect(parseDueTag("x @4/12", T).due).toBe("2026-04-12");
    expect(parseDueTag("x @4/10", T).due).toBe("2027-04-10");
  });

  it("不认识或不在行尾的 @ 原样保留", () => {
    expect(parseDueTag("问 @小王 稿子", T)).toEqual({ text: "问 @小王 稿子", due: null });
    expect(parseDueTag("找 @小王", T)).toEqual({ text: "找 @小王", due: null });
    expect(parseDueTag("发 a@明天", T)).toEqual({ text: "发 a@明天", due: null });
    expect(parseDueTag("x @2/30", T)).toEqual({ text: "x @2/30", due: null });
    expect(parseDueTag("x @13/1", T).due).toBeNull();
  });

  it("formatDue / formatDayTitle / relativeDayLabel", () => {
    expect(formatDue(T, T)).toBe("今天");
    expect(formatDue("2026-10-09", T)).toBe("明天");
    expect(formatDue("2026-10-06", T)).toBe("10/6");
    expect(formatDue("2027-01-03", T)).toBe("2027/1/3");
    expect(formatDayTitle(T)).toEqual({ main: "10 月 8 日", sub: "周四" });
    expect(relativeDayLabel("2026-10-07", T)).toBe("昨天");
    expect(relativeDayLabel("2026-10-09", T)).toBe("明天");
    expect(relativeDayLabel(T, T)).toBe("今天");
    expect(relativeDayLabel("2026-10-01", T)).toBeNull();
  });
});
