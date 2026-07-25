"use client";

import { useSession } from "next-auth/react";
import { wasAuthed } from "@/lib/docStore";
import { useOnline } from "@/hooks/useOnline";

/**
 * 工作台的三种运行模式：
 * - loggedIn：正常云端模式
 * - offlineAuthed：曾登录 + 离线，拿不到会话但本地镜像齐全，按离线工作区处理
 * - localMode：未登录，数据存在浏览器本地（Obsidian 式本地优先）
 */
export function useAuthMode() {
  const { data: session, status } = useSession();
  const online = useOnline();
  const loggedIn = status === "authenticated";
  const offlineAuthed = status === "unauthenticated" && !online && wasAuthed();
  const localMode = status === "unauthenticated" && !offlineAuthed;

  return { session, status, online, loggedIn, offlineAuthed, localMode };
}

export type AuthMode = ReturnType<typeof useAuthMode>;
