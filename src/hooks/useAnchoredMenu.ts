"use client";

import { useCallback, useEffect, useLayoutEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";

/** 菜单与光标行之间的呼吸位 */
const GAP = 6;
/** 贴边留白：横向不出编辑列，纵向不贴视口边缘 */
const EDGE = 8;

/**
 * 把一块 fixed 浮层锚在编辑器的某个文档位置上（斜杠菜单与 `[[` 补全共用）。
 *
 * 左缘对齐触发符、顶在光标行下方；下方装不下就翻到行上方；滚动与改窗口尺寸时跟随。
 * 落点连同「它是为哪个位置算的」一起存：换了触发点就说明这份落点已过期，
 * 先藏着别闪 —— 否则菜单会先出现在上一次的位置再跳过去。
 *
 * 浮层自己的 ref 由调用方持有并传进来，而不是从这里返回：
 * 返回值带 ref 会让调用方读 left/top 时变成「渲染期访问 ref」（react-hooks/refs）。
 */
export function useAnchoredMenu(
  /** 锚点在文档中的位置；null 表示菜单关着，不用量 */
  from: number | null,
  viewRef: React.RefObject<EditorView | null>,
  /** 浮层根节点：量宽高用 */
  rootRef: React.RefObject<HTMLElement | null>,
  /** 编辑区的滚动容器：滚动时跟着重算落点 */
  scrollEl: HTMLElement | null,
  /** 首帧还没量到宽度时的兜底值（与菜单的 Tailwind 宽度一致） */
  fallbackWidth: number
) {
  const [pos, setPos] = useState<{ from: number; left: number; top: number } | null>(null);

  const place = useCallback(
    (at: number) => {
      const view = viewRef.current;
      const el = rootRef.current;
      if (!view || !el) return;
      const c = view.coordsAtPos(at);
      if (!c) return;
      const w = el.offsetWidth || fallbackWidth;
      const h = el.offsetHeight || 0;
      // 横向不许溢出编辑列，超了贴边（同浮动工具条）
      const col = view.dom.getBoundingClientRect();
      const min = col.left + EDGE;
      const max = Math.max(min, col.right - w - EDGE);
      const below = c.bottom + GAP;
      const flip = below + h > window.innerHeight - EDGE;
      setPos({
        from: at,
        left: Math.round(Math.min(Math.max(c.left, min), max)),
        top: Math.round(flip ? Math.max(EDGE, c.top - GAP - h) : below),
      });
    },
    [viewRef, rootRef, fallbackWidth]
  );

  // 布局副作用在绘制前跑完：菜单不会先闪在旧落点再跳到光标下
  useLayoutEffect(() => {
    if (from !== null) place(from);
  }, [from, place]);

  // rAF 合帧，别让每个 scroll 事件都触发一次量算
  useEffect(() => {
    if (from === null) return;
    let raf = 0;
    const onMove = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        place(from);
      });
    };
    scrollEl?.addEventListener("scroll", onMove, { passive: true });
    window.addEventListener("resize", onMove);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      scrollEl?.removeEventListener("scroll", onMove);
      window.removeEventListener("resize", onMove);
    };
  }, [from, scrollEl, place]);

  return {
    left: pos?.left ?? 0,
    top: pos?.top ?? 0,
    /** 量到这一个锚点的落点之前先藏着，避免第一帧闪在 (0,0) 或上一次的位置 */
    visible: from !== null && pos?.from === from,
  };
}
