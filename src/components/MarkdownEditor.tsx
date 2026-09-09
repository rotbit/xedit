"use client";

import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EditorState, Compartment, type Text } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting } from "@codemirror/language";
import { searchKeymap } from "@codemirror/search";
import { livePreview } from "@/lib/livePreview";
import { codeHighlight, mdHighlight, sourceHeadingHighlight } from "@/lib/editorHighlight";
import { caretAndActiveLine } from "@/lib/editorCaret";
import { reportScrollLine, scrollLineIntoView } from "@/lib/editorScroll";
import { useThrottledCallback } from "@/hooks/useThrottledCallback";
import { lineSelectionWithoutNewline } from "@/lib/lineSelection";
import { wrapSelection } from "@/lib/editorFormat";
import {
  handleMediaFiles,
  runFormatCommand,
  type FormatCommand,
} from "@/lib/editorCommands";
import { slashMenu, type SlashState } from "@/lib/slashMenu";
import { SlashMenu } from "./SlashMenu";
import type TurndownService from "turndown";

// 富文本粘贴 → Markdown。turndown 不小且只有粘贴用得到，不进编辑器主包：
// 编辑器挂载后空闲预载，粘贴时同步取用；万一抢在加载完成前粘贴，退化为纯文本粘贴
let turndown: TurndownService | null = null;
let turndownLoading: Promise<void> | null = null;
function ensureTurndown(): Promise<void> {
  if (!turndownLoading) {
    turndownLoading = Promise.all([import("turndown"), import("turndown-plugin-gfm")]).then(
      ([{ default: Turndown }, { gfm }]) => {
        const td = new Turndown({
          headingStyle: "atx",
          codeBlockStyle: "fenced",
          bulletListMarker: "-",
          emDelimiter: "*",
        });
        td.use(gfm);
        turndown = td;
      }
    );
  }
  return turndownLoading;
}
function htmlToMd(html: string): string {
  if (!turndown) return "";
  try {
    return turndown.turndown(html);
  } catch {
    return "";
  }
}

// 命令表已搬到 lib/editorCommands（斜杠菜单要在 CodeMirror 层直接执行，不能依赖组件），
// 类型在这里原样转出，老的引入点（ReaderActions / FloatingToolbar）不动
export type { FormatCommand } from "@/lib/editorCommands";

/** 选区快照：浮动工具条据此决定出现/隐藏与落点 */
export interface SelectionInfo {
  from: number;
  to: number;
  empty: boolean;
  /** 编辑器当前是否持有焦点（失焦要收起工具条，除非焦点落在工具条自己身上） */
  hasFocus: boolean;
  /** 本次上报是否伴随文档变化（打字时要收起工具条） */
  docChanged: boolean;
}

export interface EditorHandle {
  /** 切换阅读前同步最后一次输入，不触发版本保存。 */
  flush: () => void;
  /** arg：color 命令的色值（缺省 = 清除颜色），其余命令忽略 */
  applyFormat: (cmd: FormatCommand, arg?: string) => void;
  view: () => EditorView | null;
  /** 跳转到指定行（0 基）：移动光标并平滑滚动，大纲点击用 */
  scrollToLine: (line: number) => void;
  /** 只把某行滚到容器顶端，不动光标、不抢焦点（预览→编辑器的同步滚动用） */
  scrollLineToTop: (line: number) => void;
}

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
    void ensureTurndown();

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        drawSelection(),
        lineSelectionWithoutNewline,
        caretAndActiveLine,
        EditorView.lineWrapping,
        placeholder("在这里输入…"),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlight),
        syntaxHighlighting(codeHighlight),
        liveCompartment.current.of(
          liveRef.current ? livePreview : syntaxHighlighting(sourceHeadingHighlight)
        ),
        // 斜杠菜单：放在主 keymap 之前只是书写顺序，真正的优先级由它内部的 Prec.highest 决定，
        // 这样 Enter / Tab / ↑↓ / Esc 在菜单打开时才被消费，其余情况原样落到默认按键表
        slashMenu(emitSlash),
        keymap.of([
          {
            key: "Mod-b",
            run: (v) => {
              wrapSelection(v, "**", "**", "加粗文字");
              return true;
            },
          },
          {
            key: "Mod-i",
            run: (v) => {
              wrapSelection(v, "*", "*", "斜体文字");
              return true;
            },
          },
          {
            key: "Mod-k",
            run: (v) => {
              wrapSelection(v, "[", "](https://)", "链接文字");
              return true;
            },
          },
          {
            // 拦截浏览器保存对话框，改为立即保存并存档版本
            key: "Mod-s",
            run: () => {
              // 节流窗口里可能压着最后一次输入，先同步吐给 store 再触发保存
              pushChange.flush();
              window.dispatchEvent(new CustomEvent("xedit:save-now"));
              return true;
            },
          },
          ...defaultKeymap,
          ...historyKeymap,
          ...searchKeymap,
          indentWithTab,
        ]),
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            pushChange(update.state.doc);
          }
          // 选区 / 文档 / 焦点任一变化都上报：浮动工具条的出现与隐藏全靠这一路信号
          if (update.selectionSet || update.docChanged || update.focusChanged) {
            const sel = update.state.selection.main;
            onSelectionChangeRef.current?.({
              from: sel.from,
              to: sel.to,
              empty: sel.empty,
              hasFocus: update.view.hasFocus,
              docChanged: update.docChanged,
            });
          }
        }),
        EditorView.domEventHandlers({
          // 失焦通常意味着用户要去点别处（切文档、点保存、开分享），
          // 内容马上会被别人读走，压着的那一次必须先落地
          blur: () => {
            pushChange.flush();
            return false;
          },
          paste: (event, view) => {
            const files = event.clipboardData?.files;
            if (files && files.length > 0 && handleMediaFiles(view, files)) {
              event.preventDefault();
              return true;
            }
            const plain = event.clipboardData?.getData("text/plain") ?? "";
            const sel = view.state.selection.main;
            // 选中文字时粘贴 URL → 自动变链接
            if (/^https?:\/\/\S+$/.test(plain.trim()) && sel.from !== sel.to) {
              const text = view.state.sliceDoc(sel.from, sel.to);
              view.dispatch({
                changes: { from: sel.from, to: sel.to, insert: `[${text}](${plain.trim()})` },
              });
              event.preventDefault();
              return true;
            }
            // 富文本 → Markdown（纯文本粘贴可用 Cmd+Shift+V）
            const html = event.clipboardData?.getData("text/html") ?? "";
            if (html) {
              const md = htmlToMd(html).trim();
              const norm = (t: string) => t.replace(/\s+/g, " ").trim();
              if (md && norm(md) !== norm(plain)) {
                view.dispatch(view.state.replaceSelection(md));
                event.preventDefault();
                return true;
              }
            }
            return false;
          },
          drop: (event, view) => {
            const files = event.dataTransfer?.files;
            if (files && files.length > 0 && handleMediaFiles(view, files)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          scroll: (_event, view) => {
            if (onScrollLineRef.current) {
              reportScrollLine(view, scrollParentRef.current, onScrollLineRef.current);
            }
            return false;
          },
        }),
      ],
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
      effects: liveCompartment.current.reconfigure(
        live ? livePreview : syntaxHighlighting(sourceHeadingHighlight)
      ),
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
