/**
 * 「今天」视图的日期口径：一律本地时区的 `YYYY-MM-DD`。
 *
 * 不用 toISOString：它折回 UTC，东八区凌晨写的待办会被算到前一天
 * （同 features/workspace/lib/dayGroups.ts 的 dayKey）。这里比 dayKey 多补了零，
 * 因为日期键要拿来直接做字符串比较（逾期 = due < today），不补零 "2026-10-9" 会大于 "2026-10-10"。
 */

import { getLocale, type Locale } from "@/i18n/locale";
import { translate } from "@/i18n/t";

const pad = (n: number) => String(n).padStart(2, "0");

/** 本地 YYYY-MM-DD（月日补零） */
export function dayKeyOf(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function todayKey(now: Date = new Date()): string {
  return dayKeyOf(now);
}

/** 日期键还原成本地零点；键不合法时返回 null */
function parseKey(key: string): Date | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  return makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
}

/** 只接受真实存在的日期：2/30 这种 Date 会自己进位成 3/2，得拦下来 */
function makeDate(y: number, m: number, d: number): Date | null {
  const date = new Date(y, m - 1, d);
  if (date.getFullYear() !== y || date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/** 前后挪 delta 天：交给 setDate 处理月末、年末与夏令时的退位 */
export function shiftDay(key: string, delta: number): string {
  const date = parseKey(key);
  if (!date) return key;
  date.setDate(date.getDate() + delta);
  return dayKeyOf(date);
}

/** 两个日期相差几天（b - a），按本地零点算，夏令时那一小时用四舍五入抹平 */
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
}

/** 两个日期键相差几天（b - a）；任一个键不合法返回 0 */
export function daysBetween(a: string, b: string): number {
  const da = parseKey(a);
  const db = parseKey(b);
  return da && db ? diffDays(da, db) : 0;
}

/**
 * 不带年份的 `@M/D`：默认今年；但若比今天早超过 180 天，多半是年底写明年初的事，算明年。
 * 180 天这个窗口让「刚过去的几个月」仍按今年算——那是真逾期，不能悄悄挪到明年。
 */
function inferYear(m: number, d: number, today: Date): Date | null {
  const thisYear = makeDate(today.getFullYear(), m, d);
  if (!thisYear) {
    // 2/29 在今年不存在时，明年也多半不存在；照样走一遍兜底
    return makeDate(today.getFullYear() + 1, m, d);
  }
  if (diffDays(thisYear, today) > 180) return makeDate(today.getFullYear() + 1, m, d);
  return thisYear;
}

/**
 * 相对日期标签 → 偏移天数。中英文标签并存且与界面语言无关：
 * 标签写在文章正文里，同一篇可能中英混用，换了界面语言也不能让已有的待办失去日期。
 */
// 用 Map 而不是对象字面量：`@constructor` 这类标签不能命中原型链上的属性
const RELATIVE_TAGS = new Map<string, number>([
  ["今天", 0], // i18n-ignore 数据，不是界面文案
  ["明天", 1], // i18n-ignore
  ["昨天", -1], // i18n-ignore
  ["today", 0],
  ["tomorrow", 1],
  ["yesterday", -1],
]);

/** 认得的标签 → 日期键；不认识返回 null（调用方原样保留那段文字） */
function resolveTag(tag: string, today: string): string | null {
  const rel = RELATIVE_TAGS.get(tag.toLowerCase());
  if (rel !== undefined) return rel === 0 ? today : shiftDay(today, rel);
  const base = parseKey(today);
  if (!base) return null;

  let m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(tag);
  if (m) {
    const date = makeDate(Number(m[1]), Number(m[2]), Number(m[3]));
    return date ? dayKeyOf(date) : null;
  }
  m = /^(\d{1,2})\/(\d{1,2})$/.exec(tag) ?? /^(\d{1,2})月(\d{1,2})日?$/.exec(tag);
  if (m) {
    const date = inferYear(Number(m[1]), Number(m[2]), base);
    return date ? dayKeyOf(date) : null;
  }
  return null;
}

/**
 * 标签（不含 @）→ 开始日 + 结束日。`a~b` 是时间段，两边各按 resolveTag 认；
 * 结束早于开始、或任一边不认识，整个标签都不认（返回 null）。单个日期的 end 为 null。
 */
function resolveRange(tag: string, today: string): { due: string; end: string | null } | null {
  const i = tag.indexOf("~");
  if (i < 0) {
    const due = resolveTag(tag, today);
    return due ? { due, end: null } : null;
  }
  const due = resolveTag(tag.slice(0, i), today);
  const end = resolveTag(tag.slice(i + 1), today);
  if (!due || !end || end < due) return null;
  return { due, end };
}

/** 这个 `@xxx`（不含 @）是不是 parseDueTag 认得的日期标签（含 `a~b` 时间段）；改日期时据此决定剥不剥 */
export function isDueTag(tag: string, today: string): boolean {
  return resolveRange(tag, today) !== null;
}

/** 下周一：今天之后的第一个周一（今天就是周一则是七天后） */
export function nextMonday(today: string): string {
  const d = parseKey(today);
  if (!d) return today;
  const ahead = ((8 - d.getDay()) % 7) || 7;
  return shiftDay(today, ahead);
}

/**
 * 剥掉任务文字末尾的日期标签。只认行尾一个、且前面有空白的 `@xxx`（或时间段 `@开始~结束`）：
 * 句中的 `@某人` 或邮箱不是日期，不该被吃掉；不认识的 `@xxx` 原样留在文字里。
 * end 是时间段的结束日，单个日期为 null。
 */
export function parseDueTag(
  text: string,
  today: string
): { text: string; due: string | null; end: string | null } {
  const trimmed = text.trimEnd();
  const m = /(^|\s)@(\S+)$/.exec(trimmed);
  if (!m) return { text: trimmed, due: null, end: null };
  const range = resolveRange(m[2], today);
  if (!range) return { text: trimmed, due: null, end: null };
  const rest = trimmed.slice(0, m.index).trimEnd();
  // 整行只有一个标签时剥完就空了：保留原文，免得出现一条看不见文字的待办
  return { text: rest || trimmed, due: range.due, end: range.end };
}

/** Intl 格式化器按语言缓存：今天页每行待办都要格式化一次，别反复 new */
const fmtCache = new Map<string, Intl.DateTimeFormat>();
function fmt(locale: string, opts: Intl.DateTimeFormatOptions): Intl.DateTimeFormat {
  const key = `${locale}|${JSON.stringify(opts)}`;
  let f = fmtCache.get(key);
  if (!f) {
    f = new Intl.DateTimeFormat(locale, opts);
    fmtCache.set(key, f);
  }
  return f;
}

/**
 * 日期列的显示：今天 / 明天 / 同年 / 跨年。
 * zh：`10/6`、`2027/1/3`；en：`Oct 6`、`Jan 3, 2027`。
 */
export function formatDue(due: string, today: string, locale: Locale = getLocale()): string {
  if (due === today) return translate("今天", locale);
  if (due === shiftDay(today, 1)) return translate("明天", locale);
  return formatMonthDay(due, today, locale);
}

/**
 * 永远显示数字的月日（formatDue 对今天 / 明天会换成文字，菜单右侧的提示要数字）。
 * zh：`10/12`、跨年 `2027/1/3`；en：`Oct 12`、`Jan 3, 2027`。
 */
export function formatMonthDay(key: string, today: string, locale: Locale = getLocale()): string {
  const d = parseKey(key);
  if (!d) return key;
  const sameYear = key.slice(0, 4) === today.slice(0, 4);
  if (locale === "en") {
    const opts: Intl.DateTimeFormatOptions = sameYear
      ? { month: "short", day: "numeric" }
      : { month: "short", day: "numeric", year: "numeric" };
    return fmt("en-US", opts).format(d);
  }
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return sameYear ? md : `${d.getFullYear()}/${md}`;
}

/** 短星期：zh `周三`，en `Wed`（窄日期列放不下 Wednesday） */
export function formatWeekday(key: string, locale: Locale = getLocale()): string {
  const d = parseKey(key);
  if (!d) return "";
  return locale === "en" ? fmt("en-US", { weekday: "short" }).format(d) : fmt("zh-CN", { weekday: "short" }).format(d);
}

/** 日数字（日期列的大号宋体那个） */
export function dayOfMonth(key: string): number {
  return parseKey(key)?.getDate() ?? 0;
}

/** 页面标题：zh `10 月 8 日` + `周四`；en `October 8` + `Thursday` */
export function formatDayTitle(key: string, locale: Locale = getLocale()): { main: string; sub: string } {
  const d = parseKey(key);
  if (!d) return { main: key, sub: "" };
  if (locale === "en") {
    return {
      main: fmt("en-US", { month: "long", day: "numeric" }).format(d),
      sub: fmt("en-US", { weekday: "long" }).format(d),
    };
  }
  return {
    main: `${d.getMonth() + 1} 月 ${d.getDate()} 日`, // i18n-ignore 中文分支，英文走上面的 Intl
    sub: fmt("zh-CN", { weekday: "short" }).format(d),
  };
}

export type RelativeDay = "today" | "yesterday" | "tomorrow";

/** 相对今天的叫法（语言无关的标识，由 UI 用 t() 显示）；不是前后一天就返回 null */
export function relativeDayLabel(key: string, today: string): RelativeDay | null {
  if (key === today) return "today";
  if (key === shiftDay(today, -1)) return "yesterday";
  if (key === shiftDay(today, 1)) return "tomorrow";
  return null;
}
