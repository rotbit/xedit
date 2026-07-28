"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * SSR 与客户端首帧返回 false，hydration 完成后立即翻真并触发重渲染。
 * 用途：会话已随 HTML 服务端注入后，useSession 首帧即为终态，
 * 依赖 localStorage（文档镜像、本地文库）的渲染分支必须等到这个标志翻真才能走，
 * 否则服务端（读不到 localStorage）与客户端首帧输出不一致，hydration 报 #418。
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
