"use client";

import { useState } from "react";
import { ChevronRight, Hash } from "lucide-react";
import { ALL, countCls, rowCls } from "../constants";
import { readLocal, writeLocal } from "../lib/storage";
import type { Workspace } from "../hooks/useWorkspace";
import type { WorkspaceNav } from "../hooks/useWorkspaceNav";

const K_OPEN = "xedit:tags-open";

/**
 * 按标签筛文章：复用侧栏搜索框那一条通道——搜索词写成 `#标签`，docSearch 认这个前缀。
 * 好处是标签与关键词天然可以叠加（`#前端 缓存`），也不必再维护一份「当前标签」状态。
 * 先把分类归零：点标签是全库视角，否则在某个分类里点会静悄悄地少一半结果。
 */
export function searchTag(nav: WorkspaceNav, tag: string): void {
  nav.setActiveCat(ALL);
  nav.onSearch(`#${tag}`);
}

/** 侧栏标签区：全库标签按篇数排序，一篇都没打过标签时整块不出现 */
export function TagList({ ws }: { ws: Workspace }) {
  const { nav, tagIndex } = ws;
  const [open, setOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return readLocal(K_OPEN) !== "0";
  });

  const toggle = () => {
    setOpen((v) => {
      writeLocal(K_OPEN, v ? "0" : "1");
      return !v;
    });
  };

  if (tagIndex.length === 0) return null;
  const current = nav.search.trim().toLowerCase();

  return (
    // 最多占侧栏四成高度、自己滚：标签多起来不该把分类树挤没
    <div className="flex max-h-[40%] shrink-0 flex-col border-t border-[var(--hairline-soft)] px-2 pb-1 pt-1">
      <button
        className="flex w-full shrink-0 cursor-pointer items-center gap-1 rounded-md py-1 pr-2 text-left text-[11px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-hover)]"
        style={{ paddingLeft: "6px" }}
        onClick={toggle}
        title={open ? "收起标签" : "展开标签"}
      >
        <span className="flex h-5 w-5 shrink-0 items-center justify-center">
          <ChevronRight size={12} className={`transition-transform ${open ? "rotate-90" : ""}`} />
        </span>
        <span className="ml-1 min-w-0 flex-1 truncate tracking-[0.08em]">标签</span>
        <span>{tagIndex.length}</span>
      </button>
      {open ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {tagIndex.map(({ tag, count }) => {
            const active = current === `#${tag}`;
            return (
              <button
                key={tag}
                className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${rowCls(active)}`}
                style={{ paddingLeft: "6px" }}
                onClick={() => searchTag(nav, tag)}
                title={`筛出 #${tag} 的文章`}
              >
                <span className="h-5 w-5 shrink-0" />
                <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
                  <Hash size={13} />
                </span>
                <span className="ml-1 min-w-0 flex-1 truncate">{tag}</span>
                <span className={`rounded-full px-1.5 text-[11px] ${countCls(active)}`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
