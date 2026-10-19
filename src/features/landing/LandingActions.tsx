"use client";

import { createContext, useContext } from "react";
import { openAuth } from "@/components/AuthDialog";
import { setLocale } from "@/i18n/locale";

export interface LandingActions {
  /** 「开始写作」 (Start writing): inside the workspace, creates a new local document and opens it */
  onStart: () => void;
  onLogin: () => void;
  /** Primary button label (becomes 「继续编辑」 (Continue editing) when there's already a local draft) */
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
 * The landing page's two actions. When rendered outside the workspace (e.g. /themes) there's no Provider,
 * so 「开始写作」 falls back to going home, while login still uses the global AuthHost dialog.
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

/**
 * Actions for the localized landing pages (/en, /ja), which render outside the workspace.
 * The app has no Japanese, so both switch the product UI to English before entering it; a full load of
 * `/?action=start` (not client navigation) re-renders the root layout in that language, and Home turns the
 * action into a fresh local doc for visitors without a workspace, so nobody bounces back to the Chinese landing.
 */
export function LocaleLandingActions({
  startLabel,
  children,
}: {
  startLabel: string;
  children: React.ReactNode;
}) {
  const value: LandingActions = {
    onStart: () => {
      setLocale("en");
      window.location.href = "/?action=start";
    },
    onLogin: () => openAuth("login"),
    startLabel,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}
