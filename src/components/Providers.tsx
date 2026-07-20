"use client";

import { SessionProvider } from "next-auth/react";
import { PromptHost, ConfirmHost } from "./PromptDialog";
import { EvolutionWatcher } from "./EvolutionWatcher";
import { SwRegister } from "./SwRegister";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <EvolutionWatcher />
      <SwRegister />
      {children}
      <PromptHost />
      <ConfirmHost />
    </SessionProvider>
  );
}
