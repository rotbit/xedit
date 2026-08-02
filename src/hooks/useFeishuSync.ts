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
  /** 正在处理中的文档标题（上一批返回的 nextUp，即当前在跑的这批） */
  current: string[];
  /** 最近完成的文档，新的在前 */
  recent: SyncItem[];
  progress: SyncProgress | null;
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
  current: [],
  recent: [],
  progress: null,
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

/** 断开授权时清掉上一次的进度展示（同步中不允许断开，这里只在空闲时生效） */
export function clearFeishuSyncProgress() {
  if (!state.syncing) emit({ progress: null, recent: [], current: [] });
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
    current: [],
    recent: [],
    progress: null,
    reconnectRequired: false,
  });
  const acc: SyncProgress = { created: 0, updated: 0, skipped: 0, pending: 0, total: 0, failed: [] };
  // 本轮失败的节点回传给服务端跳过，坏文档不会每一批都重试、卡住进度
  const skip: string[] = [];
  try {
    // 服务端每次只处理一小批（避免超时），循环直到 done；300 轮上限只是防御死循环
    for (let round = 0; round < 300; round++) {
      const res = await fetch("/api/feishu/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spaceId: space.id, spaceName: space.name, skip }),
      });
      const data: SyncBatch & { error?: string; needReconnect?: boolean } = await res.json();
      if (!res.ok) {
        if (data.needReconnect) emit({ reconnectRequired: true });
        throw new Error(data.error ?? "同步失败");
      }
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
    toast(e instanceof Error ? e.message : "同步失败", "error");
  } finally {
    emit({ syncing: false, scanning: false, current: [] });
  }
}
