import { Apple } from "lucide-react";
import { GithubMark } from "@/components/GithubMark";
import { GITHUB_URL, MAC_DOWNLOAD_URL } from "@/lib/site";
import type { HeroCopy, MockupCopy } from "../content/types";
import { AppMockup } from "./AppMockup";
import { BTN_GHOST, StartWritingButton } from "./LandingChrome";
import { SHELL } from "./Section";

/** Text-only ghost link for GitHub: lighter than the Mac button so the two CTAs keep their order of importance */
const LINK_GHOST =
  "inline-flex h-11 items-center gap-2 rounded-[10px] px-3 text-[14px] text-[var(--ink-soft)] transition-colors hover:text-[var(--ink)]";

/** Hero: centered single column, then the app window mockup as the page's main image */
export function Hero({ copy, mockup }: { copy: HeroCopy; mockup: MockupCopy }) {
  return (
    <section className="landing-hero overflow-hidden">
      {/* Two decorative layers: a manuscript-grid background, with a brand glow at the top behind the title */}
      <div className="landing-grid" aria-hidden="true" />
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-[560px] bg-[radial-gradient(ellipse_58%_52%_at_50%_-8%,var(--brand-glow),transparent_72%)]"
        aria-hidden="true"
      />
      <div className={`${SHELL} relative pb-16 pt-12 sm:pt-18 lg:pt-22`}>
        <div className="mx-auto max-w-[780px] text-center">
          {/* rise is the entrance animation; increasing animationDelay makes items appear top to bottom. Delays are hand-tuned to the rhythm, so shift the later ones when inserting a row */}
          <div className="rise flex justify-center">
            <span className="inline-flex items-center gap-2 rounded-full border border-[var(--hairline)] bg-[var(--panel)] px-3.5 py-1.5 text-[12.5px] font-medium text-[var(--brand)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true" />
              {copy.badge}
            </span>
          </div>
          <h1
            className="rise mt-7 text-[clamp(32px,5.6vw,62px)] font-semibold leading-[1.16] tracking-[-0.045em]"
            style={{ animationDelay: "0.05s" }}
          >
            <span className="font-[family-name:var(--serif)]">{copy.titleLine1}</span>
            <br />
            {copy.titleLine2Before}
            <span className="lp-mark">{copy.titleMark}</span>
            {copy.titleLine2After}
          </h1>
          <p
            className="rise mx-auto mt-7 max-w-[640px] text-[15.5px] leading-[1.95] text-[var(--ink-soft)]"
            style={{ animationDelay: "0.1s" }}
          >
            {copy.sub}
          </p>
          <div
            className="rise mt-9 flex flex-wrap items-center justify-center gap-3"
            style={{ animationDelay: "0.14s" }}
          >
            <StartWritingButton />
            <a className={BTN_GHOST} href={MAC_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
              <Apple size={16} />
              {copy.macCta}
            </a>
            <a className={LINK_GHOST} href={GITHUB_URL} target="_blank" rel="noopener noreferrer">
              <GithubMark size={16} />
              {copy.githubCta}
            </a>
          </div>
          <p
            className="rise mt-4 text-[12.5px] leading-5 text-[var(--ink-faint)]"
            style={{ animationDelay: "0.18s" }}
          >
            {copy.note}
          </p>
          <dl
            className="rise mx-auto mt-9 flex max-w-[460px] items-stretch justify-center divide-x divide-[var(--hairline)] border-y border-[var(--hairline)] py-4"
            style={{ animationDelay: "0.22s" }}
          >
            {copy.stats.map((s) => (
              <div key={s.label} className="flex flex-1 flex-col-reverse px-4">
                <dt className="mt-2 text-[12px] text-[var(--ink-faint)]">{s.label}</dt>
                <dd className="font-[family-name:var(--serif)] text-[22px] font-semibold leading-none tracking-tight">
                  {s.value}
                </dd>
              </div>
            ))}
          </dl>
        </div>

        <div className="rise mt-12 sm:mt-14" style={{ animationDelay: "0.26s" }}>
          <div className="mb-5 flex flex-wrap items-center justify-center gap-x-2.5 gap-y-1 text-center">
            <span className="inline-flex items-center gap-1.5 text-[10.5px] font-medium tracking-[0.2em] text-[var(--brand)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ember)]" aria-hidden="true" />
              {copy.visualLabel}
            </span>
            <span className="text-[13px] text-[var(--ink-faint)]">{copy.visualCaption}</span>
          </div>
          <AppMockup copy={mockup} />
        </div>
      </div>
    </section>
  );
}
