"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { knownPermissions, type Permission } from "@/lib/permissionKeys";

/**
 * 当前账号开通了哪些功能（/api/me/permissions 给的是生效值：管理员全开、封禁全关）。
 * 审核按钮、封面页签等好几处都要问，结果按用户 id 缓存在模块里，同一个人整页只发一次请求；
 * 换号登录 id 变了自然会重拉。加载中、未登录、请求失败一律当作什么都没开——
 * 界面只是不摆按钮，真正的闸在服务端。
 */

const EMPTY: Permission[] = [];

/** 已拿到的结果；没有这一项说明还没拉过或正在拉 */
const cache = new Map<string, Permission[]>();
/** 正在拉的用户 id，防止多个组件同时挂载时各发一遍 */
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function load(userId: string) {
  if (cache.has(userId) || inflight.has(userId)) return;
  inflight.add(userId);
  void fetch("/api/me/permissions")
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { permissions?: string[] } | null) => {
      cache.set(userId, knownPermissions(data?.permissions));
    })
    .catch(() => {
      // 失败不写缓存：下次有组件挂载时还能再试一次
    })
    .finally(() => {
      inflight.delete(userId);
      listeners.forEach((cb) => cb());
    });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** 当前账号生效的权限列表 */
export function usePermissions(): Permission[] {
  const userId = useSession().data?.user?.id;
  // 订阅时顺手触发拉取；按 userId 记住，免得每次渲染都退订重订
  const sub = useCallback(
    (cb: () => void) => {
      if (userId) load(userId);
      return subscribe(cb);
    },
    [userId]
  );
  return useSyncExternalStore(
    sub,
    () => (userId ? (cache.get(userId) ?? EMPTY) : EMPTY),
    () => EMPTY
  );
}

/** 当前账号能不能用某项功能 */
export function useCan(perm: Permission): boolean {
  return usePermissions().includes(perm);
}
