"use client";

import { createContext, useContext } from "react";
import { openAuth } from "@/components/AuthDialog";

export interface LandingActions {
  /** 「开始写作」：工作台内会新建一篇本地文章并直接打开 */
  onStart: () => void;
  onLogin: () => void;
  /** 主按钮文案（本机已有草稿时会变成「继续编辑」） */
  startLabel: string;
}

const Ctx = createContext<LandingActions | null>(null);

export function LandingActionsProvider({
  value,
  children,
}: {
  value: LandingActions;
  children: React.ReactNode;
}) {
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * 落地页的两个动作。脱离工作台单独渲染时（例如 /themes）没有 Provider，
 * 此时「开始写作」退化成回首页，登录仍走全局 AuthHost 弹窗。
 */
export function useLandingActions(): LandingActions {
  return (
    useContext(Ctx) ?? {
      onStart: () => {
        window.location.href = "/";
      },
      onLogin: () => openAuth("login"),
      startLabel: "开始写作",
    }
  );
}
