import type { CompareCopy } from "../content/types";
import { BAND, SectionHead, SHELL } from "./Section";

const PRODUCTS = [
  { key: "xedit", name: "xEdit" },
  { key: "obsidian", name: "Obsidian" },
  { key: "notion", name: "Notion" },
] as const;

/**
 * Honest comparison with Obsidian and Notion: a real <table> (readable by crawlers and screen readers),
 * scrolling sideways inside its card on narrow screens so the page itself never does.
 */
export function Compare({ copy }: { copy: CompareCopy }) {
  return (
    <section className={BAND}>
      <div className={SHELL}>
        <SectionHead id="compare" eyebrow={copy.eyebrow} title={copy.title} note={copy.note} />

        <div className="lp-card mt-12 overflow-x-auto">
          <table className="w-full min-w-[720px] border-collapse text-left text-[13px] leading-[1.7]">
            <thead>
              <tr className="border-b border-[var(--hairline)]">
                <th scope="col" className="w-[20%] px-5 py-3.5 font-medium text-[var(--ink-faint)]">
                  {copy.rowHead}
                </th>
                {PRODUCTS.map((p) => (
                  <th
                    key={p.key}
                    scope="col"
                    className={`px-5 py-3.5 font-semibold ${p.key === "xedit" ? "bg-[var(--brand-tint)] text-[var(--brand)]" : ""}`}
                  >
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {copy.rows.map((row) => (
                <tr key={row.label} className="border-b border-[var(--hairline)] last:border-b-0">
                  <th scope="row" className="px-5 py-3 align-top font-medium">
                    {row.label}
                  </th>
                  {PRODUCTS.map((p) => (
                    <td
                      key={p.key}
                      className={`px-5 py-3 align-top text-[var(--ink-soft)] ${p.key === "xedit" ? "bg-[var(--brand-tint)]" : ""}`}
                    >
                      {row[p.key]}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="mt-8 grid gap-3.5 md:grid-cols-2">
          {[
            { title: copy.fitTitle, items: copy.fit },
            { title: copy.otherTitle, items: copy.other },
          ].map((col) => (
            <div key={col.title} className="lp-card p-6">
              <h3 className="text-[15px] font-semibold tracking-tight">{col.title}</h3>
              <ul className="mt-3.5 list-disc space-y-2 pl-5 text-[13px] leading-[1.8] text-[var(--ink-soft)] marker:text-[var(--ink-faint)]">
                {col.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-5 text-[12px] text-[var(--ink-faint)]">{copy.footnote}</p>
      </div>
    </section>
  );
}
