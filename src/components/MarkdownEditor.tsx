"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EditorState, EditorSelection, Compartment } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { searchKeymap } from "@codemirror/search";
import { livePreview } from "@/lib/livePreview";
import { uploadImageFile } from "@/lib/uploadImage";
import TurndownService from "turndown";
import { gfm } from "turndown-plugin-gfm";
import { toast } from "./Toast";

// 富文本粘贴 → Markdown
let turndown: TurndownService | null = null;
function htmlToMd(html: string): string {
  if (!turndown) {
    turndown = new TurndownService({
      headingStyle: "atx",
      codeBlockStyle: "fenced",
      bulletListMarker: "-",
      emDelimiter: "*",
    });
    turndown.use(gfm);
  }
  try {
    return turndown.turndown(html);
  } catch {
    return "";
  }
}

export type FormatCommand =
  | "bold"
  | "italic"
  | "strike"
  | "h1"
  | "h2"
  | "h3"
  | "quote"
  | "code"
  | "codeblock"
  | "link"
  | "image"
  | "table"
  | "hr";

export interface EditorHandle {
  applyFormat: (cmd: FormatCommand) => void;
  view: () => EditorView | null;
  /** 跳转到指定行（0 基） */
  scrollToLine: (line: number) => void;
}

interface Props {
  /** 文档切换时变化，触发编辑器内容重置 */
  docKey: string;
  initialContent: string;
  /** 即时渲染模式（类 Obsidian）：编辑区内直接呈现排版 */
  live?: boolean;
  onChange: (content: string) => void;
  onScrollLine?: (line: number, ratio: number) => void;
}

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.5em", fontWeight: "700", color: "var(--ink)" },
  { tag: tags.heading2, fontSize: "1.25em", fontWeight: "700", color: "var(--ink)" },
  { tag: tags.heading3, fontSize: "1.1em", fontWeight: "700", color: "var(--ink)" },
  { tag: tags.heading4, fontWeight: "700", color: "var(--ink)" },
  { tag: tags.strong, fontWeight: "700", color: "var(--accent-deep)" },
  { tag: tags.emphasis, fontStyle: "italic", color: "var(--accent-deep)" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "var(--ink-faint)" },
  { tag: tags.link, color: "var(--md-link)" },
  { tag: tags.url, color: "var(--md-link)" },
  {
    tag: tags.monospace,
    color: "var(--md-code)",
    background: "var(--md-code-bg)",
    fontFamily: "var(--mono)",
    borderRadius: "3px",
  },
  { tag: tags.quote, color: "var(--ink-soft)" },
  { tag: tags.meta, color: "var(--ink-faint)" },
  { tag: tags.processingInstruction, color: "var(--accent)" },
  { tag: tags.contentSeparator, color: "var(--accent)", fontWeight: "700" },
]);

