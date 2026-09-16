"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EditorHandle } from "@/lib/editor/types";
import { useStore } from "@/store/useStore";

type EditorViewMode = "edit" | "split" | "read";
// 与 ArticleReader 的宽度过渡 duration-300 保持一致。
const PREVIEW_CLOSE_MS = 300;

/** 管理互斥的显示模式；预览卸载单独延迟，以保留收起动画。编辑器实例始终由组件保留。 */
export function useEditorViewMode(editorRef: RefObject<EditorHandle | null>, scrollEl: HTMLElement | null) {
  const [mode, setMode] = useState<EditorViewMode>("edit");
  const [previewMounted, setPreviewMounted] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const readingScroll = useRef(0);
  const previousMode = useRef(mode);

  const cancelPreviewClose = useCallback(() => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
  }, []);
  useEffect(() => cancelPreviewClose, [cancelPreviewClose]);

  // 阅读视图隐藏编辑器；退出后在布局恢复时归还焦点及滚动位置。
  useEffect(() => {
    const restore = previousMode.current === "read" && mode !== "read";
    previousMode.current = mode;
    if (!restore) return;
    const frame = requestAnimationFrame(() => {
      editorRef.current?.view()?.focus();
      if (scrollEl) scrollEl.scrollTop = readingScroll.current;
    });
    return () => cancelAnimationFrame(frame);
  }, [mode, editorRef, scrollEl]);

  const changeMode = useCallback((next: EditorViewMode) => {
    cancelPreviewClose();
    if (next === "read") {
      editorRef.current?.flush();
      readingScroll.current = scrollEl?.scrollTop ?? 0;
      editorRef.current?.view()?.contentDOM.blur();
      setPreviewMounted(false);
    } else if (next === "split") {
      setPreviewMounted(true);
    } else if (mode === "split") {
      closeTimer.current = setTimeout(() => {
        setPreviewMounted(false);
        closeTimer.current = null;
      }, PREVIEW_CLOSE_MS);
    }
    setMode(next);
  }, [mode, editorRef, scrollEl, cancelPreviewClose]);

  const toggleSplit = useCallback(() => changeMode(mode === "split" ? "edit" : "split"), [mode, changeMode]);
  const toggleReading = useCallback(() => changeMode(mode === "read" ? "edit" : "read"), [mode, changeMode]);

  // capture 阶段处理视图快捷键，优先于页面内其他监听。
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (!(event.metaKey || event.ctrlKey)) return;
      if (event.key.toLowerCase() === "e") {
        event.preventDefault();
        if (event.shiftKey) toggleReading();
        else toggleSplit();
      } else if (event.key === "/") {
        event.preventDefault();
        const store = useStore.getState();
        store.setSourceMode(!store.sourceMode);
      }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [toggleSplit, toggleReading]);

  return { mode, previewMounted, toggleSplit, toggleReading };
}
