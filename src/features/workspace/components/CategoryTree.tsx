"use client";

import { ChevronRight, FilePlus2, FolderPlus, Inbox } from "lucide-react";
import { ALL, DROP_HL, UNCATEGORIZED, countCls, rowCls } from "../constants";
import { CategoryRow } from "./CategoryRow";
import type { Workspace } from "../hooks/useWorkspace";

const actionBtn =
  "cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--sidebar-active)]";

/**
 * 分类树：根节点「全部文章」+ 其下的分类子树。
 * 根节点同时是拖拽落点——分类提为顶级 / 文章移入未分类。
 */
export function CategoryTree({ ws }: { ws: Workspace }) {
  const { nav, prefs, menus, drag, library, docActions, catActions, tree } = ws;
  const rootActive = nav.activeCat === ALL && !nav.readingId;

  return (
    <nav className="mt-1 flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto px-2 pb-3">
      <div className="group/cat relative" {...drag.dropProps(ALL)}>
        <div
          className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${rowCls(rootActive)} ${
            drag.dropTarget === ALL ? DROP_HL : ""
          }`}
          style={{ paddingLeft: "6px" }}
          onClick={() => {
            if (!prefs.rootOpen) prefs.toggleRoot();
            nav.openCategory(ALL);
          }}
          onContextMenu={(e) => menus.openCatMenuAt(e, ALL)}
        >
          <span
            className="flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[var(--ink-faint)] hover:bg-[var(--hairline)]"
            onClick={(e) => {
              e.stopPropagation();
              prefs.toggleRoot();
            }}
          >
            <ChevronRight
              size={12}
              className={`transition-transform ${prefs.rootOpen ? "rotate-90" : ""}`}
            />
          </span>
          <span className={rootActive ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>
            <Inbox size={14} />
          </span>
          <span className="ml-1 min-w-0 flex-1 truncate">全部文章</span>
          <span
            className={`rounded-full px-1.5 text-[11px] group-hover/cat:hidden ${countCls(rootActive)}`}
          >
            {library.docs?.length ?? 0}
          </span>
        </div>
        <span className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 items-center group-hover/cat:flex">
          <button
            className={`${actionBtn} hover:text-[var(--accent)]`}
            title="新建文章"
            onClick={(e) => {
              e.stopPropagation();
              void docActions.createDoc(UNCATEGORIZED);
            }}
          >
            <FilePlus2 size={13} />
          </button>
          <button
            className={`${actionBtn} hover:text-[var(--ink)]`}
            title="新建分类"
            onClick={(e) => {
              e.stopPropagation();
              void catActions.createCategory();
            }}
          >
            <FolderPlus size={13} />
          </button>
        </span>
      </div>
      {prefs.rootOpen ? tree.map((n) => <CategoryRow key={n.path} ws={ws} node={n} depth={1} />) : null}
    </nav>
  );
}
