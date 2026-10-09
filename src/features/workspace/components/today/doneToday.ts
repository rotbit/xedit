/**
 * 今天页左栏「做完了」的数据：当天日志里的勾选事件。
 * 页面和左栏共用一份结果（页面拿它判断整页是否全空），所以抽成纯函数只读一次日志。
 */
import type { TodoItem } from "@/lib/todos/collect";
import { readDayEvents, type DayEvent } from "@/lib/todos/events";

const sameTask = (text: string | undefined, docId: string | undefined) => `${docId ?? ""}|${text ?? ""}`;

/**
 * 按时间升序；同一篇同一句勾了又取消再勾，只留最后一条。
 * 左栏列表里还在的条目不重复列：刚勾掉的那条正划线留在列表里，取消勾选的又回到了列表。
 */
export function doneToday(today: string, rows: TodoItem[]): DayEvent[] {
  const shown = new Set(rows.map((r) => sameTask(r.text, r.docId)));
  const last = new Map<string, DayEvent>();
  const tasks = readDayEvents(today)
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
