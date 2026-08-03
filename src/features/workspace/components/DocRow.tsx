"use client";

import { FileText, Trash2 } from "lucide-react";
import {
  DROP_LINE_BOTTOM,
  DROP_LINE_TOP,
  UNCATEGORIZED,
  rowCls,
  treeIndent,
} from "../constants";
import { DocContextMenu } from "./DocContextMenu";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** 侧栏分类树里的文章行；同时是排序落点（拖到上/下半区插到前/后） */
export function DocRow({ ws, doc, depth }: { ws: Workspace; doc: DocMeta; depth: number }) {
  const { nav, menus, drag, docActions } = ws;
  const active = nav.readingId === doc.id;
  const label = doc.title || "未命名文章";
  const spot = drag.dropSpot;
  const zone = spot?.kind === "doc" && spot.key === doc.id ? spot.zone : null;
  const dropCls = zone === "before" ? DROP_LINE_TOP : zone === "after" ? DROP_LINE_BOTTOM : "";

  return (
    <div
      className={`group/doc relative rounded-md ${dropCls} ${
        drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""
      }`}
      {...drag.dragSrcProps({ kind: "doc", id: doc.id })}
      {...drag.docDropProps(doc)}
    >
      <button
        className={`flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[12.5px] transition-colors group-hover/doc:pr-7 ${rowCls(active)}`}
        style={{ paddingLeft: `${30 + treeIndent(depth)}px` }}
        onClick={() => nav.openDoc(doc.id)}
        onContextMenu={(e) => menus.openDocMenuAt(e, doc.id)}
        title={doc.title}
      >
        <FileText
          size={12}
          className={`shrink-0 ${active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}`}
        />
        <span className="min-w-0 flex-1 truncate">{label}</span>
      </button>
      <button
        className="absolute right-1.5 top-1/2 hidden -translate-y-1/2 cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-red-50 hover:text-red-600 group-hover/doc:block dark:hover:bg-red-950/40 dark:hover:text-red-400"
        title={`把「${label}」移入回收站`}
        onClick={() => void docActions.removeDoc(doc)}
      >
        <Trash2 size={12} />
      </button>
      <DocContextMenu ws={ws} doc={doc} cat={doc.category || UNCATEGORIZED} />
    </div>
  );
}
