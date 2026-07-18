"use client";

import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { EditorState, EditorSelection } from "@codemirror/state";
import {
  EditorView,
  keymap,
  placeholder,
  drawSelection,
  highlightActiveLine,
} from "@codemirror/view";
import { defaultKeymap, history, historyKeymap, indentWithTab } from "@codemirror/commands";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { searchKeymap } from "@codemirror/search";
import { toast } from "./Toast";

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
}

interface Props {
  /** 文档切换时变化，触发编辑器内容重置 */
  docKey: string;
  initialContent: string;
  onChange: (content: string) => void;
  onScrollLine?: (line: number, ratio: number) => void;
}

const mdHighlight = HighlightStyle.define([
  { tag: tags.heading1, fontSize: "1.3em", fontWeight: "700", color: "#232323" },
  { tag: tags.heading2, fontSize: "1.2em", fontWeight: "700", color: "#232323" },
  { tag: tags.heading3, fontSize: "1.1em", fontWeight: "700", color: "#232323" },
  { tag: tags.heading4, fontWeight: "700", color: "#232323" },
  { tag: tags.strong, fontWeight: "700", color: "#a53125" },
  { tag: tags.emphasis, fontStyle: "italic", color: "#a53125" },
  { tag: tags.strikethrough, textDecoration: "line-through", color: "#9a968e" },
  { tag: tags.link, color: "#1e6bb8" },
  { tag: tags.url, color: "#1e6bb8" },
  { tag: tags.monospace, color: "#7c5cbf", background: "#f5f2fa" },
  { tag: tags.quote, color: "#6b6b6b" },
  { tag: tags.meta, color: "#9a968e" },
  { tag: tags.processingInstruction, color: "#c0392b" },
  { tag: tags.contentSeparator, color: "#c0392b", fontWeight: "700" },
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
  const formData = new FormData();
  formData.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body: formData });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    toast(data.error ?? "图片上传失败", "error");
    return null;
  }
  return data.url as string;
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
  { docKey, initialContent, onChange, onScrollLine },
  ref
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onScrollLineRef = useRef(onScrollLine);
  onChangeRef.current = onChange;
  onScrollLineRef.current = onScrollLine;

  useEffect(() => {
    if (!containerRef.current) return;

    const state = EditorState.create({
      doc: initialContent,
      extensions: [
        history(),
        drawSelection(),
        highlightActiveLine(),
        EditorView.lineWrapping,
        placeholder("在这里输入 Markdown …"),
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(mdHighlight),
        keymap.of([...defaultKeymap, ...historyKeymap, ...searchKeymap, indentWithTab]),
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

    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // docKey 变化时整体重建编辑器（切换文档）
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docKey]);

  useImperativeHandle(ref, () => ({
    view: () => viewRef.current,
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
