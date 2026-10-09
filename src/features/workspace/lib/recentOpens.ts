"use client";

import { useSyncExternalStore } from "react";
import type { DocMeta } from "../types";
import { readLocal, writeLocal } from "./storage";

/**
 * 「最近打开」的本地记录：{ [docId]: 最后一次打开的毫秒时间戳 }。
 *
 * 为什么放 localStorage 而不进服务端：
 * - 打开是纯客户端行为，阅读不改文档，不该为了它碰 updatedAt 或多打一个接口；
 * - 记录只用来给「最近打开」视图排序，丢了也只是退回按最后编辑排，没有一致性要求；
 * - 已知取舍：换设备 / 换浏览器不同步，各端各记各的。
 */
const KEY = "xedit.recentOpens";
/** 条目上限：只保留最近打开的这么多篇，免得长年累月无限增长 */
const MAX_ENTRIES = 300;
/** 本页内写入后派发，useRecentOpens 据此刷新（storage 事件只在别的标签页触发） */
export const RECENT_OPENS_EVENT = "xedit:recent-opens";

type Opens = Readonly<Record<string, number>>;

/** 服务端快照 / 空记录共用同一个常量，useSyncExternalStore 要求引用稳定 */
const EMPTY: Opens = Object.freeze({});

/** 快照缓存：原始字符串没变就返回同一个对象引用 */
let cacheRaw: string | null | undefined;
let cacheValue: Opens = EMPTY;

function parse(raw: string | null): Opens {
  if (!raw) return EMPTY;
  try {
    const data: unknown = JSON.parse(raw);
    if (!data || typeof data !== "object" || Array.isArray(data)) return EMPTY;
    const out: Record<string, number> = {};
    for (const [id, at] of Object.entries(data as Record<string, unknown>)) {
      if (typeof at === "number" && Number.isFinite(at)) out[id] = at;
    }
    return out;
  } catch {
    return EMPTY;
  }
}

/** 读取全部打开记录；坏数据返回空对象。内容不变时返回同一引用 */
export function readOpens(): Opens {
  const raw = readLocal(KEY);
  if (raw === cacheRaw) return cacheValue;
  cacheRaw = raw;
  cacheValue = parse(raw);
  return cacheValue;
}

function write(next: Record<string, number>) {
  writeLocal(KEY, JSON.stringify(next));
  cacheRaw = undefined; // 失效快照，下一次 readOpens 重新解析
  if (typeof window !== "undefined") window.dispatchEvent(new Event(RECENT_OPENS_EVENT));
}

/** 记一次打开；超出上限时只留最新的 MAX_ENTRIES 条 */
export function markOpened(id: string, now: number = Date.now()): void {
  let entries = Object.entries({ ...readOpens(), [id]: now });
  if (entries.length > MAX_ENTRIES) {
    entries = entries.sort((a, b) => b[1] - a[1]).slice(0, MAX_ENTRIES);
  }
  write(Object.fromEntries(entries));
}

/** 删掉已不在库里的 id；没有变化就不写、不派发 */
export function pruneOpens(liveIds: Iterable<string>): void {
  const live = new Set(liveIds);
  const cur = readOpens();
  const kept = Object.entries(cur).filter(([id]) => live.has(id));
  if (kept.length === Object.keys(cur).length) return;
  write(Object.fromEntries(kept));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === null || e.key === KEY) onChange();
  };
  window.addEventListener(RECENT_OPENS_EVENT, onChange);
  window.addEventListener("storage", onStorage);
  return () => {
    window.removeEventListener(RECENT_OPENS_EVENT, onChange);
    window.removeEventListener("storage", onStorage);
  };
}

/** 订阅打开记录；服务端渲染时恒为空对象 */
export function useRecentOpens(): Opens {
  return useSyncExternalStore(subscribe, readOpens, () => EMPTY);
}

/**
 * 「最近打开」视图用的时间：最后打开与最后编辑取较晚者（编辑也算一种打开）。
 * updatedAt 解析失败按 0；两者都没有时原样返回 updatedAt，交给下游的脏数据兜底。
 */
export function recencyOf(doc: DocMeta, opens: Opens): string {
  const opened = opens[doc.id] ?? 0;
  const parsed = Date.parse(doc.updatedAt);
  const updated = Number.isNaN(parsed) ? 0 : parsed;
  const at = Math.max(opened, updated);
  return at > 0 ? new Date(at).toISOString() : doc.updatedAt;
}
