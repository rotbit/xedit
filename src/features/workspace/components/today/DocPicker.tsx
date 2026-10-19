"use client";

/**
 * Doc picker for linking a todo to an article: search box + recent docs / search results + a pinned "New document…" row at the end.
 * It only picks; the choice goes to onPick. Picking "New" is just reported too — the caller asks for the folder next
 * (each caller has to close its own popover first). The frame (positioning, border, shadow) comes from the caller:
 * a full-width popover under the input row in quick add, a small popover at the row end on the Today page.
 */
import { useMemo, useState, type ReactNode } from "react";
import { FilePlus2 } from "lucide-react";
import type { TFn } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { searchDocs } from "@/lib/docSearch";
import { isTemplateDoc } from "@/lib/templates";
import type { DocMeta } from "../../types";

/** What was picked: an existing doc / a new one (empty title means none given; the caller falls back to the task text) */
export type DocPick = { kind: "doc"; id: string } | { kind: "new"; title: string };

export interface Option {
  key: string;
  pick: DocPick;
  label: string;
  /** Gray text on the right: category name */
  hint: string;
}

const MAX_RESULTS = 8;
const RECENT_COUNT = 7;

const docOption = (doc: DocMeta, t: TFn): Option => ({
  key: doc.id,
  pick: { kind: "doc", id: doc.id },
  label: doc.title || t(UNTITLED_DOC),
  hint: doc.category ?? "",
});

/**
 * Candidates for linking. docs are already the user-visible ones (the todo-list doc is filtered out at the library layer).
 * Template categories are excluded: templates are scaffolds for new drafts, not the doc a task belongs to.
 */
function buildOptions(docs: DocMeta[], query: string, t: TFn): Option[] {
  const pool = docs.filter((d) => !isTemplateDoc(d));
  const q = query.trim();
  // With an empty query searchDocs sorts by recency, i.e. "recent docs"
  const hits = searchDocs(pool, q, { limit: q ? MAX_RESULTS : RECENT_COUNT }).map((h) => docOption(h.doc, t));
  // "New" stays pinned at the end: the doc to link often doesn't exist yet; users shouldn't have to search and miss first.
  // Use the query as the title when no doc has that exact title. Checking only for "any hit" means searching "weekly report" would
  // hide the New row whenever some doc mentions it in the body, so the user couldn't create one actually titled "weekly report"; with an exact match, don't reuse it to avoid duplicates
  const titled = q !== "" && !pool.some((d) => d.title === q);
  hits.push({
    key: "new",
    pick: { kind: "new", title: titled ? q : "" },
    label: titled ? t("新建《{title}》", { title: q }) : t("新建文章…"),
    hint: "",
  });
  return hits;
}

const searchCls =
  "w-full min-w-0 rounded-md border border-[var(--hairline)] bg-transparent px-2 py-1.5 text-[13px] outline-none placeholder:text-[var(--ink-faint)] focus:border-[var(--hairline-strong)]";

export function DocPicker({
  docs,
  onPick,
  top,
}: {
  docs: DocMeta[];
  onPick: (o: Option) => void;
  /** Extra row at the top of the list (e.g. "Unlink"); not part of ↑↓ selection */
  top?: ReactNode;
}) {
  const [query, setQuery] = useState("");
  const [sel, setSel] = useState(0);
  const t = useT();
  // Searching bodies reads each doc from cache, so don't recompute for unchanged input
  const options = useMemo(() => buildOptions(docs, query, t), [docs, query, t]);
  const active = Math.min(sel, options.length - 1);

  /** ↑↓ moves the selection, Enter picks; Enter during IME composition selects a candidate, not a pick */
  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.nativeEvent.isComposing) return;
    const n = options.length;
    if ((e.key === "ArrowDown" || e.key === "ArrowUp") && n > 0) {
      e.preventDefault();
      setSel((active + (e.key === "ArrowDown" ? 1 : n - 1)) % n);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const o = options[active];
      if (o) onPick(o);
    }
  };

  return (
    <>
      <input
        autoFocus
        className={searchCls}
        placeholder={t("搜索文章…")}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setSel(0); // New result set: reset selection to the first item
        }}
        onKeyDown={onKeyDown}
      />
      <div className="mt-1">
        {top}
        <div role="listbox" aria-label={t("目标文章")}>
          {options.map((o, i) => (
            <div
              key={o.key}
              role="option"
              aria-selected={i === active}
              className={`flex cursor-pointer items-baseline gap-2 rounded-md px-2 py-1.5 ${
                i === active ? "bg-[var(--accent-wash)]" : ""
              }`}
              onMouseEnter={() => setSel(i)}
              // Don't steal focus on mousedown: the parent decides where focus goes after a pick
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => onPick(o)}
            >
              {o.pick.kind === "new" ? (
                <FilePlus2 size={13} className="shrink-0 self-center text-[var(--ink-faint)]" />
              ) : null}
              <span className="min-w-0 flex-1 truncate">{o.label}</span>
              {o.hint ? <span className="max-w-[40%] shrink-0 truncate text-[12px] text-[var(--ink-faint)]">{o.hint}</span> : null}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
