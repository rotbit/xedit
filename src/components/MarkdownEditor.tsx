"use client";

import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { EditorState, Compartment, type Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { reportScrollLine, scrollLineIntoView, settleScrollToLine } from "@/lib/editor/scroll";
import { useThrottledCallback } from "@/hooks/useThrottledCallback";
import { useMenuChannel } from "@/hooks/useMenuChannel";
import { runFormatCommand } from "@/lib/editor/commands";
import { toast } from "@/components/Toast";
import type { EditorHandle, SelectionInfo } from "@/lib/editor/types";
import { createEditorExtensions, editorModeExtension } from "@/lib/editor/extensions";
import { preloadClipboardConverter } from "@/lib/editor/clipboard";
import type { SlashState } from "@/lib/slashMenu";
import type { WikiMenuState } from "@/lib/wikiLink/menu";
import type { DocMeta } from "@/features/workspace/types";
import { SlashMenu } from "./SlashMenu";
import { WikiLinkMenu } from "./WikiLinkMenu";

interface Props {
  /** Changes on document switch, triggering an editor content reset */
  docKey: string;
  initialContent: string;
  /** Live preview mode (Obsidian-like): formatting renders directly in the editor */
  live?: boolean;
  /**
   * Outer scroll container. The home article view scrolls the title area and body together in one container,
   * so .cm-scroller no longer scrolls (overflow:visible) and scroll reads/writes must target this instead.
   */
  scrollParent?: HTMLElement | null;
  /** All articles: candidate source for title completion when typing `[[` */
  docs?: DocMeta[];
  onChange: (content: string) => void;
  onScrollLine?: (line: number, ratio: number) => void;
  /** Reports selection/focus changes (null when the editor unmounts) for the floating toolbar to subscribe to */
  onSelectionChange?: (info: SelectionInfo | null) => void;
}

/** Throttle window for onChange: merges a burst of typing into one change. Too long and 「保存中…」 (Saving…) lights up late;
    120ms is roughly the gap between fast keystrokes, cutting re-renders without noticeable lag */
const CHANGE_THROTTLE_MS = 120;

export const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(
  {
    docKey,
    initialContent,
    live = false,
    scrollParent,
    docs,
    onChange,
    onScrollLine,
    onSelectionChange,
  },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onScrollLineRef = useRef(onScrollLine);
  const onSelectionChangeRef = useRef(onSelectionChange);
  const scrollParentRef = useRef<HTMLElement | null>(null);
  /** Cancel function for the jump currently settling (see settleScrollToLine) */
  const settleScrollRef = useRef<(() => void) | null>(null);
  const docsRef = useRef<DocMeta[] | undefined>(undefined);
  const liveCompartment = useRef(new Compartment());
  const liveRef = useRef(live);
  onChangeRef.current = onChange;
  onScrollLineRef.current = onScrollLine;
  onSelectionChangeRef.current = onSelectionChange;
  scrollParentRef.current = scrollParent ?? null;
  docsRef.current = docs;
  liveRef.current = live;

  // State for the two popup menus is pushed via subscription: the truth lives in CodeMirror's StateField, and this only forwards changes to
  // the menu components' own setState. Lifting it into props would re-render the whole article view on every filter character typed
  const slash = useMenuChannel<SlashState>();
  const wiki = useMenuChannel<WikiMenuState>();
  const emitSlash = slash.emit;
  const emitWiki = wiki.emit;

  // Pushing the whole body up on every keystroke = re-rendering the whole article view, so merge into one ~120ms update
  // Text is an immutable snapshot: convert the full text only when the throttle window ends, avoiding a large string allocation per keystroke.
  const pushChange = useThrottledCallback<Text>(
    (doc) => onChangeRef.current(doc.toString()),
    CHANGE_THROTTLE_MS
  );

  // ⌘S goes through a window event and the saver reads the store: flush the pending change first, then let it read.
  // The editor's own save request already flushed synchronously in the keymap; this covers save requests from elsewhere
  useEffect(() => {
    const onSaveNow = () => pushChange.flush();
    window.addEventListener("xedit:save-now", onSaveNow);
    return () => window.removeEventListener("xedit:save-now", onSaveNow);
  }, [pushChange]);

  useEffect(() => {
    if (!containerRef.current) return;
    void preloadClipboardConverter();

    const state = EditorState.create({
      doc: initialContent,
      extensions: createEditorExtensions({
        live: liveRef.current,
        liveCompartment: liveCompartment.current,
        onSlashChange: emitSlash,
        onWikiMenuChange: emitWiki,
        getDocs: () => docsRef.current ?? [],
        // Toasts for the command layer (image/video upload, save to library) are shown from here; the lib never touches UI
        notify: toast,
        onChange: pushChange,
        flush: pushChange.flush,
        onSelectionChange: (info) => onSelectionChangeRef.current?.(info),
        // CodeMirror already listens for scroll on every ancestor container, so this receives both outer and built-in scroller events.
        onScroll: (view) => {
          if (onScrollLineRef.current) {
            reportScrollLine(view, scrollParentRef.current, onScrollLineRef.current);
          }
        },
      }),
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    view.focus();

    return () => {
      // Before switching documents/unmounting, hand over the last edit still held in the throttle window
      pushChange.flush();
      // Stop any settling jump before the editor is torn down, so it doesn't measure a destroyed view
      settleScrollRef.current?.();
      settleScrollRef.current = null;
      view.destroy();
      viewRef.current = null;
      // After switching documents/unmounting the old selection is invalid; clear it explicitly so the toolbar/slash menu isn't left floating
      onSelectionChangeRef.current?.(null);
      emitSlash(null);
      emitWiki(null);
    };
    // Rebuild the editor entirely when docKey changes (document switch)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // Hot-swap the live preview extension when switching view modes, keeping the cursor and undo history
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: liveCompartment.current.reconfigure(editorModeExtension(live)),
    });
  }, [live]);

  useImperativeHandle(ref, () => ({
    flush: () => pushChange.flush(),
    view: () => viewRef.current,
    scrollToLine: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const n = Math.min(view.state.doc.lines, Math.max(1, line + 1));
      const pos = view.state.doc.line(n).from;
      settleScrollRef.current?.(); // When outline items are clicked in quick succession, the previous jump yields immediately
      settleScrollRef.current = null;
      view.focus();
      view.dispatch({ selection: { anchor: pos } });
      // Smooth-scroll to the target line (rAF waits for CodeMirror to measure geometry before reading coordinates; synced scrolling brings the preview along).
      // Distant lines only have estimated heights, so the target must be corrected while scrolling; settleScrollToLine converges on it
      requestAnimationFrame(() => {
        if (viewRef.current !== view) return; // The document was switched within this frame
        settleScrollRef.current?.();
        settleScrollRef.current = settleScrollToLine(view, scrollParentRef.current, line, 12);
      });
    },
    scrollLineToTop: (line: number) => {
      const view = viewRef.current;
      if (view) scrollLineIntoView(view, scrollParentRef.current, line, 0, false);
    },
    applyFormat: (cmd, arg) => {
      const view = viewRef.current;
      if (view) runFormatCommand(view, cmd, toast, arg);
    },
  }));

  return (
    <>
      <div ref={containerRef} className="h-full min-h-0" />
      {/* Menus are portaled to body; placed here only to get viewRef, not part of layout */}
      <SlashMenu subscribe={slash.subscribe} viewRef={viewRef} scrollEl={scrollParent ?? null} />
      <WikiLinkMenu
        subscribe={wiki.subscribe}
        viewRef={viewRef}
        scrollEl={scrollParent ?? null}
        docs={docs}
      />
    </>
  );
});
