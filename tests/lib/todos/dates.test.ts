import { describe, expect, it } from "vitest";
import {
  dayKeyOf,
  daysBetween,
  formatDayTitle,
  formatDue,
  isDueTag,
  parseDueTag,
  relativeDayLabel,
  shiftDay,
  splitRepeatTag,
  todayKey,
} from "@/lib/todos/dates";

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
    expect(parseDueTag("交稿 @今天", T)).toEqual({ text: "交稿", due: T, end: null });
    expect(parseDueTag("交稿 @明天", T)).toEqual({ text: "交稿", due: "2026-10-09", end: null });
    expect(parseDueTag("交稿 @昨天", T)).toEqual({ text: "交稿", due: "2026-10-07", end: null });
  });

  it("M/D、M月D日、完整日期", () => {
    expect(parseDueTag("改图 @10/10", T)).toEqual({ text: "改图", due: "2026-10-10", end: null });
    expect(parseDueTag("改图 @10月10日", T)).toEqual({ text: "改图", due: "2026-10-10", end: null });
    expect(parseDueTag("改图 @2026-10-10", T)).toEqual({ text: "改图", due: "2026-10-10", end: null });
    expect(parseDueTag("改图 @2027-1-3", T)).toEqual({ text: "改图", due: "2027-01-03", end: null });
  });

  it("不带年份：早于今天超过 180 天算明年，否则算今年（逾期）", () => {
    expect(parseDueTag("年会 @1/3", T).due).toBe("2027-01-03");
    expect(parseDueTag("复盘 @9/1", T).due).toBe("2026-09-01");
    // 4/12 距 10/8 正好 179 天，仍算今年
    expect(parseDueTag("x @4/12", T).due).toBe("2026-04-12");
    expect(parseDueTag("x @4/10", T).due).toBe("2027-04-10");
  });

  it("不认识或不在行尾的 @ 原样保留", () => {
    expect(parseDueTag("问 @小王 稿子", T)).toEqual({ text: "问 @小王 稿子", due: null, end: null });
    expect(parseDueTag("找 @小王", T)).toEqual({ text: "找 @小王", due: null, end: null });
    expect(parseDueTag("发 a@明天", T)).toEqual({ text: "发 a@明天", due: null, end: null });
    expect(parseDueTag("x @2/30", T)).toEqual({ text: "x @2/30", due: null, end: null });
    expect(parseDueTag("x @13/1", T).due).toBeNull();
  });

  it("formatDue / formatDayTitle / relativeDayLabel", () => {
    expect(formatDue(T, T, "zh")).toBe("今天");
    expect(formatDue("2026-10-09", T, "zh")).toBe("明天");
    expect(formatDue("2026-10-06", T, "zh")).toBe("10/6");
    expect(formatDue("2027-01-03", T, "zh")).toBe("2027/1/3");
    expect(formatDayTitle(T, "zh")).toEqual({ main: "10 月 8 日", sub: "周四" });
    expect(relativeDayLabel("2026-10-07", T)).toBe("yesterday");
    expect(relativeDayLabel("2026-10-09", T)).toBe("tomorrow");
    expect(relativeDayLabel(T, T)).toBe("today");
    expect(relativeDayLabel("2026-10-01", T)).toBeNull();
  });

  it("英文标签不分大小写，与中文标签并存、与界面语言无关", () => {
    expect(parseDueTag("Submit draft @today", T)).toEqual({ text: "Submit draft", due: T, end: null });
    expect(parseDueTag("Submit draft @Tomorrow", T)).toEqual({ text: "Submit draft", due: "2026-10-09", end: null });
    expect(parseDueTag("Submit draft @YESTERDAY", T)).toEqual({ text: "Submit draft", due: "2026-10-07", end: null });
    expect(parseDueTag("交稿 @today", T)).toEqual({ text: "交稿", due: T, end: null });
    // 原型链上的名字不是日期标签
    expect(parseDueTag("x @constructor", T)).toEqual({ text: "x @constructor", due: null, end: null });
    expect(parseDueTag("x @todays", T).due).toBeNull();
  });

  it("时间段 @开始~结束：绝对、相对混用，写法同单个日期", () => {
    expect(parseDueTag("写书 @2026-10-09~2026-10-12", T)).toEqual({ text: "写书", due: "2026-10-09", end: "2026-10-12" });
    expect(parseDueTag("写书 @今天~10/12", T)).toEqual({ text: "写书", due: T, end: "2026-10-12" });
    expect(parseDueTag("写书 @tomorrow~10月20日", T)).toEqual({ text: "写书", due: "2026-10-09", end: "2026-10-20" });
    // 开始结束同一天也认
    expect(parseDueTag("写书 @10/9~10/9", T)).toEqual({ text: "写书", due: "2026-10-09", end: "2026-10-09" });
    expect(isDueTag("2026-10-09~2026-10-12", T)).toBe(true);
  });

  it("时间段：结束早于开始、任一边不认识、不在行尾都不认", () => {
    expect(parseDueTag("写书 @10/12~10/9", T)).toEqual({ text: "写书 @10/12~10/9", due: null, end: null });
    expect(parseDueTag("写书 @明天~昨天", T).due).toBeNull();
    expect(parseDueTag("写书 @10/9~老王", T).due).toBeNull();
    expect(parseDueTag("写书 @10/9~", T).due).toBeNull();
    expect(parseDueTag("写书 @10/9~10/12 再说", T)).toEqual({ text: "写书 @10/9~10/12 再说", due: null, end: null });
    expect(isDueTag("10/12~10/9", T)).toBe(false);
  });

  it("daysBetween 按本地零点算天数，跨月跨年", () => {
    expect(daysBetween(T, T)).toBe(0);
    expect(daysBetween("2026-10-08", "2026-10-12")).toBe(4);
    expect(daysBetween("2026-12-30", "2027-01-02")).toBe(3);
    expect(daysBetween("2026-10-12", "2026-10-08")).toBe(-4);
    expect(daysBetween("bad", T)).toBe(0);
  });

  it("en 格式化", () => {
    expect(formatDue(T, T, "en")).toBe("Today");
    expect(formatDue("2026-10-09", T, "en")).toBe("Tomorrow");
    expect(formatDue("2026-10-06", T, "en")).toBe("Oct 6");
    expect(formatDue("2027-01-03", T, "en")).toBe("Jan 3, 2027");
    expect(formatDayTitle(T, "en")).toEqual({ main: "October 8", sub: "Thursday" });
    expect(formatDayTitle("bad", "en")).toEqual({ main: "bad", sub: "" });
  });
});

describe("每日重复标签", () => {
  it("isDueTag 认重复标签（带不带完成日），parseDueTag 把它算成今天", () => {
    expect(isDueTag("每天", T)).toBe(true);
    expect(isDueTag("DAILY:2026-10-01", T)).toBe(true);
    expect(isDueTag("每天:abc", T)).toBe(false);
    expect(parseDueTag("跑步 @每天:2026-10-01", T)).toEqual({ text: "跑步", due: T, end: null });
  });

  it("splitRepeatTag 拆出行尾的重复标签，别的标签不算", () => {
    expect(splitRepeatTag("跑步 @每天  ")).toEqual({ text: "跑步", tag: "每天" });
    expect(splitRepeatTag("Run @Daily:2026-10-01")).toEqual({ text: "Run", tag: "Daily:2026-10-01" });
    expect(splitRepeatTag("跑步 @明天")).toBeNull();
    expect(splitRepeatTag("跑步@每天")).toBeNull();
  });
});
