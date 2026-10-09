import { getLocale, htmlLang, type Locale } from "@/i18n/locale";
import { translate } from "@/i18n/t";
import type { DocMeta } from "../types";

/**
 * 时间流的一组。粒度随时间递减：今天 / 昨天 / 本周每天各一组，上周并成一组，再往前按月一组。
 *
 * key 有固定格式，组件靠它判断组的种类（不去匹配标签文案，切语言也不会错）：
 * - "today" / "yesterday"
 * - "day:Y-M-D"   本周内其余某天
 * - "lastweek"    上周一到上周日
 * - "month:Y-M"   更早的某个自然月
 */
export interface DayGroup {
  /** 组键，同时用作 React key，格式见上 */
  key: string;
  /** 左栏大字：日号 "11"，或文字标签「上周」「九月」 */
  heading: string;
  /** 大字下的小标签：「十月 · 今天」/ 月份名 / 「9/29 – 10/5」/ 跨年时的年份，可能为空串 */
  sub: string;
  docs: DocMeta[];
}

/** 大字是日号（宋体 30px）的组；其余组（上周 / 某月）是文字标签，字号要收小 */
export function isDayHeading(key: string): boolean {
  return key === "today" || key === "yesterday" || key.startsWith("day:");
}

/** 只有今天、昨天两组的行上显示相对时间，再往前「几天前」已经没有信息量 */
export function showsRelativeTime(key: string): boolean {
  return key === "today" || key === "yesterday";
}

/** 月份名交给 Intl：zh-CN 给「九月」，en 给 "September"，不用自己维护两份表 */
function monthOf(date: Date, locale: Locale): string {
  return new Intl.DateTimeFormat(htmlLang(locale), { month: "long" }).format(date);
}

/** 本地日期键：必须按本地年月日拼，用 toISOString 会折回 UTC，把深夜的文档分到前一天 */
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

/** 本地零点。之后的加减天数一律走 setDate，让 Date 自己处理月初、年初与夏令时的退位 */
function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function addDays(d: Date, n: number): Date {
  const r = new Date(d);
  r.setDate(r.getDate() + n);
  return r;
}

/**
 * 本周一零点。getDay() 周日为 0，换算成「距周一几天」：(getDay() + 6) % 7。
 * 再用 setDate 往回退，跨月（10/1 周三 → 9/29）跨年（1/1 周四 → 12/29）都由 Date 自己进位。
 */
function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  return addDays(day, -((day.getDay() + 6) % 7));
}

/** 日期范围的短写：两种语言都用 "9/29"，比月份名省地方 */
function shortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

/** 算出一篇文档该落进哪一组（只给 key / heading / sub，docs 由调用方收集） */
function bucketOf(date: Date, now: Date, locale: Locale): Omit<DayGroup, "docs"> {
  const today = startOfDay(now);
  const yesterday = addDays(today, -1);
  const thisWeek = startOfWeek(now);
  const lastWeek = addDays(thisWeek, -7);
  const month = monthOf(date, locale);
  const t = date.getTime();

  // 比今天还晚的（客户端时钟偏差）也算今天，不单独开一组「未来」
  if (t >= today.getTime()) {
    return { key: "today", heading: String(date.getDate()), sub: `${month} · ${translate("今天", locale)}` };
  }
  if (t >= yesterday.getTime()) {
    return { key: "yesterday", heading: String(date.getDate()), sub: `${month} · ${translate("昨天", locale)}` };
  }
  // 本周内其余的日子：今天是周一 / 周二时这一段为空，昨天已先一步落进「昨天」
  if (t >= thisWeek.getTime()) {
    return { key: `day:${dayKey(date)}`, heading: String(date.getDate()), sub: month };
  }
  // 上周一到上周日；今天是周一时上周日已是「昨天」，这里自然排除
  if (t >= lastWeek.getTime()) {
    return {
      key: "lastweek",
      heading: translate("上周", locale),
      sub: `${shortDate(lastWeek)} – ${shortDate(addDays(thisWeek, -1))}`,
    };
  }
  // 更早按自然月；年份只在跨年时补上
  return {
    key: `month:${date.getFullYear()}-${date.getMonth() + 1}`,
    heading: month,
    sub: date.getFullYear() === now.getFullYear() ? "" : String(date.getFullYear()),
  };
}

/**
 * 按 updatedAt 的远近归组。列表已按更新时间倒序，所以只把**连续**同组的文档
 * 收进一组即可，不重排、不跨段合并，顺序与传入完全一致。
 * now 可注入，便于测试今天 / 昨天 / 周界 / 跨年；locale 由组件从 useLocale() 传入，
 * 切换语言后组件重渲染、标签跟着重算。
 */
export function groupByRecency(
  docs: DocMeta[],
  now: Date = new Date(),
  locale: Locale = getLocale()
): DayGroup[] {
  const groups: DayGroup[] = [];
  for (const doc of docs) {
    const parsed = new Date(doc.updatedAt);
    // updatedAt 脏数据会解析成 Invalid Date，退回当下，免得整组渲染成 NaN
    const date = Number.isNaN(parsed.getTime()) ? now : parsed;
    const bucket = bucketOf(date, now, locale);
    const last = groups[groups.length - 1];
    if (last && last.key === bucket.key) {
      last.docs.push(doc);
      continue;
    }
    groups.push({ ...bucket, docs: [doc] });
  }
  return groups;
}
