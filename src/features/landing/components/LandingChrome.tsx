"use client";

/**
 * Shared chrome for the landing pages: button style constants, CTA buttons, the top nav bar.
 * What the buttons actually do (new vs. continue local document, which login dialog) comes from the LandingActions Provider,
 * so standalone static pages like /themes can reuse these components without wiring their own logic.
 */
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ArrowRight, PenLine } from "lucide-react";
import { DarkToggle } from "@/components/DarkToggle";
import { GithubMark } from "@/components/GithubMark";
import { LogoMark } from "@/components/LogoMark";
import { GITHUB_URL, SITE_NAME } from "@/lib/site";
import type { LandingChromeCopy } from "../content/types";
import { zhChrome } from "../content/zhChrome";
import { useLandingActions } from "../LandingActions";
import { LANDING_PATH, type LandingLocale } from "../locales";
import { LanguageMenu } from "./LanguageSwitch";

// Button looks are class-name constants rather than components: several places on the landing page apply them to Link or other tags
export const BTN_PRIMARY =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] bg-[var(--brand)] px-6 text-[14.5px] font-medium text-[var(--brand-fg)] transition-all hover:bg-[var(--brand-deep)] hover:shadow-[0_10px_24px_-10px_var(--brand)]";

export const BTN_GHOST =
  "inline-flex h-11 cursor-pointer items-center justify-center gap-2 rounded-[10px] border border-[var(--hairline-strong)] bg-[var(--panel)] px-6 text-[14.5px] text-[var(--ink)] transition-colors hover:border-[var(--brand)] hover:text-[var(--brand)]";

/** Primary CTA: new/continue local document; falls back to the home page when no Provider is mounted */
export function StartWritingButton({
  className = BTN_PRIMARY,
  icon = true,
}: {
  className?: string;
  icon?: boolean;
}) {
  const { onStart, startLabel } = useLandingActions();
  return (
    <button className={className} onClick={onStart}>
      {icon ? <PenLine size={16} /> : null}
      {startLabel}
    </button>
  );
}

/** Login entry. The Provider decides the click behavior, usually opening the login dialog in place rather than navigating. */
export function LoginButton({
  className = BTN_GHOST,
  label = zhChrome.loginOrSignup,
}: {
  className?: string;
  label?: string;
}) {
  const { onLogin } = useLandingActions();
  return (
    <button className={className} onClick={onLogin}>
      {label}
    </button>
  );
}

/** Text-style CTA for the footer */
export function StartWritingLink() {
  const { onStart, startLabel } = useLandingActions();
  return (
    <button
      className="group flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
      onClick={onStart}
    >
      {startLabel}
      <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
    </button>
  );
}

/**
 * Top nav bar. `copy` defaults to Chinese so /themes and /changelog can render it without props;
 * its `#` nav anchors must match section ids rendered by Landing.
 * `locale` is passed only by the landing page itself: it shows the language switcher and points the logo at that locale's home.
 */
export function LandingHeader({
  copy = zhChrome,
  locale,
}: {
  copy?: LandingChromeCopy;
  locale?: LandingLocale;
}) {
  const { onLogin } = useLandingActions();
  // This bar is also used on /themes and /changelog, where #anchors must go back to the landing page first.
  // Go to /about rather than /: for people with local documents, / is the workspace, not the landing page
  const pathname = usePathname();
  const onLanding = locale !== undefined || pathname === "/" || pathname === "/about";
  const resolve = (href: string) => (href.startsWith("#") && !onLanding ? `/about${href}` : href);
  return (
    // app-titlebar / traffic-inset: when the desktop shell is logged out it shows the landing page, and this bar acts as the system title bar
    <header className="app-titlebar sticky top-0 z-40 border-b border-[var(--hairline)] bg-[var(--paper)]/85 backdrop-blur-md">
      <div className="traffic-inset mx-auto flex h-14 max-w-[1140px] items-center gap-3 px-5 sm:px-8">
        <Link href={LANDING_PATH[locale ?? "zh"]} className="flex shrink-0 items-center gap-2.5" aria-label={SITE_NAME}>
          <LogoMark className="h-9 w-auto text-[var(--ink)]" />
          {/* Tagline only where the nav is hidden: on desktop the nav says it, and the bar has no room for both */}
          <span className="hidden text-[12.5px] text-[var(--ink-faint)] sm:inline lg:hidden">
            {copy.tagline}
          </span>
        </Link>

        <nav className="ml-6 hidden items-center gap-6 lg:flex" aria-label={copy.navAria}>
          {copy.nav.map((n) => (
            <Link
              key={n.href}
              href={resolve(n.href)}
              className="whitespace-nowrap text-[13.5px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]"
            >
              {n.label}
            </Link>
          ))}
        </nav>

        <span className="flex-1" />

        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={copy.githubAria}
          className="hidden h-8 w-8 items-center justify-center rounded-md text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-wash)] hover:text-[var(--ink)] sm:flex"
        >
          <GithubMark size={17} />
        </a>
        {locale ? <LanguageMenu current={locale} label={copy.langAria} /> : null}
        <DarkToggle />
        <button
          className="hidden h-8 shrink-0 cursor-pointer items-center whitespace-nowrap rounded-md px-3 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-wash)] hover:text-[var(--ink)] sm:flex"
          onClick={onLogin}
        >
          {copy.login}
        </button>
        <StartWritingButton
          className="inline-flex h-8 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-md bg-[var(--brand)] px-3.5 text-[13px] font-medium text-[var(--brand-fg)] transition-colors hover:bg-[var(--brand-deep)]"
          icon={false}
        />
      </div>
    </header>
  );
}
