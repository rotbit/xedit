"use client";

import { useEffect } from "react";
import { startVaultSync } from "@/lib/vaultSync/engine";

/**
 * 同步引擎的生命周期：登录 + 库开着才挂，两个条件任一不成立就卸。
 * 引擎自己管触发时机（SYNC_DONE / 文档改动 / 网络恢复 / 开关变动），这里只负责挂和卸；
 * 换账号时 userId 一变会重挂一次，引擎在 startVaultSync 里自行重置上一份记忆。
 */
export function useVaultSync({
  loggedIn,
  userId,
  vaultOpen,
}: {
  loggedIn: boolean;
  userId: string | undefined;
  vaultOpen: boolean;
}) {
  useEffect(() => {
    if (!loggedIn || !userId || !vaultOpen) return;
    return startVaultSync(userId);
  }, [loggedIn, userId, vaultOpen]);
}
