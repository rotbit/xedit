import { dropCursor, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import type TurndownService from "turndown";
import { caretInFencedCode } from "@/lib/livePreview/context";
import { handleMediaFiles, type Notify } from "@/lib/editor/commands";

// 富文本粘贴 → Markdown。turndown 不小且只有粘贴用得到，不进编辑器主包：
// 编辑器挂载后异步预载，粘贴时同步取用；加载完成前粘贴则退化为纯文本粘贴。
let turndown: TurndownService | null = null;
let turndownLoading: Promise<void> | null = null;
export function preloadClipboardConverter(): Promise<void> {
  if (!turndownLoading) {
    turndownLoading = Promise.all([import("turndown"), import("turndown-plugin-gfm")]).then(
      ([{ default: Turndown }, { gfm }]) => {
        const td = new Turndown({
          // 与编辑器自己产出的 Markdown 保持同一套写法：# 标题、``` 围栏、**加粗**、- 列表、--- 分隔线
          headingStyle: "atx",
          codeBlockStyle: "fenced",
          fence: "```",
          bulletListMarker: "-",
          emDelimiter: "*",
          strongDelimiter: "**",
          linkStyle: "inlined",
          hr: "---",
        });
        td.use(gfm);
        compactListItems(td);
        turndown = td;
      }
    );
  }
  return turndownLoading;
}

/**
 * turndown 默认把列表项写成 `-   x`（标记后三个空格）、`1.  x`（两个空格），
 * 续行还按这个宽度缩进——四格缩进在 Markdown 里就是代码块，粘完的列表一嵌套就散架。
 * 这里换成标准的 `- ` / `1. `，续行缩进同步收窄。规则用 addRule 覆盖内置的 listItem。
 */
function compactListItems(td: TurndownService) {
  td.addRule("listItem", {
    filter: "li",
    replacement: (content, node, options) => {
      const parent = node.parentNode as HTMLElement | null;
      let prefix = `${options.bulletListMarker} `;
      if (parent && parent.nodeName === "OL") {
        const start = parent.getAttribute("start");
        const index = Array.prototype.indexOf.call(parent.children, node);
        prefix = `${start ? Number(start) + index : index + 1}. `;
      }
      const endsWithBlock = /\n$/.test(content);
      const body =
        content.replace(/^\n+/, "").replace(/\n+$/, "") + (endsWithBlock ? "\n" : "");
      return (
        prefix +
        body.replace(/\n/gm, `\n${" ".repeat(prefix.length)}`) +
        (node.nextSibling ? "\n" : "")
      );
    },
  });
}

function htmlToMd(html: string): string {
  if (!turndown) return "";
  try {
    return turndown.turndown(html);
  } catch {
    return "";
  }
}

/** 光标是否在行内代码 `…` 内部。只认严格内部：贴在反引号外侧不算，
 *  否则「代码后面紧跟着粘一段富文本」会莫名其妙退化成纯文本 */
function caretInInlineCode(state: EditorState): boolean {
  const pos = state.selection.main.head;
  for (const side of [-1, 1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "InlineCode" && n.from < pos && pos < n.to) return true;
    }
  }
  return false;
}

/** 代码里粘贴一律原样进：URL 不自动变链接，富文本也不转 Markdown。
 *  代码块里出现 ** 和 # 只会把代码毁掉，而且转换是不可逆的 */
const caretInCode = (state: EditorState): boolean =>
  caretInFencedCode(state) || caretInInlineCode(state);

/** 粘贴与拖放只转换输入内容；默认文本输入继续交给 CodeMirror。
 *  notify：粘贴/拖入媒体会走上传，提示由调用方给（见 commands.ts 的 Notify）。
 *  dropCursor 一并挂在这里：拖文件进来时得先看得见落点在哪一格。 */
export const editorClipboard = (notify: Notify): Extension => [
  dropCursor(),
  // 内置落点光标在深色模式下是黑的（core 只给 .cm-cursor 配了深色），跟着正文色走
  EditorView.baseTheme({ ".cm-dropCursor": { borderLeftColor: "var(--accent)" } }),
  EditorView.domEventHandlers({
    paste: (event, view) => {
      const files = event.clipboardData?.files;
      if (files && files.length > 0 && handleMediaFiles(view, files, notify)) {
        event.preventDefault();
        return true;
      }
      // 代码里粘贴：交回 CodeMirror 原样插 text/plain（Cmd+Shift+V 走的也是这条路）
      if (caretInCode(view.state)) return false;
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
      if (!files || files.length === 0) return false;
      // 落点按鼠标位置算：拖进来的时候光标多半还停在别处，插到光标处就是插错地方
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (!handleMediaFiles(view, files, notify, pos ?? undefined)) return false;
      event.preventDefault();
      return true;
    },
  }),
];
