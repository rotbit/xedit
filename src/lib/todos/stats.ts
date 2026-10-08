/**
 * 今天页「本月」统计：把当月每天的本地记录汇成逐日数字和月合计。
 *
 * 只读本地日志（只留 60 天），不上云：这是给自己看的节奏感，不是精确报表；
 * 读不到的旧日子自然就是 0。read 可注入，测试不必碰 localStorage。
 */

import { readDayEvents, type DayEvent } from "./events";

export interface DayStat {
  key: string;
  chars: number;
  tasks: number;
  created: number;
  versions: number;
  active: boolean;
  future: boolean;
}

export interface MonthStats {
  /** YYYY-MM */
  month: string;
  days: DayStat[];
  chars: number;
  tasks: number;
  created: number;
  activeDays: number;
}

const pad = (n: number) => String(n).padStart(2, "0");

/** 日期键所在月份：键本身就是补零的 YYYY-MM-DD，截前 7 位即可 */
export function monthOf(dayKey: string): string {
  return dayKey.slice(0, 7);
}

function dayStat(key: string, today: string, read: (key: string) => DayEvent[]): DayStat {
  // 未来的日子不可能有记录，也就不去读存储
  if (key > today) return { key, chars: 0, tasks: 0, created: 0, versions: 0, active: false, future: true };
  const events = read(key);
  let chars = 0;
  let tasks = 0;
  let created = 0;
  let versions = 0;
  for (const e of events) {
    // 删字也算动过笔（active），但不算产出：每条写作记录的负增量按 0 计，
    // 免得一次大删把整天的字数抵成负数、柱子画不出来
    if (e.kind === "write") chars += Math.max(0, e.chars ?? 0);
    else if (e.kind === "task") tasks++;
    else if (e.kind === "create") created++;
    else if (e.kind === "version") versions++;
  }
  return { key, chars, tasks, created, versions, active: events.length > 0, future: false };
}

export function monthStats(
  month: string,
  today: string,
  read: (key: string) => DayEvent[] = readDayEvents
): MonthStats {
  const [y, m] = month.split("-").map(Number);
  // 第 0 天会退回上个月最后一天，正好是 m 月的天数（闰年 2 月由 Date 处理）
  const count = new Date(y, m, 0).getDate();
  const days: DayStat[] = [];
  for (let d = 1; d <= count; d++) days.push(dayStat(`${y}-${pad(m)}-${pad(d)}`, today, read));
  return {
    month,
    days,
    chars: days.reduce((s, d) => s + d.chars, 0),
    tasks: days.reduce((s, d) => s + d.tasks, 0),
    created: days.reduce((s, d) => s + d.created, 0),
    activeDays: days.filter((d) => d.active).length,
  };
}
