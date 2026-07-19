"use client";

import { SessionProvider } from "next-auth/react";
import { PromptHost, ConfirmHost } from "./PromptDialog";
import { EvolutionWatcher } from "./EvolutionWatcher";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <EvolutionWatcher />
      {children}
      <PromptHost />
      <ConfirmHost />
    </SessionProvider>
  );
}
