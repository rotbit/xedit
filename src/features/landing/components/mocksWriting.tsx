import { CornerDownLeft, FileText, Link2 } from "lucide-react";
import type { ShowcasesCopy } from "../content/types";
import { TrafficLights } from "./Section";

/**
 * Static illustrations for the writing-side showcases (editor, wiki links, tasks). Drawn in DOM rather than bitmaps,
 * so they follow light/dark tokens and the sample text stays real, indexable text from the dictionary.
 */

// Shared card look for the illustrations, so every showcase has the same visual weight
export const MOCK_CARD = "lp-card p-5 shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]";

/** Live-preview editor: body text only; Markdown source shows only on the cursor line */
export function EditorMock({ m }: { m: ShowcasesCopy["editor"]["mock"] }) {
  return (
    <div className="lp-card overflow-hidden shadow-[0_2px_10px_-4px_rgba(0,0,0,0.1)]" aria-hidden="true">
      <div className="flex h-9 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--sidebar)] px-4">
        <TrafficLights />
        <span className="truncate text-[11.5px] text-[var(--ink-faint)]">{m.title}</span>
        <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-faint)]">{m.status}</span>
      </div>
      <div className="px-6 py-6 sm:px-10">
        <p className="font-[family-name:var(--serif)] text-[22px] font-semibold leading-snug">{m.title}</p>
        <p className="mt-4 text-[13.5px] leading-[1.95] text-[var(--ink-soft)]">
          {m.body}
          <strong className="text-[var(--ink)]">{m.strong}</strong>
        </p>
        {/* Cursor line: shows the source markers */}
        <p className="mt-4 rounded-md bg-[var(--brand-tint)] px-2 py-1 text-[16px] font-semibold">
          <span className="font-mono text-[13px] font-normal text-[var(--ink-faint)]">## </span>
          {m.heading}
          <span
            className="ml-0.5 inline-block h-[17px] w-[1.5px] translate-y-[3px] bg-[var(--brand)]"
            aria-hidden="true"
          />
        </p>
        <p className="mt-3 border-l-2 border-[var(--hairline-strong)] pl-3 text-[13px] leading-[1.9] text-[var(--ink-soft)]">
          {m.quote}
        </p>
        <ol className="mt-3 list-decimal space-y-1 pl-5 text-[13.5px] leading-[1.9] text-[var(--ink-soft)]">
          {m.items.map((it) => (
            <li key={it}>{it}</li>
          ))}
        </ol>
      </div>
    </div>
  );
}

/** `[[` completion popover plus a rename-relink notice */
export function LinksMock({ m }: { m: ShowcasesCopy["links"]["mock"] }) {
  return (
    <div className={MOCK_CARD} aria-hidden="true">
      <div className="rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3.5">
        <p className="font-mono text-[13px] text-[var(--ink)]">
          <span className="text-[var(--ink-faint)]">[[</span>
          {m.query}
          <span
            className="ml-px inline-block h-[15px] w-[1.5px] translate-y-[2px] bg-[var(--ink)]"
            aria-hidden="true"
          />
        </p>
        <div className="mt-2 w-full max-w-[300px] rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] p-1 shadow-[0_8px_30px_rgba(0,0,0,0.12)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.5)]">
          {m.suggestions.map((s, i) => (
            <div
              key={s.title}
              className={`flex h-8 items-center gap-2.5 rounded-md px-2 text-[13px] ${
                i === 0 ? "bg-[var(--accent-wash)]" : ""
              }`}
            >
              <FileText size={15} className="shrink-0 text-[var(--ink-soft)]" />
              <span className="min-w-0 flex-1 truncate">{s.title}</span>
              <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{s.folder}</span>
              {i === 0 ? <CornerDownLeft size={12} className="shrink-0 text-[var(--ink-faint)]" /> : null}
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex items-start gap-3 rounded-lg bg-[var(--sidebar)] px-3.5 py-3">
        <Link2 size={15} className="mt-0.5 shrink-0 text-[var(--brand)]" />
        <div className="min-w-0 text-[12.5px] leading-6">
          <p className="text-[var(--ink-soft)]">
            <span className="text-[var(--ink-faint)] line-through">[[{m.renameFrom}]]</span>
            <span className="px-1.5 text-[var(--ink-faint)]">→</span>
            <span className="text-[var(--md-link)]">[[{m.renameTo}]]</span>
          </p>
          <p className="text-[11.5px] text-[var(--ink-faint)]">{m.renameNote}</p>
        </div>
      </div>
    </div>
  );
}

/** "Today" view: tasks gathered from several docs, each tagged with its source doc */
export function TasksMock({ m }: { m: ShowcasesCopy["tasks"]["mock"] }) {
  return (
    <div className={MOCK_CARD} aria-hidden="true">
      <div className="flex items-baseline justify-between gap-3">
        <p className="font-[family-name:var(--serif)] text-[20px] font-semibold">{m.title}</p>
        <span className="text-[11.5px] text-[var(--ink-faint)]">{m.date}</span>
      </div>
      <div className="mt-3 space-y-4">
        {m.groups.map((g) => (
          <div key={g.label}>
            <p className="text-[11px] font-medium tracking-[0.12em] text-[var(--ink-faint)]">{g.label}</p>
            <ul className="mt-1.5 divide-y divide-[var(--hairline-soft)]">
              {g.items.map((it) => (
                <li key={it.text} className="flex items-center gap-2.5 py-2 text-[13px]">
                  <span
                    className={`flex h-[14px] w-[14px] shrink-0 items-center justify-center rounded-[3px] border text-[9px] ${
                      it.done
                        ? "border-[var(--accent)] bg-[var(--accent)] text-[var(--accent-fg)]"
                        : "border-[var(--hairline-strong)]"
                    }`}
                  >
                    {it.done ? "✓" : null}
                  </span>
                  <span
                    className={`min-w-0 flex-1 truncate ${it.done ? "text-[var(--ink-faint)] line-through" : ""}`}
                  >
                    {it.text}
                  </span>
                  {it.tag ? (
                    <span className="shrink-0 rounded bg-[var(--brand-wash)] px-1.5 py-0.5 text-[10.5px] text-[var(--brand)]">
                      {it.tag}
                    </span>
                  ) : null}
                  <span className="hidden shrink-0 text-[11px] text-[var(--ink-faint)] sm:inline">{it.doc}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
      <pre className="xe-source mt-4 rounded-lg bg-[var(--sidebar)] px-3.5 py-2">
        <code>
          <span className="xe-mk">- [ ] </span>
          {m.source.replace(/^- \[ \] /, "")}
        </code>
      </pre>
    </div>
  );
}
