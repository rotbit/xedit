"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EditorState, Compartment, type Text } from "@codemirror/state";
import { EditorView } from "@codemirror/view";
import { reportScrollLine, scrollLineIntoView } from "@/lib/editorScroll";
import { useThrottledCallback } from "@/hooks/useThrottledCallback";
import { runFormatCommand } from "@/lib/editorCommands";
import type { EditorHandle, SelectionInfo } from "@/lib/editorTypes";
import { createEditorExtensions, editorModeExtension } from "@/lib/editorExtensions";
import { preloadClipboardConverter } from "@/lib/editorClipboard";
import type { SlashState } from "@/lib/slashMenu";
import { SlashMenu } from "./SlashMenu";

interface Props {
  /** 文档切换时变化，触发编辑器内容重置 */
  docKey: string;
  initialContent: string;
  /** 即时渲染模式（类 Obsidian）：编辑区内直接呈现排版 */
  live?: boolean;
  /**
   * 外层滚动容器。首页文章视图把标题区与正文放进同一个滚动容器一起滚，
   * 此时 .cm-scroller 不再滚动（overflow:visible），滚动读写都要改指向它。
   */
  scrollParent?: HTMLElement | null;
  onChange: (content: string) => void;
  onScrollLine?: (line: number, ratio: number) => void;
  /** 选区/焦点变化时上报（编辑器卸载时上报 null），供浮动工具条订阅 */
  onSelectionChange?: (info: SelectionInfo | null) => void;
}

/** onChange 的节流窗口：合并一次连打的多次变更。太长会让「保存中…」迟迟不亮，
    120ms 大约是一次快速击键的间隔，既压掉了重渲染又察觉不到延迟 */
const CHANGE_THROTTLE_MS = 120;

export const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(
  {
    docKey,
    initialContent,
    live = false,
    scrollParent,
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
  const liveCompartment = useRef(new Compartment());
  const liveRef = useRef(live);
  onChangeRef.current = onChange;
  onScrollLineRef.current = onScrollLine;
  onSelectionChangeRef.current = onSelectionChange;
  scrollParentRef.current = scrollParent ?? null;
  liveRef.current = live;

  // 斜杠菜单状态走订阅下发：真相在 CodeMirror 的 StateField 里，这里只把变化转给
  // <SlashMenu> 自己 setState。若改成 props 往上抬，每敲一个过滤字符都要重渲染整篇文章视图
  const slashCbRef = useRef<((s: SlashState | null) => void) | null>(null);
  const slashStateRef = useRef<SlashState | null>(null);
  const emitSlash = useRef((s: SlashState | null) => {
    slashStateRef.current = s;
    slashCbRef.current?.(s);
  }).current;
  const subscribeSlash = useCallback(
    (cb: (s: SlashState | null) => void) => {
      slashCbRef.current = cb;
      cb(slashStateRef.current);
      return () => {
        slashCbRef.current = null;
      };
    },
    []
  );

  // 每次击键都把整篇正文推上去 = 整个文章视图跟着重渲染，合并成 ~120ms 一次
  // Text 是不可变快照：只在节流窗口结束时转换全文，避免每个按键分配大字符串。
  const pushChange = useThrottledCallback<Text>(
    (doc) => onChangeRef.current(doc.toString()),
    CHANGE_THROTTLE_MS
  );

  // ⌘S 走的是 window 事件，保存方读的是 store：先把压着的那一次内容吐出去再让它读。
  // 编辑器自己发的那一次在 keymap 里已同步 flush 过，这里兜的是别处发来的保存请求
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
        onChange: pushChange,
        flush: pushChange.flush,
        onSelectionChange: (info) => onSelectionChangeRef.current?.(info),
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
      // 切文档/卸载前先把节流窗口里压着的最后一次编辑交出去
      pushChange.flush();
      view.destroy();
      viewRef.current = null;
      // 切文档/卸载后旧选区已失效，明确清一次，别让工具条/斜杠菜单挂在空中
      onSelectionChangeRef.current?.(null);
      emitSlash(null);
    };
    // docKey 变化时整体重建编辑器（切换文档）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // 切换视图模式时热插拔即时渲染扩展，保留光标与撤销历史
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: liveCompartment.current.reconfigure(editorModeExtension(live)),
    });
  }, [live]);

  // 滚动容器在编辑器外层时，scroll 事件不会经过 CodeMirror，得单独挂一份监听
  useEffect(() => {
    const parent = scrollParent ?? null;
    if (!parent) return;
    const onScroll = () => {
      const view = viewRef.current;
      if (view && onScrollLineRef.current) {
        reportScrollLine(view, parent, onScrollLineRef.current);
      }
    };
    parent.addEventListener("scroll", onScroll, { passive: true });
    return () => parent.removeEventListener("scroll", onScroll);
  }, [scrollParent]);

  useImperativeHandle(ref, () => ({
    flush: () => pushChange.flush(),
    view: () => viewRef.current,
    scrollToLine: (line: number) => {
      const view = viewRef.current;
      if (!view) return;
      const n = Math.min(view.state.doc.lines, Math.max(1, line + 1));
      const pos = view.state.doc.line(n).from;
      view.focus();
      view.dispatch({ selection: { anchor: pos } });
      // 平滑滚动到目标行（rAF 等 CodeMirror 量完几何再取坐标；同步滚动会带预览一起跟过去）
      requestAnimationFrame(() => {
        scrollLineIntoView(view, scrollParentRef.current, line, 12, true);
      });
    },
    scrollLineToTop: (line: number) => {
      const view = viewRef.current;
      if (view) scrollLineIntoView(view, scrollParentRef.current, line, 0, false);
    },
    applyFormat: (cmd, arg) => {
      const view = viewRef.current;
      if (view) runFormatCommand(view, cmd, arg);
    },
  }));

  return (
    <>
      <div ref={containerRef} className="h-full min-h-0" />
      {/* 菜单 portal 到 body，放在这里只是为了拿到 viewRef，不参与布局 */}
      <SlashMenu subscribe={subscribeSlash} viewRef={viewRef} scrollEl={scrollParent ?? null} />
    </>
  );
});
