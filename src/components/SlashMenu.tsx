"use client";

// Notion 式 `/` 斜杠菜单的视觉层：portal 到 body、fixed 定位、跟随滚动。
// 真相全在 CodeMirror 的 StateField 里（见 lib/slashMenu.ts），这里只订阅渲染 ——
// 组件自己 setState，打字时重渲染范围就止步于这块菜单，不会波及整篇文章视图。

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { EditorView } from "@codemirror/view";
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
/** 菜单与光标行之间的呼吸位 */
const GAP = 6;
/** 贴边留白：横向不出编辑列，纵向不贴视口边缘 */
const EDGE = 8;

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
  const [st, setSt] = useState<SlashState | null>(null);
  // 落点连同它是为哪个 `/` 算的一起存：换了 `/` 就说明这份落点已过期，先藏着别闪
  const [pos, setPos] = useState<{ from: number; left: number; top: number } | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => subscribe(setSt), [subscribe]);

  /** 左缘对齐 `/`、顶在光标行下方；下方装不下就翻到行上方 */
  const place = useCallback((from: number) => {
    const view = viewRef.current;
    const el = rootRef.current;
    if (!view || !el) return;
    const c = view.coordsAtPos(from);
    if (!c) return;
    const w = el.offsetWidth || MENU_W;
    const h = el.offsetHeight || 0;
    // 横向不许溢出编辑列，超了贴边（同浮动工具条）
    const col = view.dom.getBoundingClientRect();
    const min = col.left + EDGE;
    const max = Math.max(min, col.right - w - EDGE);
    const below = c.bottom + GAP;
    const flip = below + h > window.innerHeight - EDGE;
    setPos({
      from,
      left: Math.round(Math.min(Math.max(c.left, min), max)),
      top: Math.round(flip ? Math.max(EDGE, c.top - GAP - h) : below),
    });
  }, [viewRef]);

  // 布局副作用在绘制前跑完：菜单不会先闪在旧落点再跳到光标下
  useLayoutEffect(() => {
    if (st) place(st.from);
  }, [st, place]);

  // 滚动/改窗口尺寸时跟随；rAF 合帧，别让每个 scroll 事件都触发一次量算
  useEffect(() => {
    if (!st) return;
    let raf = 0;
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        place(st.from);
      });
    };
    scrollEl?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollEl?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [st, scrollEl, place]);

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
        left: pos?.left ?? 0,
        top: pos?.top ?? 0,
        maxHeight: MAX_ROWS * ROW_H + 8,
        // 量到这一个 `/` 的落点之前先藏着，避免第一帧闪在 (0,0) 或上一次的位置
        visibility: pos?.from === st.from ? "visible" : "hidden",
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
              key={item.cmd}
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
                if (v) runSlashItem(v, item, st.from, to);
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
