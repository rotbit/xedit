"use client";

/**
 * 鼠标停在正文标注上就浮出那条意见：不必点、不必去右栏里找。
 *
 * 进出都带一点延迟——
 * - 进：扫过一串标注时别一路闪卡片，停稳了才出；
 * - 出：从那几个字挪到卡片上要穿过一道空隙，给够时间让鼠标走进卡片（进了卡片就一直留着，好点采纳）。
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { REVIEW_ID_ATTR } from "./editorMarks";

const SHOW_DELAY = 200;
const HIDE_DELAY = 260;

export function useReviewHover(view: EditorView | null) {
  const [hoverId, setHoverId] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const later = useCallback((fn: () => void, ms: number) => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(fn, ms);
  }, []);
  const hold = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  }, []);
  const release = useCallback(() => later(() => setHoverId(null), HIDE_DELAY), [later]);
  /** 立刻收起（点了采纳 / 忽略之后，或点到别处） */
  const dismiss = useCallback(() => {
    hold();
    setHoverId(null);
  }, [hold]);

  useEffect(() => {
    if (!view) return;
    const dom = view.contentDOM;
    const idAt = (t: EventTarget | null) =>
      (t as HTMLElement | null)?.closest?.(`[${REVIEW_ID_ATTR}]`)?.getAttribute(REVIEW_ID_ATTR) ??
      null;
    const onOver = (e: MouseEvent) => {
      const id = idAt(e.target);
      if (id) later(() => setHoverId(id), SHOW_DELAY);
    };
    const onOut = (e: MouseEvent) => {
      // 在同一条标注里面挪（跨了几个子 span）不算离开
      const from = idAt(e.target);
      if (from && from !== idAt(e.relatedTarget)) release();
    };
    dom.addEventListener("mouseover", onOver);
    dom.addEventListener("mouseout", onOut);
    return () => {
      dom.removeEventListener("mouseover", onOver);
      dom.removeEventListener("mouseout", onOut);
    };
  }, [view, later, release]);

  useEffect(() => () => hold(), [hold]);

  return { hoverId, hold, release, dismiss };
}
