"use client";

// Notion 式 `/` 斜杠菜单的视觉层：portal 到 body、fixed 定位、跟随滚动。
// 真相全在 CodeMirror 的 StateField 里（见 lib/slashMenu.ts），这里只订阅渲染 ——
// 组件自己 setState，打字时重渲染范围就止步于这块菜单，不会波及整篇文章视图。
// 定位（对齐触发符、上下翻面、跟随滚动）与 `[[` 补全共用 useAnchoredMenu。

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "@codemirror/view";
import { useAnchoredMenu } from "@/hooks/useAnchoredMenu";
import { toast } from "@/components/Toast";
import {
  filterSlashItems,
  highlightSlashIndex,
  runSlashItem,
  type SlashState,
} from "@/lib/slashMenu";

/** 菜单宽度（与 w-60 一致）、单行高度、最多显示的行数：超出内部滚动 */
const MENU_W = 240;
const ROW_H = 32;
const MAX_ROWS = 8;

export function SlashMenu({
  subscribe,
  viewRef,
  scrollEl,
}: {
  /** 订阅编辑器下发的菜单状态；返回退订函数 */
  subscribe: (cb: (s: SlashState | null) => void) => () => void;
  viewRef: React.RefObject<EditorView | null>;
  /** 编辑区的滚动容器：滚动时跟着重算落点 */
  scrollEl: HTMLElement | null;
}) {
  const rootRef = useRef<HTMLDivElement>(null);
  const [st, setSt] = useState<SlashState | null>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribe(setSt), [subscribe]);

  const anchor = useAnchoredMenu(st?.from ?? null, viewRef, rootRef, scrollEl, MENU_W);

  // 键盘上下移动高亮时把它带进可视区（列表最多露 8 行）
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "nearest" });
  }, [st?.index]);

  if (!st) return null;
  const items = filterSlashItems(st.query);
  /** `/query` 的整段范围：选中后先删掉它 */
  const to = st.from + 1 + st.query.length;

  return createPortal(
    <div
      ref={rootRef}
      className="slash-menu float-pop fixed z-[70] w-60 overflow-y-auto rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] p-1"
      style={{
        left: anchor.left,
        top: anchor.top,
        maxHeight: MAX_ROWS * ROW_H + 8,
        visibility: anchor.visible ? "visible" : "hidden",
      }}
      // 按下不夺焦：编辑器保持焦点，光标与 `/` 都还在原处（同浮动工具条）
      onMouseDown={(e) => e.preventDefault()}
    >
      {items.length === 0 ? (
        <div className="px-2 py-2 text-[13px] text-[var(--ink-faint)]">没有匹配的块</div>
      ) : (
        items.map((item, i) => {
          const Icon = item.icon;
          const active = i === st.index;
          return (
            <button
              key={item.id}
              ref={active ? activeRef : undefined}
              className={`flex h-8 w-full cursor-pointer items-center gap-2.5 rounded-md px-2 text-left text-[13px] text-[var(--ink)] ${
                active ? "bg-[var(--accent-wash)]" : ""
              }`}
              onMouseEnter={() => {
                const v = viewRef.current;
                if (v) highlightSlashIndex(v, i);
              }}
              onClick={() => {
                const v = viewRef.current;
                // `/视频` 会拉起上传，提示由组件层的 toast 负责弹
                if (v) runSlashItem(v, item, st.from, to, toast);
              }}
            >
              <Icon size={16} strokeWidth={1.75} className="shrink-0 text-[var(--ink-soft)]" />
              <span className="min-w-0 flex-1 truncate">{item.label}</span>
              <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{item.hint}</span>
            </button>
          );
        })
      )}
    </div>,
    document.body
  );
}
