"use client";

import { useEffect } from "react";
import type { Session } from "next-auth";
import { SessionProvider, useSession } from "next-auth/react";
import { PromptHost, ConfirmHost } from "./PromptDialog";
import { AuthHost } from "./AuthDialog";
import { CssDialog } from "./CssDialog";
import { ThemeStudio } from "./ThemeStudio";
import { EvolutionWatcher } from "./EvolutionWatcher";
import { SwRegister } from "./SwRegister";
import { refreshAiStatus } from "@/lib/ai";
import { useStore } from "@/store/useStore";

/** 登录状态变化时刷新 AI 可用标记（密钥按账号存服务端） */
function AiStatusSync() {
  const { status } = useSession();
  useEffect(() => {
    if (status === "authenticated") void refreshAiStatus();
    else if (status === "unauthenticated")
      useStore.getState().setAiStatus({ aiChatReady: false });
  }, [status]);
  return null;
}

export function Providers({
  children,
  session,
}: {
  children: React.ReactNode;
  /** 服务端 auth() 解出的会话，注入后 SessionProvider 不再于首帧发起客户端请求 */
  session: Session | null;
}) {
  return (
    <SessionProvider session={session}>
      <AiStatusSync />
      <EvolutionWatcher />
      <SwRegister />
      {children}
      <PromptHost />
      <ConfirmHost />
      <AuthHost />
      <CssDialog />
      <ThemeStudio />
    </SessionProvider>
  );
}
