/**
 * 当日记录的云同步：本地 localStorage（events.ts）↔ /api/day-log。
 *
 * 推：events.ts 每次改动给事件标脏（带 rev）、删除记进待删集合，这里 5 秒防抖后分批 PUT；
 *    成功回来先对代际（换账号）再按 rev 清脏——在飞期间又被合并写入的那条 rev 已变，留给下一轮。
 * 拉：随文档同步（sync.ts 的 syncNow）一起跑，首次按日期全量、此后按 updatedAt 游标增量；
 *    本地还有没推上去的改动时本地优先，服务端那份跳过。
 * 只有 startDayLogSync 启动后（即登录态的工作台里）才会防抖推送：本地模式不该有任何请求。
 */

import { isSyncHeld } from "@/lib/mirrorOwner";
import { getSessionEpoch, isCurrentEpoch } from "@/lib/sessionEpoch";
import { readLocal, writeLocal } from "@/features/workspace/lib/storage";
import { shiftDay, todayKey } from "./dates";
import {
  DAY_LOG_CHANGED_EVENT,
  DAY_LOG_CURSOR_KEY,
  listDayLogKeys,
  readDayEvents,
  readDeleted,
  readDirty,
  writeDayEvents,
  writeDeleted,
  writeDirty,
  type DayEvent,
} from "./events";

const ENDPOINT = "/api/day-log";
/** 与服务端单次上限一致 */
const BATCH = 200;
const PUSH_DEBOUNCE_MS = 5000;
/** 首次全量拉多少天：与本地保留天数一致，再早的拉下来也会被 pruneOld 删掉 */
const PULL_DAYS = 60;
/** 增量拉取最多连翻几页：防服务端异常时死循环，剩下的下一轮同步再拉 */
const MAX_PULL_PAGES = 10;
/** keepalive 请求体上限是 64KB，留点余量 */
const KEEPALIVE_MAX_BYTES = 60_000;

/** 服务端下发的事件 */
export interface ServerDayEvent {
  id: string;
  day: string;
  ts: number;
  end: number | null;
  kind: DayEvent["kind"];
  docId: string | null;
  title: string | null;
  chars: number | null;
  text: string | null;
  deleted: boolean;
  updatedAt: string;
}

interface UpsertPayload {
  id: string;
  day: string;
  ts: number;
  end: number | null;
  kind: DayEvent["kind"];
  docId: string | null;
  title: string | null;
  chars: number | null;
  text: string | null;
}

const online = () => typeof navigator === "undefined" || navigator.onLine;

let started = false;
let timer: ReturnType<typeof setTimeout> | null = null;
let pushing = false;
let pendingRerun = false;

function toPayload(day: string, e: DayEvent): UpsertPayload {
  return {
    id: e.id,
    day,
    ts: e.ts,
    end: e.end ?? null,
    kind: e.kind,
    docId: e.docId ?? null,
    title: e.title ?? null,
    chars: e.chars ?? null,
    text: e.text ?? null,
  };
}

/**
 * 按脏标记收集要推的事件。同一天只读一次；
 * 脏标记指向的事件已经不在本地（被 pruneOld 清掉、或标记残留）的记进 orphans，推送成功后顺手清掉。
 */
function collectDirty(): { upserts: { payload: UpsertPayload; rev: number }[]; orphans: Map<string, number> } {
  const dirty = readDirty();
  const byDay = new Map<string, Map<string, DayEvent>>();
  const upserts: { payload: UpsertPayload; rev: number }[] = [];
  const orphans = new Map<string, number>();
  for (const [id, { day, rev }] of Object.entries(dirty)) {
    let events = byDay.get(day);
    if (!events) {
      events = new Map(readDayEvents(day).map((e) => [e.id, e]));
      byDay.set(day, events);
    }
    const e = events.get(id);
    if (e) upserts.push({ payload: toPayload(day, e), rev });
    else orphans.set(id, rev);
  }
  return { upserts, orphans };
}

/** 推送成功后清脏：rev 一致才清，不一致说明在飞期间又改过，留给下一轮 */
function clearDirtyRevs(sent: Map<string, number>): void {
  const dirty = readDirty();
  let changed = false;
  for (const [id, rev] of sent) {
    if (dirty[id]?.rev === rev) {
      delete dirty[id];
      changed = true;
    }
  }
  if (changed) writeDirty(dirty);
}

function clearDeleted(sent: string[]): void {
  if (sent.length === 0) return;
  const done = new Set(sent);
  writeDeleted(readDeleted().filter((id) => !done.has(id)));
}

type PushResult = "ok" | "stop";

