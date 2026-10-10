/**
 * 「做了」一栏的当日记录：一天一个 localStorage 键，登录用户另由 dayLogSync 推拉上云。
 *
 * 本地仍是第一落点：按天分键是为了读某一天只解析那一天，清理旧日志也只是删键；
 * 离线、未登录（本地模式）时它就是全部数据。登录后本地兼作缓存与离线队列——
 * 每次改动给事件打脏标记（带 rev），删除记进待删集合，由同步模块防抖推上去。
 */

import { readLocal, removeLocal, writeLocal } from "@/features/workspace/lib/storage";
import { dayKeyOf, shiftDay } from "./dates";
import { scheduleDayLogPush } from "./dayLogSync";

export interface DayEvent {
  /** 客户端生成的唯一 id：上云幂等（重复推送只会覆盖同一行）、跨设备删除都靠它定位 */
  id: string;
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

export const DAY_LOG_PREFIX = "xedit-day-log:";
/** 上次清理旧日志的日期：清理要遍历所有键，一天跑一次足够 */
const PRUNED_KEY = "xedit-day-log-pruned";
/** 待推送的改动：{ [id]: { day, rev } }。rev 每改一次 +1，推送回来 rev 对得上才清，
 *  防止请求在飞期间又被合并写入、结果被这次成功响应误清掉 */
export const DIRTY_KEY = "xedit-day-log-dirty";
/** 本地已删、还没告诉服务端的 id 列表 */
export const DELETED_KEY = "xedit-day-log-deleted";
/** 增量拉取游标（服务端 updatedAt 的 ISO 串）：放这里是为了 clearDayLog 能一并清掉 */
export const DAY_LOG_CURSOR_KEY = "xedit-day-log-cursor";
/** 同一篇的连续保存在这个间隔内算「一次写作」 */
export const WRITE_MERGE_MS = 30 * 60_000;
const KEEP_DAYS = 60;

const KINDS = new Set<DayEvent["kind"]>(["write", "create", "version", "task"]);

export type DirtyMap = Record<string, { day: string; rev: number }>;

/** 事件 id：优先 randomUUID；老浏览器 / 非安全上下文没有它时退回时间戳 + 随机串，碰撞概率可忽略 */
export function newEventId(): string {
  try {
    if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  } catch {
    // 非安全上下文调用 randomUUID 会抛，落到下面的退路
  }
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function notify(detail: string) {
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(DAY_LOG_CHANGED_EVENT, { detail }));
  }
}

export function readDirty(): DirtyMap {
  const raw = readLocal(DIRTY_KEY);
  if (!raw) return {};
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" && !Array.isArray(v) ? (v as DirtyMap) : {};
  } catch {
    return {};
  }
}

export function writeDirty(map: DirtyMap): void {
  if (Object.keys(map).length === 0) removeLocal(DIRTY_KEY);
  else writeLocal(DIRTY_KEY, JSON.stringify(map));
}

/** 标脏：rev 递增；day 记最新所在的键，推送时据此去那一天里找事件 */
function markDirty(ids: { id: string; day: string }[]): void {
  if (ids.length === 0) return;
  const map = readDirty();
  for (const { id, day } of ids) map[id] = { day, rev: (map[id]?.rev ?? 0) + 1 };
  writeDirty(map);
}

export function readDeleted(): string[] {
  const raw = readLocal(DELETED_KEY);
  if (!raw) return [];
  try {
    const v: unknown = JSON.parse(raw);
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : [];
  } catch {
    return [];
  }
}

export function writeDeleted(ids: string[]): void {
  if (ids.length === 0) removeLocal(DELETED_KEY);
  else writeLocal(DELETED_KEY, JSON.stringify(ids));
}

/** 某天的事件写回本地；空数组直接删键，免得留一堆 "[]" */
export function writeDayEvents(key: string, list: DayEvent[]): void {
  if (list.length === 0) removeLocal(DAY_LOG_PREFIX + key);
  else writeLocal(DAY_LOG_PREFIX + key, JSON.stringify(list));
}

/** 本地所有日志的日期键（不含前缀） */
export function listDayLogKeys(): string[] {
  const keys: string[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k?.startsWith(DAY_LOG_PREFIX)) keys.push(k.slice(DAY_LOG_PREFIX.length));
    }
  } catch {
    // 存储不可用：当作没有日志
  }
  return keys;
}

