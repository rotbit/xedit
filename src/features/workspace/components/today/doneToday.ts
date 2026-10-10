/**
 * 今天页左栏「做完了」与「近一周做完的事」的数据：按天日志里的勾选事件。
 * 页面和左栏共用一份结果（页面拿它判断整页是否全空），所以抽成纯函数、每次渲染只读一次日志。
 * 两段用同一套去重规则，回顾里的一天和当天看到的「做完了」口径一致。
 */
import type { TodoItem } from "@/lib/todos/collect";
import { shiftDay } from "@/lib/todos/dates";
import { readDayEvents, type DayEvent } from "@/lib/todos/events";

const sameTask = (text: string | undefined, docId: string | undefined) => `${docId ?? ""}|${text ?? ""}`;

/**
 * 某一天的勾选事件：按时间升序；同一篇同一句勾了又取消再勾，只留最后一条。
 * 左栏列表里还在的条目不列：刚勾掉的那条正划线留在列表里，取消勾选的又回到了列表——
 * 回顾里也照此排除，否则取消勾选的事会以「做完了」的样子留在前几天。
 */
function doneOn(day: string, shown: Set<string>): DayEvent[] {
  const last = new Map<string, DayEvent>();
  const tasks = readDayEvents(day)
    .filter((e) => e.kind === "task")
    .sort((a, b) => a.ts - b.ts);
  // Map 按首次插入排序：先删再设，顺序才落在最后一次勾选的时间上
  for (const e of tasks) {
    const k = sameTask(e.text, e.docId);
    last.delete(k);
    last.set(k, e);
  }
  return [...last.entries()].filter(([k]) => !shown.has(k)).map(([, e]) => e);
}

const shownOf = (rows: TodoItem[]) => new Set(rows.map((r) => sameTask(r.text, r.docId)));

export function doneToday(today: string, rows: TodoItem[]): DayEvent[] {
  return doneOn(today, shownOf(rows));
}

/**
 * 近 days 天（昨天到 days 天前，不含今天——今天归「做完了」）每天做完的事。
 * 没记录的天不进结果，省得展开后一串空标题；按日期倒序，离今天近的在前。
 */
export function doneRecent(
  today: string,
  rows: TodoItem[],
  days = 7
): { day: string; events: DayEvent[] }[] {
  const shown = shownOf(rows);
  const out: { day: string; events: DayEvent[] }[] = [];
  for (let i = 1; i <= days; i++) {
    const day = shiftDay(today, -i);
    const events = doneOn(day, shown);
    if (events.length > 0) out.push({ day, events });
  }
  return out;
}

/**
 * 今天写了多少：日期下那行小结用。
 * chars 是净增量（删字为负），按净值相加——写了一千又删掉八百，说「写了 200 字」才诚实；净值不为正就不提字数。
 * 「改了几篇」数的是今天有过写入或新建的不同文章。
 */
export function writingToday(day: string): { chars: number; docs: number } {
  const events = readDayEvents(day);
  let chars = 0;
  const docs = new Set<string>();
  for (const e of events) {
    if (e.kind !== "write" && e.kind !== "create") continue;
    if (e.docId) docs.add(e.docId);
    if (e.kind === "write") chars += e.chars ?? 0;
  }
  return { chars: Math.max(0, chars), docs: docs.size };
}
