"use client";

import { SessionProvider } from "next-auth/react";
import { PromptHost, ConfirmHost } from "./PromptDialog";
import { LevelSkin } from "./LevelSkin";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <LevelSkin />
      {children}
      <PromptHost />
      <ConfirmHost />
    </SessionProvider>
  );
}
