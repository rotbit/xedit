"use client";

/**
 * Searchable category picker dialog: replaces the long flat category list in the context menu when there are many deeply nested categories.
 * Uses createDialogHost's "single host + global open()" pattern; callers simply await askCategoryPick() for the result.
 * The return value has three distinct meanings: a category path string, an empty string (top level chosen), or null (cancelled or host not mounted).
 */
import { useMemo, useState } from "react";
import { Folder, FolderPlus, FolderUp, Search } from "lucide-react";
import { createDialogHost } from "@/hooks/useDialogHost";
import { nameOf } from "@/features/workspace/lib/catPath";
import { PaperDialog } from "./Modal";
import { useT } from "@/i18n/useT";

/** Sentinel returned when the 「新建分类」 (New category) entry is chosen (NUL can never appear in a real category name) */
export const CREATE_CATEGORY = "\0create";

export interface CategoryPickOptions {
  title: string;
  /** All category paths (sorted); levels are split on `/` */
  categories: string[];
  /** The current category: greyed out and unselectable in the list */
  current?: string;
  /** When this label is provided, a fixed 「顶级」 (Top level) item sits at the top; choosing it resolves an empty string (null still means cancel) */
  topOption?: string;
  /** When this label is provided, a fixed 「新建分类」 (New category) item sits at the bottom; choosing it resolves CREATE_CATEGORY */
  createOption?: string;
}

const pickHost = createDialogHost<CategoryPickOptions, string | null>(null);

/** Searchable category picker (replaces the flat menu when categories are many and deep); resolves null on cancel / when the host isn't mounted */
export const askCategoryPick = pickHost.open;

/** Deep indentation follows the sidebar: big steps for the first two levels, then small capped steps */
const indentOf = (depth: number) =>
  Math.min(Math.min(depth, 2) * 14 + Math.max(depth - 2, 0) * 8, 72);

/** Dialog host; mount one in the root layout. Returns null when not open, taking no DOM. */
export function CategoryPickHost() {
  const t = useT();
  const [query, setQuery] = useState("");
  // Every open starts with an empty search
  const { state, close } = pickHost.useHost(() => setQuery(""));

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!state) return [];
    return q ? state.categories.filter((c) => c.toLowerCase().includes(q)) : state.categories;
  }, [state, q]);

  if (!state) return null;

  // Only for Enter-to-pick: Enter decides for the user only when there's a single candidate; with several it does nothing
  const selectable = shown.filter((c) => c !== state.current);

  return (
    <PaperDialog width={440} panelClass="flex max-h-[76vh] flex-col" onClose={() => close(null)}>
      <div className="px-6 pb-3 pt-5">
        <h3 className="truncate text-[15px] font-semibold [font-family:var(--serif)]">
          {state.title}
        </h3>
        <div className="relative mt-3">
          <Search
            size={14}
            className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
          />
          <input
            autoFocus
            className="h-9 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] pl-8 pr-3 text-[13px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
            placeholder={t("搜索文件夹…")}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && selectable.length === 1) close(selectable[0]);
              if (e.key === "Escape") close(null);
            }}
          />
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pb-3">
        {state.topOption ? (
          <button
            className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pl-3 pr-3 text-left text-[13px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
            onClick={() => close("")}
          >
            <FolderUp size={14} className="shrink-0 text-[var(--ink-faint)]" />
            {state.topOption}
          </button>
        ) : null}
        {shown.length === 0 && !state.createOption ? (
          <p className="px-3 py-8 text-center text-[12.5px] text-[var(--ink-faint)]">
            {t("没有匹配的文件夹")}
          </p>
        ) : (
          shown.map((c) => {
            const isCurrent = c === state.current;
            const depth = c.split("/").length - 1;
            return (
              <button
                key={c}
                className={`flex w-full items-center gap-2 rounded-md py-1.5 pr-3 text-left text-[13px] transition-colors ${
                  isCurrent
                    ? "cursor-default text-[var(--ink-faint)]"
                    : "cursor-pointer text-[var(--ink)] hover:bg-[var(--paper)]"
                }`}
                // Drop tree indentation while searching: filtered results aren't contiguous in the tree, so indentation would look misaligned
                style={{ paddingLeft: `${12 + (q ? 0 : indentOf(depth))}px` }}
                title={c}
                disabled={isCurrent}
                onClick={() => close(c)}
              >
                <Folder size={14} className="shrink-0 text-[var(--ink-faint)]" />
                {q ? (
                  // Flat while searching: show the full path to tell same-named categories apart
                  <span className="truncate">{c}</span>
                ) : (
                  <span className="truncate">{nameOf(c)}</span>
                )}
                {isCurrent ? (
                  <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-faint)]">
                    {t("当前所在")}
                  </span>
                ) : null}
              </button>
            );
          })
        )}
        {state.createOption ? (
          <button
            className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pl-3 pr-3 text-left text-[13px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
            onClick={() => close(CREATE_CATEGORY)}
          >
            <FolderPlus size={14} className="shrink-0 text-[var(--ink-faint)]" />
            {state.createOption}
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-end border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-5 py-2.5">
        <button
          className="h-8 cursor-pointer rounded-lg px-4 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          onClick={() => close(null)}
        >
          {t("取消")}
        </button>
      </div>
    </PaperDialog>
  );
}
