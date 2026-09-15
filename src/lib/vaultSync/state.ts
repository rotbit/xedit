"use client";

/**
 * 同步状态仓与「自动同步」开关。
 * 同步从不提问、不打断，所以它的全部表达就是这份状态：界面拿它点一个状态点、
 * 顶多显示几个数字（还有几篇没上云、生成了几个云端副本、几张图没传上去）。
 */

import { useSyncExternalStore } from "react";

export type VaultSyncPhase = "idle" | "syncing" | "synced" | "offline" | "error" | "off";

export interface VaultSyncState {
  phase: VaultSyncPhase;
  /** 还没上云的本地改动数（含离线攒下的） */
  pending: number;
  /** 本次会话生成的「(云端副本)」数 */
  conflicts: number;
  /** 本次会话上传失败的附件数 */
  mediaFailed: number;
  lastSyncAt: string | null;
  error: string | null;
}

/** 服务端快照必须是稳定引用，否则 useSyncExternalStore 水合时会死循环（同 vaultSession 的 CLOSED） */
const IDLE: VaultSyncState = {
  phase: "idle",
  pending: 0,
  conflicts: 0,
  mediaFailed: 0,
  lastSyncAt: null,
  error: null,
};

/** 自动同步开关：缺省视为开 */
const SETTING_KEY = "xedit-vault-autosync";

/** 开关变了：引擎听到后立刻重跑一轮或把状态置为 off */
export const VAULT_SYNC_SETTING_EVENT = "xedit:vault-sync-setting";

let state: VaultSyncState = IDLE;
const listeners = new Set<() => void>();

export function getVaultSyncState(): VaultSyncState {
  return state;
}

export function subscribeVaultSync(cb: () => void): () => void {
  listeners.add(cb);
  return () => void listeners.delete(cb);
}

export function useVaultSyncState(): VaultSyncState {
  return useSyncExternalStore(subscribeVaultSync, getVaultSyncState, () => IDLE);
}

/** 只有引擎会写这份状态 */
export function setVaultSyncState(patch: Partial<VaultSyncState>): void {
  const next = { ...state, ...patch };
  if (same(state, next)) return; // 稳态重跑不该惊动界面
  state = next;
  for (const fn of listeners) fn();
}

export function resetVaultSyncState(): void {
  setVaultSyncState(IDLE);
}

export function isVaultAutoSyncEnabled(): boolean {
  if (typeof window === "undefined") return true;
  try {
    return localStorage.getItem(SETTING_KEY) !== "0";
  } catch {
    return true; // 隐私模式读不了：按默认开
  }
}

export function setVaultAutoSyncEnabled(on: boolean): void {
  try {
    if (on) localStorage.removeItem(SETTING_KEY);
    else localStorage.setItem(SETTING_KEY, "0");
  } catch {
    // 写不进去就只在本次会话生效
  }
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent(VAULT_SYNC_SETTING_EVENT));
  }
}

function same(a: VaultSyncState, b: VaultSyncState): boolean {
  return (
    a.phase === b.phase &&
    a.pending === b.pending &&
    a.conflicts === b.conflicts &&
    a.mediaFailed === b.mediaFailed &&
    a.lastSyncAt === b.lastSyncAt &&
    a.error === b.error
  );
}