function wrapSelection(view: EditorView, before: string, after: string, placeholderText: string) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const text = state.doc.sliceString(range.from, range.to) || placeholderText;
    const insert = `${before}${text}${after}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(
        range.from + before.length,
        range.from + before.length + text.length
      ),
    };
  });
  view.dispatch(changes);
  view.focus();
}

function prefixLines(view: EditorView, prefix: string) {
  const { state } = view;
  const range = state.selection.main;
  const fromLine = state.doc.lineAt(range.from);
  const toLine = state.doc.lineAt(range.to);
  const changes = [];
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = state.doc.line(n);
    // 已有相同前缀则移除（toggle）
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

function insertBlock(view: EditorView, text: string) {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const needLeadingNewline = line.text.trim() !== "";
  const insert = `${needLeadingNewline ? "\n\n" : ""}${text}\n`;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  view.focus();
}

const TABLE_TEMPLATE = `| 表头 | 表头 |
| --- | --- |
| 内容 | 内容 |
| 内容 | 内容 |`;

async function uploadImage(file: File): Promise<string | null> {
  try {
    return await uploadImageFile(file);
  } catch (e) {
    toast(e instanceof Error ? e.message : "图片上传失败", "error");
    return null;
  }
}

function handleImageFiles(view: EditorView, files: FileList | File[]): boolean {
  const images = Array.from(files).filter((f) => f.type.startsWith("image/"));
  if (images.length === 0) return false;
  toast("图片上传中…");
  for (const file of images) {
    void uploadImage(file).then((url) => {
      if (!url) return;
      const name = file.name.replace(/\.[^.]+$/, "");
      const pos = view.state.selection.main.head;
      view.dispatch({
        changes: { from: pos, insert: `\n![${name}](${url})\n` },
      });
      toast("图片已插入", "success");
    });
  }
  return true;
}

export const MarkdownEditor = forwardRef<EditorHandle, Props>(function MarkdownEditor(
  { docKey, initialContent, live = false, onChange, onScrollLine },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onScrollLineRef = useRef(onScrollLine);
  const liveCompartment = useRef(new Compartment());
  const liveRef = useRef(live);
  onChangeRef.current = onChange;
  onScrollLineRef.current = onScrollLine;
  liveRef.current = live;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        drawSelection(),
        EditorView.lineWrapping,
        placeholder("在这里输入 Markdown …"),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlight),
        liveCompartment.current.of(liveRef.current ? livePreview : []),
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
            onChangeRef.current(update.state.doc.toString());
          }
        }),
        EditorView.domEventHandlers({
          paste: (event, view) => {
            const files = event.clipboardData?.files;
            if (files && files.length > 0 && handleImageFiles(view, files)) {
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
            if (files && files.length > 0 && handleImageFiles(view, files)) {
              event.preventDefault();
              return true;
            }
            return false;
          },
          scroll: (_event, view) => {
            const scroller = view.scrollDOM;
            if (!onScrollLineRef.current) return false;
            const top = scroller.scrollTop;
            const block = view.lineBlockAtHeight(top);
            const line = view.state.doc.lineAt(block.from).number - 1;
            const ratio =
              block.height > 0 ? Math.min(1, Math.max(0, (top - block.top) / block.height)) : 0;
            onScrollLineRef.current(line, ratio);
            return false;
          },
        }),
      ],
    });

    const view = new EditorView({ state, parent: containerRef.current });
    viewRef.current = view;
    view.focus();

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // docKey 变化时整体重建编辑器（切换文档）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  // 切换视图模式时热插拔即时渲染扩展，保留光标与撤销历史
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: liveCompartment.current.reconfigure(live ? livePreview : []),
    });
  }, [live]);

  useImperativeHandle(ref, () => ({
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
        const top = Math.max(0, view.lineBlockAt(pos).top - 12);
        view.scrollDOM.scrollTo({ top, behavior: "smooth" });
      });
    },
    applyFormat: (cmd: FormatCommand) => {
      const view = viewRef.current;
      if (!view) return;
      switch (cmd) {
        case "bold":
          return wrapSelection(view, "**", "**", "加粗文字");
        case "italic":
          return wrapSelection(view, "*", "*", "斜体文字");
        case "strike":
          return wrapSelection(view, "~~", "~~", "删除线");
        case "code":
          return wrapSelection(view, "`", "`", "code");
        case "h1":
          return prefixLines(view, "# ");
        case "h2":
          return prefixLines(view, "## ");
        case "h3":
          return prefixLines(view, "### ");
        case "quote":
          return prefixLines(view, "> ");
        case "codeblock":
          return insertBlock(view, "```javascript\nconst hello = 'world';\n```");
        case "link":
          return wrapSelection(view, "[", "](https://)", "链接文字");
        case "image":
          return insertBlock(view, "![图片描述](https://)");
        case "table":
          return insertBlock(view, TABLE_TEMPLATE);
        case "hr":
          return insertBlock(view, "---");
      }
    },
  }));

  return <div ref={containerRef} className="h-full min-h-0" />;
});