export function readDayEvents(key: string): DayEvent[] {
  const raw = readLocal(DAY_LOG_PREFIX + key);
  if (!raw) return [];
  let list: unknown;
  try {
    list = JSON.parse(raw);
  } catch {
    return [];
  }
  if (!Array.isArray(list)) return [];
  // 存储是用户可改的：字段不齐的条目直接丢，别让 UI 渲染出 NaN
  const valid = list.filter(
    (e): e is DayEvent =>
      !!e && typeof e === "object" && typeof (e as DayEvent).ts === "number" && KINDS.has((e as DayEvent).kind)
  );
  // 一次性迁移：上云之前记下的旧条目没有 id，就地补上并写回、标脏，
  // 这样存量记录也会在登录后推上去，而且之后每次读到的 id 都稳定不变
  const patched: { id: string; day: string }[] = [];
  for (const e of valid) {
    if (typeof e.id !== "string" || !e.id) {
      e.id = newEventId();
      patched.push({ id: e.id, day: key });
    }
  }
  if (patched.length > 0) {
    writeDayEvents(key, valid);
    markDirty(patched);
    scheduleDayLogPush();
  }
  return valid;
}

/** 删掉 60 天前的日志键；记下今天已清过，同一天不再遍历。
 *  只清本地缓存不碰脏标记与服务端：服务端不清理，留着的是完整历史 */
function pruneOld(today: string) {
  if (readLocal(PRUNED_KEY) === today) return;
  writeLocal(PRUNED_KEY, today);
  const cutoff = shiftDay(today, -KEEP_DAYS);
  // listDayLogKeys 先收集完再删：边遍历边删会让下标错位
  for (const k of listDayLogKeys()) if (k < cutoff) removeLocal(DAY_LOG_PREFIX + k);
}

/**
 * 记一条事件。write 会合并：当天最后一条若是同一篇的 write 且间隔不超过 30 分钟，
 * 就累加字数、把结束时间推到现在——自动保存每几百毫秒一次，不合并的话一天能记上千条。
 * 只看「最后一条」：中间插进别的事件（新建、存档、换一篇写）就另起一段，时间线才读得通。
 * 新建、合并都会标脏并触发（防抖的）上云推送。
 */
export function logEvent(e: Omit<DayEvent, "ts" | "id"> & { ts?: number }): void {
  const ts = e.ts ?? Date.now();
  const key = dayKeyOf(new Date(ts));
  const list = readDayEvents(key);
  const last = list[list.length - 1];
  let id: string;
  if (
    e.kind === "write" &&
    last?.kind === "write" &&
    last.docId === e.docId &&
    ts - (last.end ?? last.ts) <= WRITE_MERGE_MS
  ) {
    last.chars = (last.chars ?? 0) + (e.chars ?? 0);
    last.end = ts;
    if (e.title) last.title = e.title; // 写着写着改了标题，以最新的为准
    id = last.id;
  } else {
    id = newEventId();
    list.push({ ...e, id, ts });
  }
  writeDayEvents(key, list);
  markDirty([{ id, day: key }]);
  pruneOld(key);
  notify(key);
  scheduleDayLogPush();
}

/**
 * 按 id 删一条记录：本地删掉、记进待删集合（推送时告诉服务端打墓碑），并清掉它的脏标记——
 * 已删的事件没必要再 upsert 一次。找不到就什么都不做，也不派发事件：多半是别的标签页已经删过了。
 */
export function removeDayEvent(key: string, id: string): void {
  const list = readDayEvents(key);
  const i = list.findIndex((e) => e.id === id);
  if (i < 0) return;
  list.splice(i, 1);
  writeDayEvents(key, list);
  const dirty = readDirty();
  if (dirty[id]) {
    delete dirty[id];
    writeDirty(dirty);
  }
  const deleted = readDeleted();
  if (!deleted.includes(id)) writeDeleted([...deleted, id]);
  notify(key);
  scheduleDayLogPush();
}

/**
 * 清空本地当日记录及其同步状态。登出 / 换账号时由 docStore.clearMirror 调用：
 * 日志、脏标记、待删、游标都是上一个账号的，带到下一个账号会被当成他的记录推上去。
 */
export function clearDayLog(): void {
  for (const k of listDayLogKeys()) removeLocal(DAY_LOG_PREFIX + k);
  removeLocal(DIRTY_KEY);
  removeLocal(DELETED_KEY);
  removeLocal(DAY_LOG_CURSOR_KEY);
  removeLocal(PRUNED_KEY);
}
