"use client";

import { useCallback, useRef } from "react";
import type { RefObject } from "react";
import type { EditorHandle } from "@/components/MarkdownEditor";
import { useStore } from "@/store/useStore";

interface Anchor {
  line: number;
  top: number;
}

function collectAnchors(container: HTMLElement): Anchor[] {
  const containerTop = container.getBoundingClientRect().top;
  const anchors: Anchor[] = [];
  for (const el of Array.from(container.querySelectorAll<HTMLElement>("#nice [data-line]"))) {
    const line = Number(el.dataset.line);
    if (Number.isNaN(line)) continue;
    anchors.push({
      line,
      top: el.getBoundingClientRect().top - containerTop + container.scrollTop,
    });
  }
  anchors.sort((a, b) => a.line - b.line);
  return anchors;
}

/**
 * 编辑器与预览的双向同步滚动。
 * 以最近获得指针的窗格为“主动方”，避免互相触发形成回环。
 */
export function useSyncScroll(
  editorRef: RefObject<EditorHandle | null>,
  previewRef: RefObject<HTMLDivElement | null>
) {
  const activePane = useRef<"editor" | "preview" | null>(null);

  const setActive = useCallback((pane: "editor" | "preview") => {
    activePane.current = pane;
  }, []);

  /** 编辑器滚动 → 预览跟随 */
  const onEditorScrollLine = useCallback(
    (line: number, ratio: number) => {
      if (!useStore.getState().syncScroll) return;
      if (activePane.current !== "editor") return;
      const container = previewRef.current;
      if (!container) return;

      const anchors = collectAnchors(container);
      if (anchors.length === 0) return;
      const target = line + ratio;

      let prev = anchors[0];
      let next: Anchor | null = null;
      for (const a of anchors) {
        if (a.line <= target) prev = a;
        else {
          next = a;
          break;
        }
      }
      let top: number;
      if (next && next.line !== prev.line) {
        const frac = (target - prev.line) / (next.line - prev.line);
        top = prev.top + (next.top - prev.top) * frac;
      } else {
        top = prev.top;
      }
      container.scrollTo({ top: Math.max(0, top - 24) });
    },
    [previewRef]
  );

  /** 预览滚动 → 编辑器跟随 */
  const onPreviewScroll = useCallback(() => {
    if (!useStore.getState().syncScroll) return;
    if (activePane.current !== "preview") return;
    const container = previewRef.current;
    const view = editorRef.current?.view();
    if (!container || !view) return;

    const anchors = collectAnchors(container);
    if (anchors.length === 0) return;
    const scrollTop = container.scrollTop + 24;

    let prev = anchors[0];
    let next: Anchor | null = null;
    for (const a of anchors) {
      if (a.top <= scrollTop) prev = a;
      else {
        next = a;
        break;
      }
    }
    let targetLine = prev.line;
    if (next && next.top !== prev.top) {
      const frac = (scrollTop - prev.top) / (next.top - prev.top);
      targetLine = prev.line + (next.line - prev.line) * frac;
    }

    const doc = view.state.doc;
    const lineNumber = Math.min(doc.lines, Math.max(1, Math.floor(targetLine) + 1));
    const pos = doc.line(lineNumber).from;
    const block = view.lineBlockAt(pos);
    view.scrollDOM.scrollTo({ top: Math.max(0, block.top) });
  }, [editorRef, previewRef]);

  return { setActive, onEditorScrollLine, onPreviewScroll };
}
