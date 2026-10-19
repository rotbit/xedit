"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useEscape } from "@/hooks/useEscape";

/**
 * Shared shell for the command palette (⌘⇧P) and quick switcher (⌘O): portal backdrop + search box + result list,
 * plus keyboard navigation (↑↓ select, ↵ confirm, Esc close) and "scroll the highlighted item into view". The two look identical,
 * so there's one shell and each only handles its data source and row content.
 *
 * The query is owned by the caller (the switcher debounces outside); the highlight position is owned here.
 */
export function PaletteShell<T>({
  open,
  icon,
  placeholder,
  hint,
  query,
  onQueryChange,
  resetKey,
  items,
  keyOf,
  renderItem,
  itemAlign = "center",
  emptyText,
  listTop,
  onPick,
  onClose,
}: {
  open: boolean;
  /** Icon left of the search box */
  icon: React.ReactNode;
  placeholder: string;
  /** Key hints on the right (hidden on narrow screens) */
  hint: string;
  query: string;
  onQueryChange: (query: string) => void;
  /** Any change resets the highlight to the first item: the palette passes the raw query, the switcher passes the debounced one */
  resetKey: string;
  items: T[];
  keyOf: (item: T) => string;
  renderItem: (item: T) => React.ReactNode;
  /** Vertical alignment of row content: single-line commands are centered, two-line search results with snippets are top-aligned */
  itemAlign?: "center" | "start";
  emptyText: string;
  /** Fixed content at the top of the list (e.g. a 「最近编辑」 (Recently edited) heading), shown only when there are results */
  listTop?: React.ReactNode;
  onPick: (item: T) => void;
  onClose: () => void;
}) {
  const [index, setIndex] = useState(0);
  const activeRef = useRef<HTMLButtonElement>(null);

  // Every open starts at the first item. Reset during render behind a guard; in an effect it costs an extra frame and flashes the old highlight
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setIndex(0);
  }

  // A new query goes back to the first item, otherwise the highlight would sit on a position that no longer exists
  const [lastKey, setLastKey] = useState(resetKey);
  if (resetKey !== lastKey) {
    setLastKey(resetKey);
    setIndex(0);
  }

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [index, items]);

  useEscape(onClose, open);

  if (!open) return null;

  const move = (step: number) =>
    setIndex((i) => (items.length === 0 ? 0 : (i + step + items.length) % items.length));

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      move(1);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      move(-1);
    } else if (e.key === "Enter") {
      e.preventDefault();
      const hit = items[index];
      if (hit) onPick(hit);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[120] flex items-start justify-center bg-black/25 px-4 pt-[15vh] backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="float-pop flex max-h-[70vh] w-[560px] max-w-full flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center gap-2.5 border-b border-[var(--hairline)] px-4">
          {icon}
          <input
            autoFocus
            className="h-12 min-w-0 flex-1 bg-transparent text-[14px] text-[var(--ink)] outline-none placeholder:text-[var(--ink-faint)]"
            placeholder={placeholder}
            value={query}
            onChange={(e) => onQueryChange(e.target.value)}
            onKeyDown={onKeyDown}
          />
          <span className="hidden shrink-0 text-[11px] text-[var(--ink-faint)] sm:block">
            {hint}
          </span>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-1.5">
          {items.length === 0 ? (
            <p className="px-3 py-10 text-center text-[13px] text-[var(--ink-faint)]">
              {emptyText}
            </p>
          ) : (
            <>
              {listTop}
              {items.map((item, i) => {
                const active = i === index;
                return (
                  <button
                    key={keyOf(item)}
                    ref={active ? activeRef : undefined}
                    className={`flex w-full cursor-pointer gap-2.5 rounded-lg px-2.5 py-2 text-left transition-colors ${
                      itemAlign === "start" ? "items-start" : "items-center"
                    } ${active ? "bg-[var(--accent-wash)]" : ""}`}
                    onMouseEnter={() => setIndex(i)}
                    onClick={() => onPick(item)}
                  >
                    {renderItem(item)}
                  </button>
                );
              })}
            </>
          )}
        </div>
      </div>
    </div>,
    document.body
  );
}
