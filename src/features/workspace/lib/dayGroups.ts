import type { DocMeta } from "../types";

/** 时间流的一组：同一本地日期下的连续文档 */
export interface DayGroup {
  /** 本地日期键（年-月-日），同时用作 React key */
  key: string;
  /** 左栏的大号日号，如 "11" */
  dayNum: string;
  /** 日号下的小字标签，如 "九月 · 今天" */
  label: string;
  docs: DocMeta[];
}

const MONTHS = [
  "一月",
  "二月",
  "三月",
  "四月",
  "五月",
  "六月",
  "七月",
  "八月",
  "九月",
  "十月",
  "十一月",
  "十二月",
];

/** 本地日期键：必须按本地年月日拼，用 toISOString 会折回 UTC，把深夜的文档分到前一天 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 标签规则：今天 / 昨天带月份前缀，往前只留月份，跨年才补上年份 */
function labelOf(date: Date, now: Date): string {
  const month = MONTHS[date.getMonth()];
  const key = dayKey(date);
  if (key === dayKey(now)) return `${month} · 今天`;
  // 用 setDate(-1) 让 Date 自己处理月初、年初与夏令时的退位
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday)) return `${month} · 昨天`;
  if (date.getFullYear() === now.getFullYear()) return month;
  return `${date.getFullYear()} · ${month}`;
}

/**
 * 按 updatedAt 的本地日期归组。列表已按更新时间倒序，所以只把**连续**同日的文档
 * 收进一组即可，不重排、不跨段合并，顺序与传入完全一致。
 * now 可注入，便于测试今天 / 昨天 / 跨年的分界。
 */
export function groupByDay(docs: DocMeta[], now: Date = new Date()): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const doc of docs) {
    const parsed = new Date(doc.updatedAt);
    // updatedAt 脏数据会解析成 Invalid Date，退回当下，免得整组渲染成 NaN
    const date = Number.isNaN(parsed.getTime()) ? now : parsed;
    const key = dayKey(date);
    const last = groups[groups.length - 1];
    if (last && last.key === key) {
      last.docs.push(doc);
      continue;
    }
    groups.push({
      key,
      dayNum: String(date.getDate()),
      label: labelOf(date, now),
      docs: [doc],
    });
  }
  return groups;
}