/** 推一轮：分批 PUT。任何失败都保留脏标记——401/4xx 重试也没用，等下一次触发；网络与 5xx 同样下次再来 */
async function pushOnce(): Promise<PushResult> {
  const { upserts, orphans } = collectDirty();
  const deleted = readDeleted();
  if (upserts.length === 0 && deleted.length === 0) {
    if (orphans.size > 0) clearDirtyRevs(orphans);
    return "ok";
  }
  const epoch = getSessionEpoch();
  const rounds = Math.max(Math.ceil(upserts.length / BATCH), Math.ceil(deleted.length / BATCH));
  for (let i = 0; i < rounds; i++) {
    const up = upserts.slice(i * BATCH, (i + 1) * BATCH);
    const del = deleted.slice(i * BATCH, (i + 1) * BATCH);
    let res: Response;
    try {
      res = await fetch(ENDPOINT, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ upsert: up.map((u) => u.payload), delete: del }),
      });
    } catch {
      return "stop"; // 断网 / DNS 失败：脏标记留着
    }
    // 代际变了（登出 / 换账号，本地日志已被 clearDayLog 清空）：这份确认不属于当前会话
    if (!isCurrentEpoch(epoch)) return "stop";
    if (!res.ok) return "stop";
    clearDirtyRevs(new Map(up.map((u) => [u.payload.id, u.rev])));
    clearDeleted(del);
  }
  if (orphans.size > 0) clearDirtyRevs(orphans);
  return "ok";
}

/**
 * 把本地脏改动推上云。单飞：已有一轮在跑时只置 pendingRerun，跑完再补一轮读最新状态。
 * 意外一律吞掉——防抖定时器那条链路没人接 rejection。
 */
export async function pushDayLog(): Promise<void> {
  if (!online() || isSyncHeld()) return;
  if (pushing) {
    pendingRerun = true;
    return;
  }
  if (Object.keys(readDirty()).length === 0 && readDeleted().length === 0) return;
  pushing = true;
  try {
    let result: PushResult;
    do {
      pendingRerun = false;
      result = await pushOnce().catch((): PushResult => "stop");
    } while (pendingRerun && result === "ok");
  } finally {
    pushing = false;
  }
}

/** 防抖推送：write 事件约每秒一次，攒 5 秒再发；未启动同步（本地模式）时什么都不做 */
export function scheduleDayLogPush(): void {
  if (!started) return;
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    timer = null;
    void pushDayLog();
  }, PUSH_DEBOUNCE_MS);
}

/**
 * 页面隐藏 / 关闭时把还在防抖窗口里的改动立即发出去。keepalive 请求的结果拿不到，
 * 所以不清脏标记——下次打开再推一遍，服务端按 id upsert 是幂等的。体量超出 keepalive 上限的部分留给下次。
 */
