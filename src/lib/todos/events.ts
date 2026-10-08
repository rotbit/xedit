/**
 * 「做了」一栏的当日记录：纯本地日志，一天一个 localStorage 键。
 *
 * 不上云、不进 Prisma：这是给自己看的流水账，丢了不心疼；
 * 按天分键是为了读某一天只解析那一天，清理旧日志也只是删键。
 */

import { readLocal, removeLocal, writeLocal } from "@/features/workspace/lib/storage";
import { dayKeyOf, shiftDay } from "./dates";

export interface DayEvent {
  ts: number;
  /** write 合并后的最后一次保存时间；持续时长 = end - ts */
  end?: number;
  kind: "write" | "create" | "version" | "task";
  docId?: string;
  title?: string;
  /** write 的字数增量，删字时为负 */
  chars?: number;
  /** task 的任务文字 */
  text?: string;
}

export const DAY_LOG_CHANGED_EVENT = "xedit:day-log-changed";

const PREFIX = "xedit-day-log:";
/** 上次清理旧日志的日期：清理要遍历所有键，一天跑一次足够 */
const PRUNED_KEY = "xedit-day-log-pruned";
/** 同一篇的连续保存在这个间隔内算「一次写作」 */
export const WRITE_MERGE_MS = 30 * 60_000;
const KEEP_DAYS = 60;

const KINDS = new Set<DayEvent["kind"]>(["write", "create", "version", "task"]);

export function readDayEvents(key: string): DayEvent[] {
  const raw = readLocal(PREFIX + key);
  if (!raw) return [];
  try {
    const list: unknown = JSON.parse(raw);
    if (!Array.isArray(list)) return [];
    // 存储是用户可改的：字段不齐的条目直接丢，别让 UI 渲染出 NaN
    return list.filter(
      (e): e is DayEvent =>
        !!e && typeof e === "object" && typeof (e as DayEvent).ts === "number" && KINDS.has((e as DayEvent).kind)
    );
  } catch {
    return [];
  }
}

/** 删掉 60 天前的日志键；记下今天已清过，同一天不再遍历 */
function pruneOld(today: string) {
  if (readLocal(PRUNED_KEY) === today) return;
  writeLocal(PRUNED_KEY, today);
  const cutoff = shiftDay(today, -KEEP_DAYS);
  const stale: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(PREFIX) && k.slice(PREFIX.length) < cutoff) stale.push(k);
    }
  } catch {
    return;
  }
  // 边遍历边删会让下标错位，先收集再删
  for (const k of stale) removeLocal(k);
}

/**
 * 记一条事件。write 会合并：当天最后一条若是同一篇的 write 且间隔不超过 30 分钟，
 * 就累加字数、把结束时间推到现在——自动保存每几百毫秒一次，不合并的话一天能记上千条。
 * 只看「最后一条」：中间插进别的事件（新建、存档、换一篇写）就另起一段，时间线才读得通。
 */
export function logEvent(e: Omit<DayEvent, "ts"> & { ts?: number }): void {
  const ts = e.ts ?? Date.now();
  const key = dayKeyOf(new Date(ts));
  const list = readDayEvents(key);
  const last = list[list.length - 1];
  if (
    e.kind === "write" &&
    last?.kind === "write" &&
    last.docId === e.docId &&
    ts - (last.end ?? last.ts) <= WRITE_MERGE_MS
  ) {
    last.chars = (last.chars ?? 0) + (e.chars ?? 0);
    last.end = ts;
    if (e.title) last.title = e.title; // 写着写着改了标题，以最新的为准
  } else {
    list.push({ ...e, ts });
  }
  writeLocal(PREFIX + key, JSON.stringify(list));
  pruneOld(key);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DAY_LOG_CHANGED_EVENT, { detail: key }));
  }
}
