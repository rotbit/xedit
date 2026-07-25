"use client";

import { MoreHorizontal } from "lucide-react";
import { UNCATEGORIZED } from "../constants";
import { catColorOf } from "../lib/catTree";
import { formatTime } from "../lib/docSource";
import { DocContextMenu } from "./DocContextMenu";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** 卡片入场动画的最大延迟，避免长列表末尾等待过久 */
const MAX_STAGGER_MS = 320;

/** 回收站卡片底部的恢复 / 彻底删除 */
function TrashActions({ ws, doc }: { ws: Workspace; doc: DocMeta }) {
  const { docActions } = ws;
  return (
    <div className="mt-3 flex gap-2 border-t border-[var(--hairline-soft)] pt-3">
      <button
        className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-2.5 py-1 text-[12px] text-[var(--ink)] hover:bg-[var(--paper)]"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.restoreDoc(doc);
        }}
      >
        恢复
      </button>
      <button
        className="cursor-pointer rounded-md px-2.5 py-1 text-[12px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.hardDeleteDoc(doc);
        }}
      >
        彻底删除
      </button>
    </div>
  );
}

/** 卡片视图：标题当主角，分类色圆点 + 底部元信息行。回收站沿用同一套卡片，只换底部操作 */
export function DocCardGrid({ ws }: { ws: Workspace }) {
  const { nav, menus, drag, filtered } = ws;
  const { isTrash } = nav;

  return (
    <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
      {filtered.map((doc, i) => {
        const cat = doc.category || UNCATEGORIZED;
        return (
          <div
            key={doc.id}
            className={`rise group relative cursor-pointer rounded-xl bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] transition-all hover:shadow-[0_10px_28px_-12px_rgba(0,0,0,0.18)] hover:ring-black/[0.09] dark:ring-white/10 dark:hover:ring-white/20 ${
              drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""
            }`}
            style={{ animationDelay: `${Math.min(i * 40, MAX_STAGGER_MS)}ms` }}
            onClick={() => {
              if (!isTrash) nav.openDoc(doc.id);
            }}
            onContextMenu={isTrash ? undefined : (e) => menus.openDocMenuAt(e, doc.id)}
            {...(isTrash ? {} : drag.dragSrcProps({ kind: "doc", id: doc.id }))}
          >
            <span className="absolute bottom-5 left-0 top-5 w-[3px] rounded-r-full bg-transparent transition-colors group-hover:bg-[var(--accent)]" />
            <p className="truncate pr-8 text-[15.5px] font-semibold leading-6 text-[var(--ink)] [font-family:var(--serif)]">
              {doc.title || "未命名文章"}
            </p>
            <p
              className={`mt-1.5 line-clamp-2 h-10 text-[12.5px] leading-5 ${
                doc.excerpt ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"
              }`}
            >
              {doc.excerpt || "尚无内容"}
            </p>
            <div className="mt-3 flex items-center gap-2 text-[11.5px] text-[var(--ink-faint)]">
              <span className="flex min-w-0 items-center gap-1.5">
                <span
                  className="h-[7px] w-[7px] shrink-0 rounded-full"
                  style={{ background: catColorOf(cat) }}
                />
                <span className="truncate">{cat}</span>
              </span>
              <span className="shrink-0">·</span>
              <span className="shrink-0">{formatTime(doc.updatedAt)}</span>
              {typeof doc.chars === "number" && doc.chars > 0 ? (
                <>
                  <span className="shrink-0">·</span>
                  <span className="shrink-0">{doc.chars.toLocaleString()} 字</span>
                </>
              ) : null}
            </div>
            {isTrash ? (
              <TrashActions ws={ws} doc={doc} />
            ) : (
              <button
                className={`absolute right-3 top-3.5 cursor-pointer rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)] [@media(hover:none)]:visible ${
                  menus.docMenu?.id === doc.id ? "visible" : "invisible group-hover:visible"
                }`}
                onClick={(e) => menus.toggleDocMenuAt(e, doc.id)}
              >
                <MoreHorizontal size={15} />
              </button>
            )}
            <DocContextMenu ws={ws} doc={doc} cat={cat} />
          </div>
        );
      })}
    </div>
  );
}
