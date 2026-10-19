"use client";

// Visual layer of the Notion-style `/` slash menu: portaled to body, fixed-positioned, follows scrolling.
// All truth lives in CodeMirror's StateField (see lib/slashMenu.ts); this only subscribes and renders —
// the component does its own setState, so re-renders while typing stop at this menu and don't touch the whole article view.
// Positioning (aligning to the trigger, flipping up/down, following scroll) is shared with `[[` completion via useAnchoredMenu.

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "@codemirror/view";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { toast } from "@/components/Toast";
import {
  filterSlashItems,
  highlightSlashIndex,
  runSlashItem,
  type SlashState,
} from "@/lib/slashMenu";
import { useT } from "@/i18n/useT";

/** Menu width (matches w-60), row height, and max visible rows; beyond that it scrolls internally */
const MENU_W = 240;
const ROW_H = 32;
const MAX_ROWS = 8;

export function SlashMenu({
  subscribe,
  viewRef,
  scrollEl,
}: {
  /** Subscribe to menu state pushed by the editor; returns an unsubscribe function */
  subscribe: (cb: (s: SlashState | null) => void) => () => void;
  viewRef: React.RefObject<EditorView | null>;
  /** The editor's scroll container: recompute position on scroll */
  scrollEl: HTMLElement | null;
}) {
  const t = useT();
  const rootRef = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<SlashState | null>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribe(setSt), [subscribe]);

  const anchor = useAnchoredMenu(st?.from ?? null, viewRef, rootRef, scrollEl, MENU_W);

  // When the highlight moves via keyboard, bring it into view (the list shows at most 8 rows)
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [st?.index]);

  if (!st) return null;
  const items = filterSlashItems(st.query);
  /** Full range of `/query`: deleted first once an item is chosen */
  const to = st.from + 1 + st.query.length;

  return createPortal(
    <div
      ref={rootRef}
      className="slash-menu float-pop fixed z-[70] w-60 overflow-y-auto rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] p-1"
      style={{
        left: anchor.left,
        top: anchor.top,
        maxHeight: MAX_ROWS * ROW_H + 8,
        visibility: anchor.visible ? "visible" : "hidden",
      }}
      // Press without stealing focus: the editor keeps focus, and the cursor and `/` stay put (same as the floating toolbar)
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 ? (
        <div className="px-2 py-2 text-[13px] text-[var(--ink-faint)]">{t("没有匹配的块")}</div>
      ) : (
        items.map((item, i) => {
          const Icon = item.icon;
          const active = i === st.index;
          return (
            <button
              key={item.id}
              ref={active ? activeRef : undefined}
              className={`flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-[var(--ink)] ${
                active ? "bg-[var(--accent-wash)]" : ""
              }`}
              onMouseEnter={() => {
                const v = viewRef.current;
                if (v) highlightSlashIndex(v, i);
              }}
              onClick={() => {
                const v = viewRef.current;
                // `/视频` starts an upload; its toast is shown by the component layer
                if (v) runSlashItem(v, item, st.from, to, toast);
              }}
            >
              <Icon size={16} className="shrink-0 text-[var(--ink-soft)]" />
              <span className="min-w-0 flex-1 truncate">{t(item.label)}</span>
              <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{t(item.hint)}</span>
            </button>
          );
        })
      )}
    </div>,
    document.body
  );
}
