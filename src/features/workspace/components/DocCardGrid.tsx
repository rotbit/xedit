"use client";

import { useSyncExternalStore } from "react";
import { MoreHorizontal } from "lucide-react";
import { UNCATEGORIZED } from "../constants";
import { catColorOf } from "../lib/catTree";
import { formatTime } from "../lib/docSource";
import { DocContextMenu } from "./DocContextMenu";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** 卡片入场动画的最大延迟，避免长列表末尾等待过久 */
const MAX_STAGGER_MS = 320;

/** 瀑布流列数按视口分档；卡片高度不一时列内自然紧排 */
const MQ_3COL = "(min-width: 1600px)";
const MQ_2COL = "(min-width: 640px)";

function subscribeCols(cb: () => void) {
  const mqls = [MQ_3COL, MQ_2COL].map((q) => window.matchMedia(q));
  mqls.forEach((m) => m.addEventListener("change", cb));
  return () => mqls.forEach((m) => m.removeEventListener("change", cb));
}

function readCols(): number {
  if (window.matchMedia(MQ_3COL).matches) return 3;
  if (window.matchMedia(MQ_2COL).matches) return 2;
  return 1;
}

/** 工作台在 hydration 之后才渲染，服务端快照只是占位 */
const useGridCols = () => useSyncExternalStore(subscribeCols, readCols, () => 2);

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

/** 单张卡片：标题当主角，分类色圆点 + 底部元信息行。回收站沿用同一套卡片，只换底部操作 */
function DocCard({ ws, doc, index }: { ws: Workspace; doc: DocMeta; index: number }) {
  const { nav, menus, drag } = ws;
  const { isTrash } = nav;
  const cat = doc.category || UNCATEGORIZED;
  return (
    <div
      className={`rise group relative cursor-pointer rounded-xl bg-[var(--panel)] p-5 shadow-[0_1px_3px_rgba(0,0,0,0.04)] ring-1 ring-black/[0.05] transition-all hover:shadow-[0_10px_28px_-12px_rgba(0,0,0,0.18)] hover:ring-black/[0.09] dark:ring-white/10 dark:hover:ring-white/20 ${
        drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""
      }`}
      style={{ animationDelay: `${Math.min(index * 40, MAX_STAGGER_MS)}ms` }}
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
      {/* 摘要不占固定高度：内容短的卡片自然变矮，瀑布流才有紧凑效果 */}
      <p
        className={`mt-1.5 line-clamp-4 text-[12.5px] leading-5 ${
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
}

/**
 * 卡片视图（瀑布流）：按索引轮转分列，阅读顺序保持行优先的直觉；
 * 各列独立纵向排布，高矮不一的卡片彼此紧贴，不再为对齐拉出大片空白。
 */
export function DocCardGrid({ ws }: { ws: Workspace }) {
  const cols = useGridCols();
  const columns: { doc: DocMeta; index: number }[][] = Array.from({ length: cols }, () => []);
  ws.filtered.forEach((doc, index) => columns[index % cols].push({ doc, index }));

  return (
    <div className="mt-4 flex items-start gap-4">
      {columns.map((column, ci) => (
        <div key={ci} className="flex min-w-0 flex-1 flex-col gap-4">
          {column.map(({ doc, index }) => (
            <DocCard key={doc.id} ws={ws} doc={doc} index={index} />
          ))}
        </div>
      ))}
    </div>
  );
}
