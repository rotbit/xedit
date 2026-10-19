"use client";

import { FileText, MoreHorizontal } from "lucide-react";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import { useT } from "@/i18n/useT";
import { UNCATEGORIZED } from "../constants";
import { displayCatPath } from "../lib/catPath";
import type { Workspace } from "../hooks/useWorkspace";

/** Compact list view: one document per row, with category, word count and time on the right (in the 「最近打开」 (Recent) view, time is max(opened, edited)) */
export function DocListView({ ws }: { ws: Workspace }) {
  const { nav, menus, drag, filtered, timeOf } = ws;
  const t = useT();

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
              {doc.title || t(UNTITLED_DOC)}
            </span>
            <span className="hidden max-w-[160px] truncate text-[11.5px] text-[var(--ink-soft)] sm:block">
              {displayCatPath(cat, t)}
            </span>
            <span className="hidden w-16 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] sm:block">
              {typeof doc.chars === "number" && doc.chars > 0
                ? t("{n} 字", { n: doc.chars.toLocaleString(), abs: doc.chars })
                : ""}
            </span>
            <span className="w-[76px] shrink-0 text-right text-[11.5px] text-[var(--ink-faint)]">
              {formatRelativeTime(timeOf(doc))}
            </span>
            <button
              className="invisible cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-[var(--ink)] group-hover:visible [@media(hover:none)]:visible"
              // Menu trigger: the outside-click logic spares it, so clicking again toggles it closed here
              data-menu-trigger
              onClick={(e) => menus.toggleDocMenuAt(e, doc.id)}
            >
              <MoreHorizontal size={16} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
