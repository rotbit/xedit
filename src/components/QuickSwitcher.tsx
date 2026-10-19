"use client";

// Obsidian-style quick switcher (⌘O / ⌘P): type to search titles and bodies, ↑↓ to select, ↵ to open.
// The search itself runs in lib/docSearch (pure localStorage, works offline); this only handles the data source and row rendering;
// the dialog shell (backdrop, input, list, keyboard navigation) is the PaletteShell shared with the command palette.

import { useEffect, useMemo, useState } from "react";
import { FileText, Search } from "lucide-react";
import { PaletteShell } from "./PaletteShell";
import { MatchHighlight } from "./MatchHighlight";
import { matchRanges, searchDocs, splitQuery } from "@/lib/docSearch";
import { UNCATEGORIZED, UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import type { DocMeta } from "@/features/workspace/types";
import { useT } from "@/i18n/useT";

/** List at most 30 at a time: more is unbrowsable and makes keyboard selection slower */
const LIMIT = 30;
/** Debounce between keystroke and search: bodies are read from localStorage one by one, too costly per keystroke */
const DEBOUNCE_MS = 120;

export function QuickSwitcher({
  open,
  docs,
  onClose,
  onOpen,
}: {
  open: boolean;
  docs: DocMeta[];
  onClose: () => void;
  onOpen: (id: string) => void;
}) {
  const t = useT();
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");

  // Each open is a fresh search: the previous query doesn't carry over.
  // Reset during render behind a guard (React's recommended pattern, same as useWorkspaceNav consuming ?doc);
  // in an effect it costs an extra frame — the dialog would flash the previous results first
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setQuery("");
      setDebounced("");
    }
  }

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  // The frame where open and wasOpen disagree is the eve of the re-render triggered by the reset above, and the query is still the old one:
  // skip searching then, rather than scan every body in the library with a stale query (hundreds of articles = hundreds of localStorage reads)
  const hits = useMemo(
    () => (open && open === wasOpen ? searchDocs(docs, debounced, { limit: LIMIT }) : []),
    [open, wasOpen, docs, debounced]
  );
  const terms = useMemo(() => splitQuery(debounced), [debounced]);

  const q = debounced.trim();

  return (
    <PaletteShell
      open={open}
      icon={<Search size={16} className="shrink-0 text-[var(--ink-faint)]" />}
      placeholder={t("搜索文章标题或正文…")}
      hint={t("↑↓ 选择 · ↵ 打开 · esc 关闭")}
      query={query}
      onQueryChange={setQuery}
      resetKey={debounced}
      items={hits}
      keyOf={(hit) => hit.doc.id}
      itemAlign="start"
      emptyText={q ? t("没有找到「{q}」", { q }) : t("还没有文章")}
      listTop={
        q ? null : (
          <p className="px-2.5 pb-1 pt-1 text-[11px] text-[var(--ink-faint)]">{t("最近编辑")}</p>
        )
      }
      onPick={(hit) => onOpen(hit.doc.id)}
      onClose={onClose}
      renderItem={(hit) => {
        const { doc } = hit;
        const title = doc.title || t(UNTITLED_DOC);
        return (
          <>
            <FileText size={14} className="mt-[3px] shrink-0 text-[var(--ink-faint)]" />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ink)]">
                  <MatchHighlight text={title} ranges={matchRanges(title, terms)} />
                </span>
                <span className="max-w-[9rem] shrink-0 truncate text-[11px] text-[var(--ink-faint)]">
                  {doc.category || t(UNCATEGORIZED)}
                </span>
                <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">
                  {formatRelativeTime(doc.updatedAt)}
                </span>
              </span>
              {hit.snippet ? (
                <span className="mt-0.5 block truncate text-[12px] text-[var(--ink-soft)]">
                  <MatchHighlight text={hit.snippet} ranges={hit.ranges} />
                </span>
              ) : null}
            </span>
          </>
        );
      }}
    />
  );
}
