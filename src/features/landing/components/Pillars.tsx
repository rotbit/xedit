import type { Pillar } from "../content/types";
import { LANDING_ICONS } from "./icons";
import { SHELL } from "./Section";

/** The four starting points right under the hero: what "like Obsidian / like Notion" actually means, plus AI and devices */
export function Pillars({ srTitle, items }: { srTitle: string; items: Pillar[] }) {
  return (
    <section className={`${SHELL} pb-24`}>
      {/* The cards need no visible section title, but without an h2 screen readers would hear a gap in the heading levels */}
      <h2 className="sr-only">{srTitle}</h2>
      <ul className="grid gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((p) => {
          const Icon = LANDING_ICONS[p.icon];
          return (
            <li key={p.kicker} className="lp-card flex flex-col p-6">
              <div className="flex items-center gap-2.5">
                <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[var(--brand-wash)] text-[var(--brand)]">
                  <Icon size={16} />
                </span>
                <span className="text-[11px] font-medium tracking-[0.16em] text-[var(--brand)]">
                  {p.kicker}
                </span>
              </div>
              <h3 className="mt-4 text-[16px] font-semibold">{p.title}</h3>
              <p className="mt-2 flex-1 text-[13px] leading-[1.8] text-[var(--ink-soft)]">{p.desc}</p>
              <ul className="mt-4 flex flex-wrap gap-1.5">
                {p.tags.map((t) => (
                  <li
                    key={t}
                    className="rounded-full border border-[var(--hairline)] px-2 py-0.5 text-[11px] text-[var(--ink-faint)]"
                  >
                    {t}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
