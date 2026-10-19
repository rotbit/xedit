import { Check, Download } from "lucide-react";
import { LogoMark } from "@/components/LogoMark";
import { MAC_DOWNLOAD_URL } from "@/lib/site";
import type { MacCopy } from "../content/types";
import { BTN_PRIMARY } from "./LandingChrome";
import { SectionHead, SHELL, TrafficLights } from "./Section";

/** Mac app: honest bullets on the left, a small desktop window illustration on the right */
export function MacSection({ copy }: { copy: MacCopy }) {
  return (
    <section className={`${SHELL} py-24`}>
      <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-20">
        <div>
          <SectionHead id="desktop" eyebrow={copy.eyebrow} title={copy.title} note={copy.note} />
          <ul className="mt-7 space-y-2.5">
            {copy.bullets.map((f) => (
              <li key={f} className="flex gap-2.5 text-[13.5px] leading-6 text-[var(--ink-soft)]">
                <Check size={16} className="mt-0.5 shrink-0 text-[var(--brand)]" />
                <span>{f}</span>
              </li>
            ))}
          </ul>
          <div className="mt-8 flex flex-wrap items-center gap-4">
            <a className={BTN_PRIMARY} href={MAC_DOWNLOAD_URL} target="_blank" rel="noopener noreferrer">
              <Download size={16} />
              {copy.cta}
            </a>
            <span className="text-[12.5px] text-[var(--ink-faint)]">{copy.requirement}</span>
          </div>
          <p className="mt-3.5 text-[12px] leading-5 text-[var(--ink-faint)]">{copy.footnote}</p>
        </div>

        {/* Desktop window illustration; the lists are demo data from the dictionary, not real APIs */}
        <div
          className="overflow-hidden rounded-[14px] border border-[var(--hairline-strong)] bg-[var(--panel)] shadow-[0_28px_64px_-34px_rgba(0,0,0,0.5)]"
          aria-hidden="true"
        >
          <div className="flex h-9 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--sidebar)] px-4">
            <TrafficLights />
            <LogoMark className="h-6 w-auto text-[var(--ink)]" />
          </div>
          <div className="grid grid-cols-[104px_minmax(0,1fr)]">
            <div className="space-y-1.5 border-r border-[var(--hairline)] bg-[var(--sidebar)] p-3">
              {copy.window.folders.map((c, i) => (
                <p
                  key={c}
                  className={`truncate rounded px-2 py-1 text-[11px] ${
                    i === 0 ? "bg-[var(--sidebar-active)] text-[var(--ink)]" : "text-[var(--ink-faint)]"
                  }`}
                >
                  {c}
                </p>
              ))}
            </div>
            <div className="space-y-2.5 p-4">
              {copy.window.docs.map((d) => (
                <div key={d.title} className="border-b border-[var(--hairline-soft)] pb-2.5">
                  <p className="truncate text-[12.5px] font-medium">{d.title}</p>
                  <p className="mt-1 text-[11px] text-[var(--ink-faint)]">{d.meta}</p>
                </div>
              ))}
              <div className="flex flex-wrap gap-1.5 pt-1">
                {copy.window.keys.map((k) => (
                  <kbd
                    key={k}
                    className="rounded border border-[var(--hairline)] bg-[var(--paper)] px-1.5 py-0.5 font-mono text-[10px] text-[var(--ink-faint)]"
                  >
                    {k}
                  </kbd>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