function flushOnHide(): void {
  if (isSyncHeld() || !online()) return;
  const { upserts } = collectDirty();
  const deleted = readDeleted().slice(0, BATCH);
  if (upserts.length === 0 && deleted.length === 0) return;
  const encoder = new TextEncoder();
  const body = { upsert: [] as UpsertPayload[], delete: deleted };
  for (const u of upserts.slice(0, BATCH)) {
    body.upsert.push(u.payload);
    if (encoder.encode(JSON.stringify(body)).length > KEEPALIVE_MAX_BYTES) {
      body.upsert.pop();
      break;
    }
  }
  try {
    void fetch(ENDPOINT, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // 页面正在卸载时 fetch 可能同步抛，忽略
  }
}

/** 启动当日记录同步的常驻监听（与 startSync 同处挂载），返回清理函数 */
export function startDayLogSync(): () => void {
  started = true;
  const onHide = () => flushOnHide();
  window.addEventListener("pagehide", onHide);
  return () => {
    started = false;
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
    window.removeEventListener("pagehide", onHide);
  };
}

/** 服务端事件 → 本地事件：null 字段省略，保持与 logEvent 写出的形状一致 */
function fromServer(s: ServerDayEvent): DayEvent {
  const e: DayEvent = { id: s.id, ts: s.ts, kind: s.kind };
  if (s.end !== null) e.end = s.end;
  if (s.docId !== null) e.docId = s.docId;
  if (s.title !== null) e.title = s.title;
  if (s.chars !== null) e.chars = s.chars;
  if (s.text !== null) e.text = s.text;
  return e;
}

/**
 * 纯函数：把一批服务端事件合进本地（{ 日期键: 事件[] }）。
 * - id 在 skipIds（脏标记 + 待删）里的跳过：本地还有没推上去的改动，本地优先；
 * - deleted 的从它所在的那天删掉（按 id 找，不依赖 day 字段）；
 * - 其余按 id 覆盖 / 插入到 event.day；本地若在别的日期键里有同 id，先从那边删掉；
 * - 改动过的日期内按 ts 升序。
 * 返回合并后的完整状态与改动过的日期键（不修改入参）。
 */
export function applyServerEvents(
  local: Record<string, DayEvent[]>,
  incoming: ServerDayEvent[],
  skipIds: Set<string>
): { days: Record<string, DayEvent[]>; changed: string[] } {
  const days: Record<string, DayEvent[]> = {};
  const where = new Map<string, string>();
  for (const [day, list] of Object.entries(local)) {
    days[day] = [...list];
    for (const e of list) where.set(e.id, day);
  }
  const changed = new Set<string>();
  const removeFrom = (day: string, id: string) => {
    days[day] = days[day].filter((e) => e.id !== id);
    changed.add(day);
  };
  for (const s of incoming) {
    if (skipIds.has(s.id)) continue;
    const at = where.get(s.id);
    if (s.deleted) {
      if (at !== undefined) {
        removeFrom(at, s.id);
        where.delete(s.id);
      }
      continue;
    }
    const e = fromServer(s);
    if (at !== undefined && at !== s.day) removeFrom(at, s.id);
    const list = (days[s.day] ??= []);
    const i = at === s.day ? list.findIndex((x) => x.id === s.id) : -1;
    if (i >= 0) list[i] = e;
    else list.push(e);
    where.set(s.id, s.day);
    changed.add(s.day);
  }
  for (const day of changed) days[day].sort((a, b) => a.ts - b.ts);
  return { days, changed: [...changed] };
}

/** 读出本地全部日志，供 applyServerEvents 跨日期找同 id */
function readAllLocal(): Record<string, DayEvent[]> {
  const out: Record<string, DayEvent[]> = {};
  for (const key of listDayLogKeys()) out[key] = readDayEvents(key);
  return out;
}

function isServerEvent(v: unknown): v is ServerDayEvent {
  const e = v as ServerDayEvent;
  return (
    !!e &&
    typeof e.id === "string" &&
    typeof e.day === "string" &&
    typeof e.ts === "number" &&
    typeof e.kind === "string" &&
    typeof e.deleted === "boolean"
  );
}

/**
 * 从云端拉当日记录并合进本地。epoch 由 syncNow 传入：中途换了账号，整批丢弃。
 * 有游标走 ?since= 增量（满页则接着翻），没有则按日期全量拉最近 60 天。
 */
export async function pullDayLog(epoch: number): Promise<void> {
  if (!online() || isSyncHeld()) return;
  let cursor = readLocal(DAY_LOG_CURSOR_KEY);
  const changedAll = new Set<string>();
  for (let page = 0; page < MAX_PULL_PAGES; page++) {
    const url = cursor
      ? `${ENDPOINT}?since=${encodeURIComponent(cursor)}`
      : `${ENDPOINT}?from=${shiftDay(todayKey(), -PULL_DAYS)}`;
    const res = await fetch(url);
    if (!isCurrentEpoch(epoch) || !res.ok) break;
    const body = (await res.json().catch(() => null)) as {
      events?: unknown;
      cursor?: unknown;
      hasMore?: unknown;
    } | null;
    if (!isCurrentEpoch(epoch) || !body || !Array.isArray(body.events)) break;
    const incoming = body.events.filter(isServerEvent);
    if (incoming.length > 0) {
      // 跳过集合每页现读：上一页应用期间用户可能又记了新事件
      const skip = new Set([...Object.keys(readDirty()), ...readDeleted()]);
      const { days, changed } = applyServerEvents(readAllLocal(), incoming, skip);
      for (const day of changed) {
        writeDayEvents(day, days[day]);
        changedAll.add(day);
      }
    }
    const next = typeof body.cursor === "string" ? body.cursor : null;
    // 游标只进不退（同格式 ISO 串可直接字典序比较），先应用再推进：中途失败下次会重拉这一批
    if (next && (!cursor || next > cursor)) {
      cursor = next;
      writeLocal(DAY_LOG_CURSOR_KEY, cursor);
    }
    // 服务端说还有才翻下一页；游标没推进也别再翻，免得原地打转
    if (body.hasMore !== true || next !== cursor) break;
  }
  if (changedAll.size > 0 && isCurrentEpoch(epoch)) {
    // 整批只派发一次；detail 沿用字符串日期键的约定，多天变动时给今天（监听方只用它触发重读）
    const today = todayKey();
    const detail = changedAll.has(today) ? today : [...changedAll].sort().pop()!;
    window.dispatchEvent(new CustomEvent(DAY_LOG_CHANGED_EVENT, { detail }));
  }
}
