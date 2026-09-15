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
  return (
    <SessionProvider session={session}>
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
