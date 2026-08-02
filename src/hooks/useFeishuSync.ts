"use client";

import { useSyncExternalStore } from "react";
import { toast } from "@/components/Toast";

export interface SyncFailure {
  nodeToken: string;
  title: string;
  reason: string;
}

export interface SyncItem {
  title: string;
  action: "created" | "updated";
}

/** 与服务端 SyncBatchResult 对齐的单批返回 */
interface SyncBatch {
  done: boolean;
  total: number;
  pending: number;
  created: number;
  updated: number;
  skipped: number;
  unsupported: number;
  failed: SyncFailure[];
  items: SyncItem[];
  nextUp: string[];
}

/** 跨轮次累计的同步进度（skipped/unsupported/total 取最后一轮的全量口径） */
export interface SyncProgress {
  created: number;
  updated: number;
  skipped: number;
  pending: number;
  total: number;
  failed: SyncFailure[];
}

export interface FeishuSyncState {
  syncing: boolean;
  /** 首批尚未返回：正在扫描知识库目录（大库这一步要几秒） */
  scanning: boolean;
  /** 批次请求瞬时失败，正在退避重试 */
  retrying: boolean;
  /** 正在处理中的文档标题（上一批返回的 nextUp，即当前在跑的这批） */
  current: string[];
  /** 最近完成的文档，新的在前 */
  recent: SyncItem[];
  progress: SyncProgress | null;
  /** 上次同步的中断原因；开始新一轮时清除，完成则保持 null */
  error: string | null;
  /** 中断提示是否已在对话框里看过（右下角胶囊据此决定要不要提醒） */
  errorAcked: boolean;
  /** 授权失效需重新连接；对话框切回连接界面后调 ackReconnect 清除 */
  reconnectRequired: boolean;
}

/**
 * 同步循环放在模块层而不是对话框组件里：关掉对话框同步继续跑、重开还能接上进度，
 * 也天然挡住了重复启动。但关闭/刷新页面会中断（循环靠浏览器驱动），
 * 下次同步会跳过未变动的文档、从剩余部分自动续传。
 */
let state: FeishuSyncState = {
  syncing: false,
  scanning: false,
  retrying: false,
  current: [],
  recent: [],
  progress: null,
  error: null,
  errorAcked: true,
  reconnectRequired: false,
};

const listeners = new Set<() => void>();

function emit(patch: Partial<FeishuSyncState>) {
  state = { ...state, ...patch };
  listeners.forEach((fn) => fn());
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
};
const getState = () => state;

export function useFeishuSync(): FeishuSyncState {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** 给非 React 场景（如焦点回落回调）判断是否在同步 */
export const isFeishuSyncing = () => state.syncing;

/** 对话框消费 reconnectRequired 并切回「连接飞书」界面后调用 */
export function ackReconnect() {
  if (state.reconnectRequired) emit({ reconnectRequired: false });
}

/** 关闭对话框即视为看过中断提示，右下角胶囊不再提醒（面板里的原因保留） */
export function ackSyncError() {
  if (state.error && !state.errorAcked) emit({ errorAcked: true });
}

/** 断开授权时清掉上一次的进度展示（同步中不允许断开，这里只在空闲时生效） */
export function clearFeishuSyncProgress() {
  if (!state.syncing) emit({ progress: null, recent: [], current: [], error: null });
}

/** 重试也救不回来的失败：明确的业务错误，或瞬时故障重试次数耗尽 */
class SyncAbort extends Error {
  needReconnect: boolean;
  constructor(message: string, needReconnect = false) {
    super(message);
    this.needReconnect = needReconnect;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 瞬时故障的退避间隔；服务端滚动发布的切换空档一般也能扛过去 */
const RETRY_DELAYS_MS = [2000, 5000, 15000];

/**
 * 单批请求：网络错误、非 JSON 响应（代理超时回 HTML）、5xx/429 都按瞬时故障重试；
 * 4xx 的业务错误（未登录/授权失效/参数错）重试无意义，直接终止。
 * 批次在服务端是幂等的——写成功但响应丢了的批，重跑会按「未变动」整篇跳过。
 */
async function fetchBatch(payload: object): Promise<SyncBatch> {
  for (let attempt = 0; ; attempt++) {
    let transient: string;
    try {
      const res = await fetch("/api/feishu/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data: (SyncBatch & { error?: string; needReconnect?: boolean }) | null = await res
        .json()
        .catch(() => null);
      if (res.ok && data) {
        if (state.retrying) emit({ retrying: false });
        return data;
      }
      if (data && res.status < 500 && res.status !== 429) {
        throw new SyncAbort(data.error ?? "同步失败", Boolean(data.needReconnect));
      }
      transient = data?.error ?? `服务端暂时不可用（HTTP ${res.status}）`;
    } catch (e) {
      if (e instanceof SyncAbort) throw e;
      transient = "网络请求失败";
    }
    if (attempt >= RETRY_DELAYS_MS.length) {
      throw new SyncAbort(`${transient}，已自动重试 ${RETRY_DELAYS_MS.length} 次`);
    }
    emit({ retrying: true });
    await sleep(RETRY_DELAYS_MS[attempt]);
  }
}

const RECENT_MAX = 8;

export async function startFeishuSync(
  space: { id: string; name: string },
  onSynced: () => void
): Promise<void> {
  if (state.syncing) return;
  emit({
    syncing: true,
    scanning: true,
    retrying: false,
    current: [],
    recent: [],
    progress: null,
    error: null,
    errorAcked: true,
    reconnectRequired: false,
  });
  const acc: SyncProgress = { created: 0, updated: 0, skipped: 0, pending: 0, total: 0, failed: [] };
  // 本轮失败的节点回传给服务端跳过，坏文档不会每一批都重试、卡住进度
  const skip: string[] = [];
  try {
    // 服务端每次只处理一小批（避免超时），循环直到 done；300 轮上限只是防御死循环
    for (let round = 0; round < 300; round++) {
      const data = await fetchBatch({ spaceId: space.id, spaceName: space.name, skip });
      for (const f of data.failed) {
        if (f.nodeToken) skip.push(f.nodeToken);
        // 截断提示这类无 token 条目可能每轮重复出现，去重后再入列表
        if (!acc.failed.some((x) => x.nodeToken === f.nodeToken && x.title === f.title)) {
          acc.failed.push(f);
        }
      }
      acc.created += data.created;
      acc.updated += data.updated;
      acc.skipped = data.skipped + data.unsupported;
      acc.pending = data.pending;
      acc.total = data.total;
      // 灰度窗口里旧服务端可能还没返回这两个字段
      const items = Array.isArray(data.items) ? data.items : [];
      const nextUp = Array.isArray(data.nextUp) ? data.nextUp : [];
      emit({
        scanning: false,
        current: data.done ? [] : nextUp,
        recent: [...[...items].reverse(), ...state.recent].slice(0, RECENT_MAX),
        progress: { ...acc, failed: [...acc.failed] },
      });
      if (data.done) break;
    }
    toast(
      acc.created + acc.updated > 0
        ? `同步完成：新增 ${acc.created} 篇，更新 ${acc.updated} 篇`
        : "同步完成：内容没有变化",
      "success"
    );
    onSynced();
  } catch (e) {
    const msg = e instanceof Error ? e.message : "同步失败";
    // 中断原因固定进面板，不再只有一闪而过的 toast；已同步的批次都已入库，可续传
    emit({
      error: msg,
      errorAcked: false,
      reconnectRequired: e instanceof SyncAbort && e.needReconnect,
    });
    toast(msg, "error");
  } finally {
    emit({ syncing: false, scanning: false, retrying: false, current: [] });
  }
}
