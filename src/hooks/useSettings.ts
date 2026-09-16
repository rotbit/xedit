"use client";

import { useEffect, useRef } from "react";
import type { CustomThemeSpec } from "@/lib/themes/custom";
import type { SidebarOrder } from "@/features/workspace/lib/sidebarOrder";

/**
 * `/api/settings` 的单一读写通道。
 *
 * 首屏原先有两处各拉一次 `/api/settings`（排版偏好 + 自建分类/侧栏排序），
 * 写入也各写各的：同一秒里既可能两个 PUT 并发、又可能拖排序时连发好几个。
 * 这里把读收成模块级的一次 promise（两处订阅同一份），把写收成一条防抖通道
 * （按字段合并，最后一次赢）。服务端 PUT 本身是按字段增量更新的，
 * 所以只带改动过的字段即可，不会把没带的字段清空。
 */

/** GET 回来的原始行（字段都可能缺，老账号还没建过这行时整体为 null） */
export interface UserSettingsRow {
  themeId?: string | null;
  codeThemeId?: string | null;
  customCss?: string | null;
  customThemes?: string | null;
  macCode?: boolean | null;
  linkFootnote?: boolean | null;
  categories?: string | null;
  sidebarOrder?: string | null;
}

/** 可写字段；数组/对象由服务端序列化，客户端按原样传 */
export interface SettingsPatch {
  themeId?: string;
  customCss?: string;
  linkFootnote?: boolean;
  customThemes?: CustomThemeSpec[];
  categories?: string[];
  sidebarOrder?: SidebarOrder;
}

const WRITE_DEBOUNCE_MS = 1000;

let loadPromise: Promise<UserSettingsRow | null> | null = null;
let pendingPatch: SettingsPatch | null = null;
let writeTimer: ReturnType<typeof setTimeout> | null = null;
let flushHooked = false;

/**
 * 读一次云端设置。同一会话内重复调用共用同一个 promise，
 * 失败不进缓存——登录态刚变化时的那次 401 不该把后续的成功读取挡掉。
 */
export function loadSettings(): Promise<UserSettingsRow | null> {
  if (loadPromise) return loadPromise;
  loadPromise = fetch("/api/settings")
    .then((r) => (r.ok ? (r.json() as Promise<UserSettingsRow | null>) : Promise.reject()))
    .catch(() => {
      loadPromise = null;
      return null;
    });
  return loadPromise;
}

function sendPatch(patch: SettingsPatch, keepalive = false): void {
  void fetch("/api/settings", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
    keepalive,
  }).catch(() => undefined); // 写失败不打扰：下一次改动会带上最新值重试
}

/** 立刻把攒着的改动发出去（页面要走了、或调用方明确要求落地） */
export function flushSettingsWrite(keepalive = false): void {
  if (writeTimer) {
    clearTimeout(writeTimer);
    writeTimer = null;
  }
  if (!pendingPatch) return;
  const patch = pendingPatch;
  pendingPatch = null;
  sendPatch(patch, keepalive);
}

/**
 * 写入排队：攒 1s 合并成一个 PUT。同名字段后写覆盖先写，
 * 不同字段合并进同一个请求（排版偏好与侧栏排序常常一起变）。
 */
export function queueSettingsWrite(patch: SettingsPatch): void {
  pendingPatch = { ...pendingPatch, ...patch };
  if (writeTimer) clearTimeout(writeTimer);
  writeTimer = setTimeout(() => {
    writeTimer = null;
    flushSettingsWrite();
  }, WRITE_DEBOUNCE_MS);
  // 拖完排序就关标签页的情况：防抖窗口里的那一次不能丢
  if (!flushHooked && typeof window !== "undefined") {
    flushHooked = true;
    window.addEventListener("pagehide", () => flushSettingsWrite(true));
  }
}

/**
 * 登录后把云端设置喂给 apply，每个订阅方只喂一次。
 * 多处调用共用 loadSettings 的那一次 GET，所以加订阅方不增加请求。
 *
 * @param onSettled 读取有结果（成功或失败）后回调；调用方靠它判断
 *        「云端那份已经落地了」，在此之前不该把本地值回写上去。
 */
export function useCloudSettings(
  enabled: boolean,
  apply: (row: UserSettingsRow) => void,
  onSettled?: () => void
): void {
  // 回调每渲染都是新函数，存 ref：装载只该由 enabled 触发一次
  const applyRef = useRef(apply);
  const settledRef = useRef(onSettled);
  useEffect(() => {
    applyRef.current = apply;
    settledRef.current = onSettled;
  });

  // 只依赖 enabled：登录态翻转一次才装一次；退出再登录会重新装（resetSettings 已作废缓存）。
  // 不能再加「只跑一次」的 ref 守卫——StrictMode 会把 effect 挂载→卸载→再挂载，
  // 守卫会让第二次直接跳过，而第一次已被 cancelled，云端设置就永远应用不上
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void loadSettings()
      .then((row) => {
        if (!cancelled && row) applyRef.current(row);
      })
      .finally(() => {
        if (!cancelled) settledRef.current?.();
      });
    return () => {
      cancelled = true;
    };
  }, [enabled]);
}

/**
 * 登出 / 换账号：作废读缓存，否则下一个账号沿用的还是上一个账号的设置。
 * 防抖窗口里攒着的那次改动属于「还没登出的这个账号」，先带 keepalive 发掉再清，
 * 免得最后一次改主题因为随手登出就丢了。
 */
export function resetSettings(): void {
  flushSettingsWrite(true);
  loadPromise = null;
}
