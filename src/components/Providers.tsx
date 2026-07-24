"use client";

import { useEffect } from "react";
import { SessionProvider, useSession } from "next-auth/react";
import { PromptHost, ConfirmHost } from "./PromptDialog";
import { AuthHost } from "./AuthDialog";
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
      useStore.getState().setAiStatus({ aiChatReady: false, aiImageReady: false });
  }, [status]);
  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <AiStatusSync />
      <EvolutionWatcher />
      <SwRegister />
      {children}
      <PromptHost />
      <ConfirmHost />
      <AuthHost />
    </SessionProvider>
  );
}
