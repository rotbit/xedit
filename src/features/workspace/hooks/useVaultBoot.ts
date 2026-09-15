"use client";

import { useEffect, useRef, useState } from "react";
import { LOCAL_BACKEND_CHANGED_EVENT } from "@/lib/localBackend";
import {
  hasStoredVault,
  restoreVaultOnStartup,
  suspendVault,
  useVaultSession,
  type VaultState,
} from "@/lib/localBackend/vaultSession";
import { ALL } from "../constants";
import type { WorkspaceNav } from "./useWorkspaceNav";

export interface VaultBoot extends VaultState {
  /** 正在异步恢复上次的库：这段时间别急着按浏览器存储渲染，否则会闪一帧落地页 */
  booting: boolean;
}

/**
 * Vault 的启动与切库善后：进本地模式就试着恢复上次打开的文件夹，
 * 后端一换（开库/关库）就把导航复位——正在读的那篇属于旧库，id 在新库里不存在。
 */
export function useVaultBoot({
  localMode,
  nav,
}: {
  localMode: boolean;
  nav: WorkspaceNav;
}): VaultBoot {
  const vault = useVaultSession();
  // 句柄在 IndexedDB，读它要等一轮异步。首次进本地模式时先按同步标记判断要不要等
  const [boot, setBoot] = useState<"idle" | "waiting" | "done">("idle");
  if (localMode && boot === "idle") setBoot(hasStoredVault() ? "waiting" : "done");
  // 登录后离开本地模式：回到 idle，下次退出登录再进来重新判断
  if (!localMode && boot !== "idle") setBoot("idle");

  // 登录后把库挂起（句柄保留），退出登录回到本地模式再恢复
  useEffect(() => {
    if (!localMode) {
      void suspendVault();
      return;
    }
    void restoreVaultOnStartup().finally(() => setBoot("done"));
  }, [localMode]);

  // 换库回调在用户点下那一刻才执行（必然晚于本次渲染的 effect），effect 里同步 ref 足够新鲜
  const navRef = useRef(nav);
  useEffect(() => {
    navRef.current = nav;
  }, [nav]);

  useEffect(() => {
    if (!localMode) return;
    const reset = () => {
      navRef.current.setReadingId(null);
      navRef.current.setActiveCat(ALL);
    };
    window.addEventListener(LOCAL_BACKEND_CHANGED_EVENT, reset);
    return () => window.removeEventListener(LOCAL_BACKEND_CHANGED_EVENT, reset);
  }, [localMode]);

  return { ...vault, booting: boot === "waiting" };
}
