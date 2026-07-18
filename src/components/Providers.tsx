"use client";

import { SessionProvider } from "next-auth/react";
import { PromptHost, ConfirmHost } from "./PromptDialog";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      {children}
      <PromptHost />
      <ConfirmHost />
    </SessionProvider>
  );
}
