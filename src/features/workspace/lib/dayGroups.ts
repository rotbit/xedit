import { getLocale, htmlLang, type Locale } from "@/i18n/locale";
import { translate } from "@/i18n/t";
import type { DocMeta } from "../types";

/** 时间流的一组：同一本地日期下的连续文档 */
export interface DayGroup {
  /** 本地日期键（年-月-日），同时用作 React key */
  key: string;
  /** 左栏的大号日号，如 "11" */
  dayNum: string;
  /** 日号下的小字标签，如 "九月 · 今天" / "September · Today" */
  label: string;
  docs: DocMeta[];
}

/** 月份名交给 Intl：zh-CN 给「九月」，en 给 "September"，不用自己维护两份表 */
function monthOf(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang(locale), { month: "long" }).format(date);
}

/** 本地日期键：必须按本地年月日拼，用 toISOString 会折回 UTC，把深夜的文档分到前一天 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 标签规则：今天 / 昨天带月份前缀，往前只留月份，跨年才补上年份 */
function labelOf(date: Date, now: Date, locale: Locale): string {
  const month = monthOf(date, locale);
  const key = dayKey(date);
  if (key === dayKey(now)) return `${month} · ${translate("今天", locale)}`;
  // 用 setDate(-1) 让 Date 自己处理月初、年初与夏令时的退位
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === dayKey(yesterday)) return `${month} · ${translate("昨天", locale)}`;
  if (date.getFullYear() === now.getFullYear()) return month;
  return `${date.getFullYear()} · ${month}`;
}

/**
 * 按 updatedAt 的本地日期归组。列表已按更新时间倒序，所以只把**连续**同日的文档
 * 收进一组即可，不重排、不跨段合并，顺序与传入完全一致。
 * now 可注入，便于测试今天 / 昨天 / 跨年的分界；locale 由组件从 useLocale() 传入，
 * 切换语言后组件重渲染、标签跟着重算。
 */
export function groupByDay(
  docs: DocMeta[],
  now: Date = new Date(),
  locale: Locale = getLocale()
): DayGroup[] {
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
      label: labelOf(date, now, locale),
      docs: [doc],
    });
  }
  return groups;
}
