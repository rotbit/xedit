"use client";

import { useEffect, useMemo, useState } from "react";
import { Folder, FolderUp, Search } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";

export interface CategoryPickOptions {
  title: string;
  /** 全量分类路径（已排序）；层级由 `/` 拆出 */
  categories: string[];
  /** 当前所在分类：列表里置灰不可选 */
  current?: string;
  /** 提供该文案时列表顶部固定一项「顶级」，选中后 resolve 空串（null 仍表示取消） */
  topOption?: string;
}

interface PickState extends CategoryPickOptions {
  resolve: (value: string | null) => void;
}

let opener: ((opts: CategoryPickOptions) => Promise<string | null>) | null = null;

/** 带搜索的分类选择弹窗（分类多、层级深时替代菜单平铺） */
export function askCategoryPick(opts: CategoryPickOptions): Promise<string | null> {
  if (!opener) return Promise.resolve(null);
  return opener(opts);
}

const nameOf = (path: string) =>
  path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;

/** 深层缩进与侧栏同思路：前两层大步进，之后小步进并封顶 */
const indentOf = (depth: number) =>
  Math.min(Math.min(depth, 2) * 14 + Math.max(depth - 2, 0) * 8, 72);

export function CategoryPickHost() {
  const [state, setState] = useState<PickState | null>(null);
  const [query, setQuery] = useState("");

  useEffect(() => {
    opener = (opts) =>
      new Promise<string | null>((resolve) => {
        setQuery("");
        setState({ ...opts, resolve });
      });
    return () => {
      opener = null;
    };
  }, []);

  const close = (result: string | null) => {
    state?.resolve(result);
    setState(null);
  };
  useEscape(() => close(null), state !== null);

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!state) return [];
    return q ? state.categories.filter((c) => c.toLowerCase().includes(q)) : state.categories;
  }, [state, q]);

  if (!state) return null;

  const selectable = shown.filter((c) => c !== state.current);

  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
      onClick={() => close(null)}
    >
      <div
        className="toast-in flex max-h-[76vh] w-[440px] max-w-[92vw] flex-col overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_24px_70px_-16px_rgba(40,25,5,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-3 pt-5">
          <h3 className="truncate text-[15px] font-semibold [font-family:var(--serif)]">
            {state.title}
          </h3>
          <div className="relative mt-3">
            <Search
              size={13}
              className="absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
            />
            <input
              autoFocus
              className="h-9 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] pl-8 pr-3 text-[13px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
              placeholder="搜索分类…"
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
              <FolderUp size={13} className="shrink-0 text-[var(--ink-faint)]" />
              {state.topOption}
            </button>
          ) : null}
          {shown.length === 0 ? (
            <p className="px-3 py-8 text-center text-[12.5px] text-[var(--ink-faint)]">
              没有匹配的分类
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
                  style={{ paddingLeft: `${12 + (q ? 0 : indentOf(depth))}px` }}
                  title={c}
                  disabled={isCurrent}
                  onClick={() => close(c)}
                >
                  <Folder size={13} className="shrink-0 text-[var(--ink-faint)]" />
                  {q ? (
                    // 搜索态平铺：显示完整路径便于区分同名分类
                    <span className="truncate">{c}</span>
                  ) : (
                    <span className="truncate">{nameOf(c)}</span>
                  )}
                  {isCurrent ? (
                    <span className="ml-auto shrink-0 text-[11px] text-[var(--ink-faint)]">
                      当前所在
                    </span>
                  ) : null}
                </button>
              );
            })
          )}
        </div>
        <div className="flex items-center justify-end border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-5 py-2.5">
          <button
            className="h-8 cursor-pointer rounded-lg px-4 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            onClick={() => close(null)}
          >
            取消
          </button>
        </div>
      </div>
    </div>
  );
}
