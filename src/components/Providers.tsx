"use client";

import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { LucideProvider } from "lucide-react";
import { PromptHost, ConfirmHost } from "./PromptDialog";
import { CategoryPickHost } from "./CategoryPickDialog";
import { AuthHost } from "./AuthDialog";
import { CssDialog } from "./CssDialog";
import { ThemeStudio } from "./ThemeStudio";
import { ScrollbarReveal } from "./ScrollbarReveal";
import { SwRegister } from "./SwRegister";
import type { Locale } from "@/i18n/locale";
import { LocaleProvider } from "@/i18n/useT";

export function Providers({
  children,
  session,
  locale,
}: {
  children: React.ReactNode;
  /** Session resolved by server-side auth(); once injected, SessionProvider doesn't make a client request on the first frame */
  session: Session | null;
  /** UI language determined server-side from cookie / Accept-Language */
  locale: Locale;
}) {
  // refetchWhenOffline={false}: don't fetch the session while offline; it would only return null
  // and needlessly flip useSession to signed-out. Refetching on returning to the foreground stays — that's one way of recovering online,
  // and misjudgments are caught by useAuthMode's server probe
  return (
    <LocaleProvider locale={locale}>
      <SessionProvider session={session} refetchWhenOffline={false}>
        {/* Site-wide feature icons share a rounded thin stroke; the logo and third-party brand marks don't use this config. */}
        <LucideProvider size={16} strokeWidth={1.8}>
          <SwRegister />
          <ScrollbarReveal />
          {children}
          <PromptHost />
          <ConfirmHost />
          <CategoryPickHost />
          <AuthHost />
          <CssDialog />
          <ThemeStudio />
        </LucideProvider>
      </SessionProvider>
    </LocaleProvider>
  );
}
