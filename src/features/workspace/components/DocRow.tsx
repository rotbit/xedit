"use client";

import { FileText, Trash2 } from "lucide-react";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { useT } from "@/i18n/useT";
import { rowCls, rowInset, rowPadLeft } from "../constants";
import { SHIFT_TRANSITION } from "../lib/dragShift";
import { docRowKey } from "../hooks/useDragMove";
import { iconTone } from "./NavRow";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** Document row in the sidebar category tree; reorder drops on it are hit-tested by the tree (useDragMove.treeDropProps) */
export function DocRow({ ws, doc, depth }: { ws: Workspace; doc: DocMeta; depth: number }) {
  const { nav, menus, drag, docActions } = ws;
  const active = nav.readingId === doc.id;
  const t = useT();
  const label = doc.title || t(UNTITLED_DOC);
  const rowKey = docRowKey(doc.id);

  return (
    <div
      className={`group/doc relative rounded-md ${drag.dragItem ? SHIFT_TRANSITION : ""} ${
        drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""
      }`}
      // Row and block at once: slides aside while a drag makes room (see lib/dragShift)
      data-drag-row={rowKey}
      data-drag-block=""
      style={drag.shiftStyle(rowKey)}
      {...drag.dragSrcProps({ kind: "doc", id: doc.id })}
    >
      <button
        className={`flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[12.5px] transition-colors group-hover/doc:pr-7 ${rowCls(active)}`}
        // Margin indent same as CategoryRow; 14px icon slot + gap-2 aligns with the icon and text left edges of sibling folder rows
        style={{
          marginLeft: `${rowInset(depth)}px`,
          width: `calc(100% - ${rowInset(depth)}px)`,
          paddingLeft: `${rowPadLeft(depth)}px`,
        }}
        onClick={() => nav.openDoc(doc.id)}
        onContextMenu={(e) => menus.openDocMenuAt(e, doc.id)}
        title={doc.title}
      >
        <span className={`flex w-[14px] shrink-0 justify-center ${iconTone(active)}`}>
          <FileText size={12} />
        </span>
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      <button
        className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600 group-hover/doc:block dark:hover:bg-red-950/40 dark:hover:text-red-400"
        title={t("把「{name}」移入回收站", { name: label })}
        onClick={() => void docActions.removeDoc(doc)}
      >
        <Trash2 size={12} />
      </button>
    </div>
  );
}
