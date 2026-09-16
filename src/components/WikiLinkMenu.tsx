"use client";

// 输入 `[[` 时的文章标题补全浮层：portal 到 body、fixed 定位、跟随滚动。
// 真相全在 CodeMirror 的 StateField 里（见 lib/wikiLink/menu.ts），这里只订阅渲染 ——
// 组件自己 setState，打字时重渲染范围就止步于这块菜单，不会波及整篇文章视图。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Plus } from "lucide-react";
import type { EditorView } from "@codemirror/view";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import {
  activeWikiIndex,
  filterWikiCandidates,
  highlightWikiIndex,
  pickWikiItem,
  wikiQueryEnd,
  type WikiMenuState,
} from "@/lib/wikiLink/menu";
import { UNCATEGORIZED } from "@/features/workspace/constants";
import type { DocMeta } from "@/features/workspace/types";

/** 菜单宽度（与 w-72 一致）、单行高度、最多显示的行数：超出内部滚动 */
const MENU_W = 288;
const ROW_H = 32;
const MAX_ROWS = 8;

const NO_DOCS: DocMeta[] = [];

export function WikiLinkMenu({
  subscribe,
  viewRef,
  scrollEl,
  docs,
}: {
  /** 订阅编辑器下发的菜单状态；返回退订函数 */
  subscribe: (cb: (s: WikiMenuState | null) => void) => () => void;
  viewRef: React.RefObject<EditorView | null>;
  /** 编辑区的滚动容器：滚动时跟着重算落点 */
  scrollEl: HTMLElement | null;
  /** 候选文章；与编辑器扩展里的 getDocs() 是同一份，只是这边用于渲染 */
  docs?: DocMeta[];
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<WikiMenuState | null>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribe(setSt), [subscribe]);

  const anchor = useAnchoredMenu(st?.from ?? null, viewRef, rootRef, scrollEl, MENU_W);

  // 键盘上下移动高亮时把它带进可视区（列表最多露 8 行）
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [st?.index]);

  if (!st) return null;
  const items = filterWikiCandidates(docs ?? NO_DOCS, st.query);
  // 一篇都没匹配上、也没有「新建」可提（过滤词为空的空文库）：不挂空壳在正文上碍事
  if (items.length === 0) return null;
  const active = activeWikiIndex(st.index, items.length);
  const to = wikiQueryEnd(st);

  return createPortal(
    <div
      ref={rootRef}
      className="slash-menu float-pop fixed z-[70] w-72 overflow-y-auto rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] p-1"
      style={{
        left: anchor.left,
        top: anchor.top,
        maxHeight: MAX_ROWS * ROW_H + 8,
        visibility: anchor.visible ? "visible" : "hidden",
      }}
      // 按下不夺焦：编辑器保持焦点，光标与 `[[` 都还在原处（同浮动工具条）
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.map((item, i) => {
        const on = i === active;
        const create = item.kind === "create";
        return (
          <button
            key={create ? "__create__" : item.doc.id}
            ref={on ? activeRef : undefined}
            className={`flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-[var(--ink)] ${
              on ? "bg-[var(--accent-wash)]" : ""
            }`}
            onMouseEnter={() => {
              const v = viewRef.current;
              if (v) highlightWikiIndex(v, i);
            }}
            onClick={() => {
              const v = viewRef.current;
              if (v) pickWikiItem(v, item, st.from, to);
            }}
          >
            {create ? (
              <>
                <Plus size={15} strokeWidth={1.75} className="shrink-0 text-[var(--accent)]" />
                <span className="min-w-0 flex-1 truncate">新建「{item.title}」</span>
              </>
            ) : (
              <>
                <FileText size={15} strokeWidth={1.75} className="shrink-0 text-[var(--ink-soft)]" />
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                <span className="max-w-[7rem] shrink-0 truncate text-[11px] text-[var(--ink-faint)]">
                  {item.doc.category || UNCATEGORIZED}
                </span>
              </>
            )}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
