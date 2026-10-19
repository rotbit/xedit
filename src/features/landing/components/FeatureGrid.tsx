import type { LandingCopy } from "../content/types";
import { LANDING_ICONS } from "./icons";
import { BAND, SectionHead, SHELL } from "./Section";

/** Full feature overview, grouped into bands; also the source of the JSON-LD featureList */
export function FeatureGrid({ copy }: { copy: LandingCopy["features"] }) {
  return (
    <section className={BAND}>
      <div className={SHELL}>
        <SectionHead id="features" eyebrow={copy.eyebrow} title={copy.title} note={copy.note} />
        <div className="mt-14 space-y-12">
          {copy.groups.map((group) => (
            <div key={group.band}>
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h3 className="text-[16px] font-semibold tracking-tight">{group.band}</h3>
                <span className="text-[12.5px] text-[var(--ink-faint)]">{group.note}</span>
              </div>
              <ul className="mt-5 grid gap-3.5 sm:grid-cols-2 lg:grid-cols-3">
                {group.items.map(({ icon, title, desc }) => {
                  const Icon = LANDING_ICONS[icon];
                  return (
                    <li key={title} className="lp-card p-5">
                      <span className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-[var(--brand-wash)] text-[var(--brand)]">
                        <Icon size={18} />
                      </span>
                      <h4 className="mt-3.5 text-[14.5px] font-semibold">{title}</h4>
                      <p className="mt-2 text-[13px] leading-[1.8] text-[var(--ink-soft)]">{desc}</p>
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
