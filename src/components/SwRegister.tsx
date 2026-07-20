"use client";

import { useEffect } from "react";

/** 注册离线壳 Service Worker（仅生产环境；开发环境热更新与 SW 缓存互相干扰） */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
