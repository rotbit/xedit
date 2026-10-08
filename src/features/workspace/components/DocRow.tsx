"use client";

import { FileText, Trash2 } from "lucide-react";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { useT } from "@/i18n/useT";
import { DROP_LINE_BOTTOM, DROP_LINE_TOP, rowCls, rowInset, rowPadLeft } from "../constants";
import { iconTone } from "./NavRow";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** 侧栏分类树里的文章行；同时是排序落点（拖到上/下半区插到前/后） */
export function DocRow({ ws, doc, depth }: { ws: Workspace; doc: DocMeta; depth: number }) {
  const { nav, menus, drag, docActions } = ws;
  const active = nav.readingId === doc.id;
  const t = useT();
  const label = doc.title || t(UNTITLED_DOC);
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
        className={`flex cursor-pointer items-center gap-2 rounded-md py-1.5 pr-2 text-left text-[12.5px] transition-colors group-hover/doc:pr-7 ${rowCls(active)}`}
        // 外边距缩进同 CategoryRow；14px 图标位 + gap-2，与同层文件夹行的图标、文字左缘对齐
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
