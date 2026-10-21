import { Check } from "lucide-react";
import type { FreeCopy } from "../content/types";
import { SectionHead, SHELL } from "./Section";

/** What's free and the real limits, then the three storage modes side by side. Plain HTML so crawlers read every line. */
export function FreeScope({ copy }: { copy: FreeCopy }) {
  return (
    <section className={`${SHELL} py-24`}>
      <SectionHead id="free" eyebrow={copy.eyebrow} title={copy.title} note={copy.note} />

      <div className="mt-12 grid gap-3.5 lg:grid-cols-3">
        {copy.tiers.map((tier) => (
          <div key={tier.label} className="lp-card p-6">
            <p className="text-[11.5px] font-medium tracking-[0.12em] text-[var(--brand)]">{tier.label}</p>
            <h3 className="mt-2 text-[17px] font-semibold tracking-tight">{tier.title}</h3>
            <ul className="mt-4 space-y-2.5">
              {tier.items.map((item) => (
                <li key={item} className="flex gap-2.5 text-[13px] leading-[1.8] text-[var(--ink-soft)]">
                  <Check size={14} className="mt-[5px] shrink-0 text-[var(--brand)]" aria-hidden="true" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <h3 className="mt-16 text-[16px] font-semibold tracking-tight">{copy.storageTitle}</h3>
      <div className="mt-5 grid gap-3.5 lg:grid-cols-3">
        {copy.storage.map((mode) => (
          <div key={mode.name} className="lp-card p-6">
            <h4 className="text-[14.5px] font-semibold">{mode.name}</h4>
            <dl className="mt-3 space-y-3 text-[13px] leading-[1.8]">
              {(["where", "sync", "fit"] as const).map((k) => (
                <div key={k}>
                  <dt className="text-[11.5px] text-[var(--ink-faint)]">{copy.storageLabels[k]}</dt>
                  <dd className="text-[var(--ink-soft)]">{mode[k]}</dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </section>
  );
}
