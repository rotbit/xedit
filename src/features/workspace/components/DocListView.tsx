"use client";

import { FileText, MoreHorizontal } from "lucide-react";
import { UNCATEGORIZED } from "../constants";
import { catColorOf } from "../lib/catTree";
import { formatTime } from "../lib/docSource";
import { DocContextMenu } from "./DocContextMenu";
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
            <span className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-[var(--ink)] [font-family:var(--serif)]">
              {doc.title || "未命名文章"}
            </span>
            <span className="hidden max-w-[160px] items-center gap-1.5 text-[11.5px] text-[var(--ink-soft)] sm:flex">
              <span
                className="h-[7px] w-[7px] shrink-0 rounded-full"
                style={{ background: catColorOf(cat) }}
              />
              <span className="truncate">{cat}</span>
            </span>
            <span className="hidden w-16 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] sm:block">
              {typeof doc.chars === "number" && doc.chars > 0
                ? `${doc.chars.toLocaleString()} 字`
                : ""}
            </span>
            <span className="w-[76px] shrink-0 text-right text-[11.5px] text-[var(--ink-faint)]">
              {formatTime(doc.updatedAt)}
            </span>
            <button
              className="invisible cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-[var(--ink)] group-hover:visible [@media(hover:none)]:visible"
              onClick={(e) => menus.toggleDocMenuAt(e, doc.id)}
            >
              <MoreHorizontal size={15} />
            </button>
            <DocContextMenu ws={ws} doc={doc} cat={cat} />
          </div>
        );
      })}
    </div>
  );
}
