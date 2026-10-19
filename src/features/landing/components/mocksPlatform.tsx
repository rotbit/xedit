import { Cloud, FileText, Folder, FolderOpen, History, Plug, RotateCcw } from "lucide-react";
import type { ShowcasesCopy } from "../content/types";
import { MOCK_CARD } from "./mocksWriting";

/** Static illustrations for the platform-side showcases (storage & history, AI, share & export). */

/** Local folder vs. cloud side by side, with a version-history diff underneath */
export function SyncMock({ m }: { m: ShowcasesCopy["sync"]["mock"] }) {
  return (
    <div className={MOCK_CARD} aria-hidden="true">
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-3">
          <p className="flex items-center gap-2 text-[12.5px] font-medium">
            <FolderOpen size={14} className="text-[var(--brand)]" />
            {m.localTitle}
          </p>
          <p className="mt-1 truncate font-mono text-[11px] text-[var(--ink-faint)]">{m.localPath}</p>
          <ul className="mt-2.5 space-y-1 text-[12px] text-[var(--ink-soft)]">
            {m.localFiles.map((f) => (
              <li key={f} className="flex items-center gap-2">
                {f.endsWith("/") ? (
                  <Folder size={12} className="shrink-0 text-[var(--ink-faint)]" />
                ) : (
                  <FileText size={12} className="shrink-0 text-[var(--ink-faint)]" />
                )}
                <span className="truncate font-mono">{f}</span>
              </li>
            ))}
          </ul>
          <p className="mt-2.5 text-[11px] text-[var(--ink-faint)]">{m.localNote}</p>
        </div>
        <div className="rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-3.5 py-3">
          <p className="flex items-center gap-2 text-[12.5px] font-medium">
            <Cloud size={14} className="text-[var(--brand)]" />
            {m.cloudTitle}
          </p>
          <ul className="mt-3 space-y-2 text-[12px] text-[var(--ink-soft)]">
            {m.cloudLines.map((l, i) => (
              <li key={l} className="flex items-center gap-2">
                <span
                  className={`h-1.5 w-1.5 shrink-0 rounded-full ${i < 2 ? "bg-emerald-500" : "bg-[var(--ember)]"}`}
                />
                <span className="truncate">{l}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--hairline)] px-3.5 py-3">
        <p className="flex items-center gap-2 text-[12.5px] font-medium">
          <History size={14} className="text-[var(--brand)]" />
          {m.historyTitle}
        </p>
        <div className="mt-2.5 grid gap-3 sm:grid-cols-[140px_minmax(0,1fr)]">
          <ul className="space-y-1 text-[11.5px]">
            {m.versions.map((v, i) => (
              <li
                key={v.label}
                className={`rounded-md px-2 py-1 ${i === 1 ? "bg-[var(--sidebar-active)] text-[var(--ink)]" : "text-[var(--ink-soft)]"}`}
              >
                <p className="truncate">{v.label}</p>
                <p className="text-[10.5px] text-[var(--ink-faint)]">{v.time}</p>
              </li>
            ))}
          </ul>
          <div className="min-w-0 font-mono text-[11.5px] leading-[1.9]">
            <p className="rounded bg-red-500/10 px-2 text-red-700 dark:text-red-300">− {m.diffRemoved}</p>
            <p className="mt-1 rounded bg-emerald-500/10 px-2 text-emerald-700 dark:text-emerald-300">
              + {m.diffAdded}
            </p>
            <span className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-[var(--hairline)] px-2 py-0.5 font-sans text-[11px] text-[var(--ink-soft)]">
              <RotateCcw size={11} />
              {m.restore}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

/** An MCP client conversation on top, an inline wording-review card below */
export function AiMock({ m }: { m: ShowcasesCopy["ai"]["mock"] }) {
  return (
    <div className={MOCK_CARD} aria-hidden="true">
      <div className="rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3.5">
        <p className="ml-auto w-fit max-w-[88%] rounded-[10px] bg-[var(--sidebar-active)] px-3 py-2 text-[12.5px] leading-[1.7]">
          {m.prompt}
        </p>
        <ul className="mt-3 space-y-1">
          {m.toolCalls.map((c) => (
            <li key={c} className="flex items-center gap-2 font-mono text-[11px] text-[var(--ink-faint)]">
              <Plug size={11} className="shrink-0 text-[var(--brand)]" />
              <span className="truncate">xedit · {c}</span>
            </li>
          ))}
        </ul>
        <p className="mt-2.5 text-[12.5px] leading-[1.7] text-[var(--ink-soft)]">
          <span className="mr-1.5 font-medium text-[var(--ink)]">{m.clientName}</span>
          {m.reply}
        </p>
      </div>
      <div className="mt-3 rounded-lg border border-[var(--hairline)] px-3.5 py-3">
        <p className="text-[13px] leading-[2] text-[var(--ink-soft)]">
          <span className="underline decoration-[var(--brand)] decoration-wavy decoration-[1.5px] underline-offset-4">
            {m.reviewQuote}
          </span>
        </p>
        <div className="mt-2 flex flex-wrap items-start gap-x-3 gap-y-2">
          <span className="rounded bg-[var(--brand-wash)] px-1.5 py-0.5 text-[10.5px] text-[var(--brand)]">
            {m.reviewTag}
          </span>
          <p className="min-w-0 flex-1 text-[12px] leading-[1.75] text-[var(--ink-soft)]">
            {m.reviewAdvice}
            <span className="ml-1 text-[var(--ink)]">→ {m.reviewFix}</span>
          </p>
        </div>
        <div className="mt-2.5 flex gap-1.5 text-[11px]">
          <span className="rounded-md bg-[var(--brand)] px-2 py-0.5 text-[var(--brand-fg)]">{m.accept}</span>
          <span className="rounded-md border border-[var(--hairline)] px-2 py-0.5 text-[var(--ink-faint)]">
            {m.ignore}
          </span>
        </div>
      </div>
    </div>
  );
}

/** A share page with one comment thread, and the export menu's formats */
export function ShareMock({ m }: { m: ShowcasesCopy["share"]["mock"] }) {
  return (
    <div className={MOCK_CARD} aria-hidden="true">
      <div className="flex h-7 items-center rounded-md bg-[var(--sidebar)] px-3 font-mono text-[11px] text-[var(--ink-faint)]">
        <span className="truncate">{m.url}</span>
      </div>
      <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,0.9fr)]">
        <p className="rounded-lg border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3.5 text-[13px] leading-[2] text-[var(--ink-soft)]">
          {m.excerpt}
          <span className="rounded-sm bg-[#fdf0c4] text-[var(--ink)] dark:bg-[#5a4a1a]">{m.highlighted}</span>
        </p>
        <div className="space-y-2">
          {[m.comment, m.reply].map((c, i) => (
            <div
              key={c.text}
              className={`rounded-lg border border-[var(--hairline)] px-3 py-2 ${i ? "ml-4" : ""}`}
            >
              <p className="flex items-center gap-1.5 text-[11.5px] font-medium">
                <span className="flex h-4 w-4 items-center justify-center rounded-full bg-[var(--brand-wash)] text-[9px] text-[var(--brand)]">
                  {c.author.slice(0, 1)}
                </span>
                {c.author}
              </p>
              <p className="mt-1 text-[12px] leading-[1.7] text-[var(--ink-soft)]">{c.text}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[11.5px] text-[var(--ink-faint)]">{m.exportLabel}</span>
        {m.formats.map((f) => (
          <span
            key={f}
            className="rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-2 py-0.5 text-[11.5px] text-[var(--ink-soft)]"
          >
            {f}
          </span>
        ))}
      </div>
    </div>
  );
}
