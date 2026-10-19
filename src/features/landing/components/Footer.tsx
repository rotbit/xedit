import Link from "next/link";
import { Mail } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { LogoMark } from "@/components/LogoMark";
import { CONTACT_EMAIL, GITHUB_URL } from "@/lib/site";
import type { LandingCopy } from "../content/types";
import type { LandingLocale } from "../locales";
import { LanguageLinks } from "./LanguageSwitch";
import { StartWritingLink } from "./LandingChrome";
import { SHELL } from "./Section";

const LINK = "transition-colors hover:text-[var(--ink)]";

export function LandingFooter({
  copy,
  tagline,
  locale,
  langAria,
}: {
  copy: LandingCopy["footer"];
  tagline: string;
  locale: LandingLocale;
  langAria: string;
}) {
  return (
    <footer className="border-t border-[var(--hairline)] bg-[var(--sidebar)]/45">
      <div className={`${SHELL} py-12`}>
        <div className="flex flex-wrap items-start justify-between gap-x-10 gap-y-8">
          <div className="flex items-center gap-3">
            <LogoMark className="h-10 w-auto shrink-0 text-[var(--ink)]" />
            <div>
              <p className="text-[13.5px] font-semibold">{tagline}</p>
              <p className="mt-1 text-[11.5px] text-[var(--ink-faint)]">{copy.blurb}</p>
            </div>
          </div>
          <nav
            className="flex flex-wrap items-center gap-x-6 gap-y-2.5 text-[13px] text-[var(--ink-soft)]"
            aria-label={copy.navAria}
          >
            {copy.links.map((l) => (
              <Link key={l.href} href={l.href} className={LINK}>
                {l.label}
              </Link>
            ))}
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex items-center gap-1.5 ${LINK}`}
            >
              <GithubMark size={14} />
              {copy.github}
            </a>
            <a href={`mailto:${CONTACT_EMAIL}`} className={`flex items-center gap-1.5 ${LINK}`}>
              <Mail size={14} />
              {copy.feedback}
            </a>
            <StartWritingLink />
          </nav>
        </div>
        <div className="mt-9 flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-t border-[var(--hairline)] pt-6">
          <p className="text-[11.5px] text-[var(--ink-faint)]">
            {copy.contactLead}
            <a href={`mailto:${CONTACT_EMAIL}`} className={LINK}>
              {CONTACT_EMAIL}
            </a>
          </p>
          <LanguageLinks current={locale} label={langAria} />
        </div>
      </div>
    </footer>
  );
}
