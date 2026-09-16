"use client";

import { FileText, MoreHorizontal } from "lucide-react";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import { UNCATEGORIZED } from "../constants";
import type { Workspace } from "../hooks/useWorkspace";

/** 紧凑列表视图：一行一篇，右侧依次为分类、字数、时间 */
export function DocListView({ ws }: { ws: Workspace }) {
  const { nav, menus, drag, filtered } = ws;

  return (
    <div className="rise mt-4 overflow-hidden rounded-xl bg-[var(--panel)] shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] dark:ring-white/10">
      {filtered.map((doc) => {
        const cat = doc.category || UNCATEGORIZED;
        return (
          <div
            key={doc.id}
            className={`group relative flex cursor-pointer items-center gap-3 border-b border-[var(--hairline-soft)] px-4 py-3 transition-colors last:border-b-0 hover:bg-[var(--paper)] ${
              drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""
            }`}
            onClick={() => nav.openDoc(doc.id)}
            onContextMenu={(e) => menus.openDocMenuAt(e, doc.id)}
            {...drag.dragSrcProps({ kind: "doc", id: doc.id })}
          >
            <FileText size={14} className="shrink-0 text-[var(--ink-faint)]" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink)]">
              {doc.title || UNTITLED_DOC}
            </span>
            <span className="hidden max-w-[160px] truncate text-[11.5px] text-[var(--ink-soft)] sm:block">
              {cat}
            </span>
            <span className="hidden w-16 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] sm:block">
              {typeof doc.chars === "number" && doc.chars > 0
                ? `${doc.chars.toLocaleString()} 字`
                : ""}
            </span>
            <span className="w-[76px] shrink-0 text-right text-[11.5px] text-[var(--ink-faint)]">
              {formatRelativeTime(doc.updatedAt)}
            </span>
            <button
              className="invisible cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-[var(--ink)] group-hover:visible [@media(hover:none)]:visible"
              // 菜单触发器：外部关闭逻辑放它一马，再点一次由这里 toggle 关掉
              data-menu-trigger
              onClick={(e) => menus.toggleDocMenuAt(e, doc.id)}
            >
              <MoreHorizontal size={15} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
