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
  /** 批次请求瞬时失败，正在退避重试（attempt 从 1 计） */
  retry: { attempt: number; reason: string } | null;
  /** 已点停止，等循环在安全点退出 */
  cancelling: boolean;
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
  retry: null,
  cancelling: false,
  current: [],
  recent: [],
  progress: null,
  error: null,
  errorAcked: true,
  reconnectRequired: false,
};

/** 停止请求放在 store 外：它是给循环看的一次性信号，不需要触发渲染 */
let cancelRequested = false;

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

/** 请求停止：循环在安全点（批与批之间、退避等待中）退出，进度保留可续传 */
export function cancelFeishuSync() {
  if (!state.syncing || state.cancelling) return;
  cancelRequested = true;
  emit({ cancelling: true });
}

/** 自动重试救不回来的终止：明确的业务错误，或用户手动停止 */
class SyncAbort extends Error {
  needReconnect: boolean;
  manual: boolean;
  constructor(message: string, opts: { needReconnect?: boolean; manual?: boolean } = {}) {
    super(message);
    this.needReconnect = opts.needReconnect ?? false;
    this.manual = opts.manual ?? false;
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** 小步睡眠：长退避等待中点「停止」也能在半秒内生效 */
async function backoff(ms: number) {
  const step = 500;
  for (let waited = 0; waited < ms && !cancelRequested; waited += step) {
    await sleep(Math.min(step, ms - waited));
  }
}

/** 退避序列；用尽后保持最后一档不放弃，靠持续重试扛过部署、断网这类更长的故障窗口 */
const RETRY_DELAYS_MS = [2000, 5000, 15000, 30000, 60000];

/**
 * 单批请求：网络错误、非 JSON 响应（代理超时回 HTML）、5xx/429 都按瞬时故障
 * 无限退避重试——页面开着同步就不会停，无需手动点继续；「停止」按钮随时可打断。
 * 4xx 的业务错误（未登录/授权失效/参数错）重试无意义，直接终止。
 * 批次在服务端是幂等的——写成功但响应丢了的批，重跑会按「未变动」整篇跳过。
 */
async function fetchBatch(payload: object): Promise<SyncBatch> {
  for (let attempt = 0; ; attempt++) {
    if (cancelRequested) throw new SyncAbort("已手动停止", { manual: true });
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
        if (state.retry) emit({ retry: null });
        return data;
      }
      if (data && res.status < 500 && res.status !== 429) {
        throw new SyncAbort(data.error ?? "同步失败", {
          needReconnect: Boolean(data.needReconnect),
        });
      }
      transient = data?.error ?? `服务端暂时不可用（HTTP ${res.status}）`;
    } catch (e) {
      if (e instanceof SyncAbort) throw e;
      transient = "网络请求失败";
    }
    emit({ retry: { attempt: attempt + 1, reason: transient } });
    await backoff(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)]);
  }
}

const RECENT_MAX = 8;

export async function startFeishuSync(
  space: { id: string; name: string },
  onSynced: () => void
): Promise<void> {
  if (state.syncing) return;
  cancelRequested = false;
  emit({
    syncing: true,
    scanning: true,
    retry: null,
    cancelling: false,
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
    const manual = e instanceof SyncAbort && e.manual;
    // 中断原因固定进面板，不再只有一闪而过的 toast；已同步的批次都已入库，可续传
    emit({
      error: msg,
      // 自己点的停止不用胶囊再提醒
      errorAcked: manual,
      reconnectRequired: e instanceof SyncAbort && e.needReconnect,
    });
    toast(manual ? "同步已停止，随时可以继续" : msg, manual ? "info" : "error");
  } finally {
    emit({ syncing: false, scanning: false, retry: null, cancelling: false, current: [] });
  }
}
