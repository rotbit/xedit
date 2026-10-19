"use client";

import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { EditorHandle } from "@/lib/editor/types";
import { useStore } from "@/store/useStore";

type EditorViewMode = "edit" | "split" | "read";
// Matches ArticleReader's duration-300 width transition.
const PREVIEW_CLOSE_MS = 300;

/** Manages mutually exclusive view modes; preview unmount is delayed separately to keep the collapse animation. The component always keeps the editor instance. */
export function useEditorViewMode(
  editorRef: RefObject<EditorHandle | null>,
  scrollEl: HTMLElement | null,
  /** Fires when leaving the normal edit view (into split / reading): things that only make sense in the edit view (AI review) close along with it */
  onLeaveEdit?: () => void
) {
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

  // Reading view hides the editor; on exit, focus and scroll position are restored once the layout is back.
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
    if (mode === "edit" && next !== "edit") onLeaveEdit?.();
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
  }, [mode, editorRef, scrollEl, cancelPreviewClose, onLeaveEdit]);

  const toggleSplit = useCallback(() => changeMode(mode === "split" ? "edit" : "split"), [mode, changeMode]);
  /** Return only, never toggle: AI review only works in the normal edit view, so back out of split / reading before opening it */
  const openEdit = useCallback(() => {
    if (mode !== "edit") changeMode("edit");
  }, [mode, changeMode]);
  const toggleReading = useCallback(() => changeMode(mode === "read" ? "edit" : "read"), [mode, changeMode]);

  // Handle view shortcuts in the capture phase, ahead of other listeners on the page.
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

  return { mode, previewMounted, toggleSplit, openEdit, toggleReading };
}
