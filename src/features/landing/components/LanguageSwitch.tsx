"use client";

/**
 * Landing language switcher: the header gets a compact globe menu, the footer an inline row.
 * Plain <a> rather than next/link on purpose: <html lang> and the product UI language are decided by the shared
 * root layout, which client-side navigation keeps, so switching must be a full document load (see src/proxy.ts).
 */
import { useEffect, useRef } from "react";
import { Check, ChevronDown, Globe } from "lucide-react";
import {
  LANDING_HTML_LANG,
  LANDING_LANG_NAME,
  LANDING_LOCALES,
  LANDING_PATH,
  type LandingLocale,
} from "../locales";

function langLinkProps(l: LandingLocale, current: LandingLocale) {
  return {
    href: LANDING_PATH[l],
    hrefLang: LANDING_HTML_LANG[l],
    lang: LANDING_HTML_LANG[l],
    "aria-current": l === current ? ("page" as const) : undefined,
  };
}

/** Header control: a <details> disclosure, so it works before hydration; closes on outside click and Escape */
export function LanguageMenu({ current, label }: { current: LandingLocale; label: string }) {
  const ref = useRef<HTMLDetailsElement>(null);
  useEffect(() => {
    const close = (e: Event) => {
      const el = ref.current;
      if (!el?.open) return;
      if (e instanceof KeyboardEvent ? e.key === "Escape" : !el.contains(e.target as Node)) el.open = false;
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", close);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", close);
    };
  }, []);

  return (
    <details ref={ref} className="group relative shrink-0">
      <summary
        aria-label={label}
        className="flex h-8 cursor-pointer list-none items-center gap-1 rounded-md px-2 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-wash)] hover:text-[var(--ink)] group-open:bg-[var(--brand-wash)] group-open:text-[var(--ink)]"
      >
        <Globe size={15} aria-hidden="true" />
        <span className="hidden sm:inline">{LANDING_LANG_NAME[current]}</span>
        <ChevronDown size={13} aria-hidden="true" className="transition-transform group-open:rotate-180" />
      </summary>
      <div className="absolute right-0 top-full z-50 mt-1.5 min-w-[132px] rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] p-1 shadow-[0_16px_36px_-20px_rgb(0_0_0/0.45)]">
        {LANDING_LOCALES.map((l) => (
          <a
            key={l}
            {...langLinkProps(l, current)}
            className="flex h-8 items-center justify-between gap-3 rounded-md px-2.5 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--brand-wash)] hover:text-[var(--ink)] aria-[current=page]:font-medium aria-[current=page]:text-[var(--ink)]"
          >
            {LANDING_LANG_NAME[l]}
            {l === current ? <Check size={14} className="text-[var(--brand)]" aria-hidden="true" /> : null}
          </a>
        ))}
      </div>
    </details>
  );
}

/** Footer control: all three languages inline, the current one emphasized */
export function LanguageLinks({ current, label }: { current: LandingLocale; label: string }) {
  return (
    <nav aria-label={label} className="flex items-center gap-1 text-[12px] text-[var(--ink-faint)]">
      <Globe size={13} aria-hidden="true" className="mr-0.5" />
      {LANDING_LOCALES.map((l, i) => (
        <span key={l} className="flex items-center gap-1">
          {i > 0 ? <span aria-hidden="true">·</span> : null}
          <a
            {...langLinkProps(l, current)}
            className="transition-colors hover:text-[var(--ink)] aria-[current=page]:text-[var(--ink-soft)] aria-[current=page]:font-medium"
          >
            {LANDING_LANG_NAME[l]}
          </a>
        </span>
      ))}
    </nav>
  );
}
