/**
 * 「今天」视图的日期口径：一律本地时区的 `YYYY-MM-DD`。
 *
 * 不用 toISOString：它折回 UTC，东八区凌晨写的待办会被算到前一天
 * （同 features/workspace/lib/dayGroups.ts 的 dayKey）。这里比 dayKey 多补了零，
 * 因为日期键要拿来直接做字符串比较（逾期 = due < today），不补零 "2026-10-9" 会大于 "2026-10-10"。
 */

const WEEKDAYS = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];

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

/** 两个日期键相差几天（b - a），按本地零点算，夏令时那一小时用四舍五入抹平 */
function diffDays(a: Date, b: Date): number {
  return Math.round((b.getTime() - a.getTime()) / 86_400_000);
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

/** 认得的标签 → 日期键；不认识返回 null（调用方原样保留那段文字） */
function resolveTag(tag: string, today: string): string | null {
  if (tag === "今天") return today;
  if (tag === "明天") return shiftDay(today, 1);
  if (tag === "昨天") return shiftDay(today, -1);
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
 * 剥掉任务文字末尾的日期标签。只认行尾一个、且前面有空白的 `@xxx`：
 * 句中的 `@某人` 或邮箱不是日期，不该被吃掉；不认识的 `@xxx` 原样留在文字里。
 */
export function parseDueTag(text: string, today: string): { text: string; due: string | null } {
  const trimmed = text.trimEnd();
  const m = /(^|\s)@(\S+)$/.exec(trimmed);
  if (!m) return { text: trimmed, due: null };
  const due = resolveTag(m[2], today);
  if (!due) return { text: trimmed, due: null };
  const rest = trimmed.slice(0, m.index).trimEnd();
  // 整行只有一个标签时剥完就空了：保留原文，免得出现一条看不见文字的待办
  if (!rest) return { text: trimmed, due };
  return { text: rest, due };
}

/** 日期列的显示：今天 / 明天 / 同年 `10/6` / 跨年 `2027/1/3` */
export function formatDue(due: string, today: string): string {
  if (due === today) return "今天";
  if (due === shiftDay(today, 1)) return "明天";
  const d = parseKey(due);
  if (!d) return due;
  const md = `${d.getMonth() + 1}/${d.getDate()}`;
  return due.slice(0, 4) === today.slice(0, 4) ? md : `${d.getFullYear()}/${md}`;
}

/** 页面标题：`10 月 8 日` + `周四` */
export function formatDayTitle(key: string): { main: string; sub: string } {
  const d = parseKey(key);
  if (!d) return { main: key, sub: "" };
  return { main: `${d.getMonth() + 1} 月 ${d.getDate()} 日`, sub: WEEKDAYS[d.getDay()] };
}

/** 相对今天的叫法；不是前后一天就返回 null，由调用方决定显示什么 */
export function relativeDayLabel(key: string, today: string): string | null {
  if (key === today) return "今天";
  if (key === shiftDay(today, -1)) return "昨天";
  if (key === shiftDay(today, 1)) return "明天";
  return null;
}
