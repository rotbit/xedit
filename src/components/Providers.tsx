"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { PromptHost, ConfirmHost } from "./PromptDialog";
import { CategoryPickHost } from "./CategoryPickDialog";
import { AuthHost } from "./AuthDialog";
import { CssDialog } from "./CssDialog";
import { ThemeStudio } from "./ThemeStudio";
import { ScrollbarReveal } from "./ScrollbarReveal";
import { SwRegister } from "./SwRegister";

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  /** 服务端 auth() 解出的会话，注入后 SessionProvider 不再于首帧发起客户端请求 */
  session: Session | null;
}) {
  // refetchWhenOffline={false}：断网时别去拉会话，拉了也只会拿到 null，
  // 白白把 useSession 打成未登录。回前台重拉照常保留——那正是恢复在线的途径之一，
  // 误判由 useAuthMode 的服务器探测兜住
  return (
    <SessionProvider session={session} refetchWhenOffline={false}>
      <SwRegister />
      <ScrollbarReveal />
      {children}
      <PromptHost />
      <ConfirmHost />
      <CategoryPickHost />
      <AuthHost />
      <CssDialog />
      <ThemeStudio />
    </SessionProvider>
  );
}
