"use client";

// Article title completion popup for `[[`: portaled to body, fixed-positioned, follows scrolling.
// All truth lives in CodeMirror's StateField (see lib/wikiLink/menu.ts); this only subscribes and renders —
// the component does its own setState, so re-renders while typing stop at this menu and don't touch the whole article view.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Plus } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import {
  activeWikiIndex,
  filterWikiCandidates,
  highlightWikiIndex,
  pickWikiItem,
  wikiQueryEnd,
  type WikiMenuState,
} from "@/lib/wikiLink/menu";
import { UNCATEGORIZED } from "@/features/workspace/constants";
import type { DocMeta } from "@/features/workspace/types";
import { useT } from "@/i18n/useT";

/** Menu width (matches w-72), row height, and max visible rows; beyond that it scrolls internally */
const MENU_W = 288;
const ROW_H = 32;
const MAX_ROWS = 8;

const NO_DOCS: DocMeta[] = [];

export function WikiLinkMenu({
  subscribe,
  viewRef,
  scrollEl,
  docs,
}: {
  /** Subscribe to menu state pushed by the editor; returns an unsubscribe function */
  subscribe: (cb: (s: WikiMenuState | null) => void) => () => void;
  viewRef: React.RefObject<EditorView | null>;
  /** The editor's scroll container: recompute position on scroll */
  scrollEl: HTMLElement | null;
  /** Candidate articles; the same list as getDocs() in the editor extension, used here for rendering */
  docs?: DocMeta[];
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<WikiMenuState | null>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribe(setSt), [subscribe]);

  const anchor = useAnchoredMenu(st?.from ?? null, viewRef, rootRef, scrollEl, MENU_W);

  // When the highlight moves via keyboard, bring it into view (the list shows at most 8 rows)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [st?.index]);

  if (!st) return null;
  const items = filterWikiCandidates(docs ?? NO_DOCS, st.query);
  // No matches and no 「新建」 (New) to offer (empty library with an empty query): don't leave an empty shell over the body
  if (items.length === 0) return null;
  const active = activeWikiIndex(st.index, items.length);
  const to = wikiQueryEnd(st);

  return createPortal(
    <div
      ref={rootRef}
      className="slash-menu float-pop fixed z-[70] w-72 overflow-y-auto rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] p-1"
      style={{
        left: anchor.left,
        top: anchor.top,
        maxHeight: MAX_ROWS * ROW_H + 8,
        visibility: anchor.visible ? "visible" : "hidden",
      }}
      // Press without stealing focus: the editor keeps focus, and the cursor and `[[` stay put (same as the floating toolbar)
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        const on = i === active;
        const create = item.kind === "create";
        return (
          <button
            key={create ? "__create__" : item.doc.id}
            ref={on ? activeRef : undefined}
            className={`flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-[var(--ink)] ${
              on ? "bg-[var(--accent-wash)]" : ""
            }`}
            onMouseEnter={() => {
              const v = viewRef.current;
              if (v) highlightWikiIndex(v, i);
            }}
            onClick={() => {
              const v = viewRef.current;
              if (v) pickWikiItem(v, item, st.from, to);
            }}
          >
            {create ? (
              <>
                <Plus size={16} className="shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1 truncate">{t("新建「{title}」", { title: item.title })}</span>
              </>
            ) : (
              <>
                <FileText size={16} className="shrink-0 text-[var(--ink-soft)]" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="max-w-[7rem] shrink-0 truncate text-[11px] text-[var(--ink-faint)]">
                  {item.doc.category || t(UNCATEGORIZED)}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
