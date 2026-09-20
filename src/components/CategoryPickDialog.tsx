"use client";

/**
 * 带搜索的分类选择弹窗：分类多、层级深时替代右键菜单里平铺的一长串分类。
 * 走 createDialogHost 的「单宿主 + 全局 open()」模式，调用方 await askCategoryPick() 直接拿结果。
 * 返回值有三种含义要分清：分类路径字符串、空串（选了顶级）、null（取消或宿主没挂载）。
 */
import { useMemo, useState } from "react";
import { Folder, FolderPlus, FolderUp, Search } from "lucide-react";
import { createDialogHost } from "@/hooks/useDialogHost";
import { nameOf } from "@/features/workspace/lib/catPath";
import { PaperDialog } from "./Modal";

/** 选中「新建分类」入口时的返回哨兵（NUL 不可能出现在真实分类名里） */
export const CREATE_CATEGORY = "\0create";

export interface CategoryPickOptions {
  title: string;
  /** 全量分类路径（已排序）；层级由 `/` 拆出 */
  categories: string[];
  /** 当前所在分类：列表里置灰不可选 */
  current?: string;
  /** 提供该文案时列表顶部固定一项「顶级」，选中后 resolve 空串（null 仍表示取消） */
  topOption?: string;
  /** 提供该文案时列表底部固定一项「新建分类」，选中后 resolve CREATE_CATEGORY */
  createOption?: string;
}

const pickHost = createDialogHost<CategoryPickOptions, string | null>(null);

/** 带搜索的分类选择弹窗（分类多、层级深时替代菜单平铺）；取消 / 宿主未挂载时 resolve null */
export const askCategoryPick = pickHost.open;

/** 深层缩进与侧栏同思路：前两层大步进，之后小步进并封顶 */
const indentOf = (depth: number) =>
  Math.min(Math.min(depth, 2) * 14 + Math.max(depth - 2, 0) * 8, 72);

/** 弹窗宿主，在根布局挂一份即可；没有打开时返回 null，不占 DOM。 */
export function CategoryPickHost() {
  const [query, setQuery] = useState("");
  // 每次打开都从空搜索词开始
  const { state, close } = pickHost.useHost(() => setQuery(""));

  const q = query.trim().toLowerCase();
  const shown = useMemo(() => {
    if (!state) return [];
    return q ? state.categories.filter((c) => c.toLowerCase().includes(q)) : state.categories;
  }, [state, q]);

  if (!state) return null;

  // 只给回车直选用：候选唯一时回车才敢替用户决定，剩下多个时回车不做任何事
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
            <FolderUp size={14} className="shrink-0 text-[var(--ink-faint)]" />
            {state.topOption}
          </button>
        ) : null}
        {shown.length === 0 && !state.createOption ? (
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
                // 搜索态取消层级缩进：过滤后的结果在树里本来就不连续，留着缩进反而看起来错位
                style={{ paddingLeft: `${12 + (q ? 0 : indentOf(depth))}px` }}
                title={c}
                disabled={isCurrent}
                onClick={() => close(c)}
              >
                <Folder size={14} className="shrink-0 text-[var(--ink-faint)]" />
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
          取消
        </button>
      </div>
    </PaperDialog>
  );
}
