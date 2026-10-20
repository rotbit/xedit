import { dropCursor, EditorView } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { EditorState, Extension } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";
import type TurndownService from "turndown";
import { caretInFencedCode } from "@/lib/livePreview/context";
import { fencedCodeAt } from "@/lib/livePreview/fenceKeys";
import { handleMediaFiles, type Notify } from "@/lib/editor/commands";

// Rich text paste → Markdown. turndown isn't small and only paste needs it, so it stays out of the editor's main bundle:
// preloaded asynchronously after the editor mounts, used synchronously on paste; pasting before it loads degrades to plain-text paste.
let turndown: TurndownService | null = null;
let turndownLoading: Promise<void> | null = null;
export function preloadClipboardConverter(): Promise<void> {
  if (!turndownLoading) {
    turndownLoading = Promise.all([import("turndown"), import("turndown-plugin-gfm")]).then(
      ([{ default: Turndown }, { gfm }]) => {
        const td = new Turndown({
          // Match the Markdown the editor produces itself: # headings, ``` fences, **bold**, - lists, --- rules
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
 * turndown writes list items as `-   x` (three spaces after the marker) and `1.  x` (two spaces) by default,
 * and indents continuation lines to that width; a four-space indent is a code block in Markdown, so pasted lists fall apart once nested.
 * Switch to standard `- ` / `1. ` and narrow continuation indents accordingly. addRule overrides the built-in listItem.
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

/** Whether the cursor is strictly inside inline code `…`. Touching a backtick from outside doesn't count,
 *  otherwise "pasting rich text right after code" would mysteriously degrade to plain text */
function caretInInlineCode(state: EditorState): boolean {
  const pos = state.selection.main.head;
  for (const side of [-1, 1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "InlineCode" && n.from < pos && pos < n.to) return true;
    }
  }
  return false;
}

/** Pasting inside code always goes in verbatim: URLs aren't auto-linked and rich text isn't converted to Markdown.
 *  ** and # in a code block would only wreck the code, and the conversion is irreversible */
const caretInCode = (state: EditorState): boolean =>
  caretInFencedCode(state) || caretInInlineCode(state);

/** A selection inside one code block that sweeps its fence lines → only the code between the fences.
 *  Under live rendering the fences are invisible: dragging to the end of a code card easily lands on the closing ``` line
 *  (the card's bottom padding) or the title bar's ```lang, or overshoots into the blank line around the card; none of that
 *  is code the user can see. Only a selection that reaches into body text keeps the fences. */
export function codeCopyRange(state: EditorState): { from: number; to: number } | null {
  const { ranges } = state.selection;
  if (ranges.length !== 1 || ranges[0].empty) return null;
  const { from, to } = ranges[0];
  // Blank lines swept around the card don't count as body text
  const text = state.sliceDoc(from, to);
  const start = from + (text.length - text.trimStart().length);
  const end = to - (text.length - text.trimEnd().length);
  if (start >= end) return null;
  const block = fencedCodeAt(state, start, 1);
  if (!block) return null;
  const blockTo = block.lastLine ? block.lastLine.to : block.node.to;
  if (end > blockTo) return null;
  const clamped = { from: Math.max(from, block.contentFrom), to: Math.min(to, block.contentTo) };
  if (clamped.from === from && clamped.to === to) return null;
  return clamped.from < clamped.to ? clamped : null;
}

function copyCodeOnly(event: ClipboardEvent, view: EditorView, cut: boolean): boolean {
  // In source mode the fences are visible text, so whatever is selected is what the user means
  if (!view.dom.classList.contains("cm-live-preview")) return false;
  const range = codeCopyRange(view.state);
  if (!range || !event.clipboardData) return false;
  event.clipboardData.clearData();
  event.clipboardData.setData("text/plain", view.state.sliceDoc(range.from, range.to));
  event.preventDefault();
  if (cut) view.dispatch({ changes: range, userEvent: "delete.cut", scrollIntoView: true });
  return true;
}

/** Paste and drop only convert the incoming content; default text input stays with CodeMirror.
 *  notify: pasting/dropping media triggers uploads, and the caller provides the messages (see Notify in commands.ts).
 *  dropCursor is attached here too: when dragging a file in, you need to see where it will land. */
export const editorClipboard = (notify: Notify): Extension => [
  dropCursor(),
  // The built-in drop cursor is black in dark mode (core only styles .cm-cursor for dark), so follow the text color
  EditorView.baseTheme({ ".cm-dropCursor": { borderLeftColor: "var(--accent)" } }),
  EditorView.domEventHandlers({
    copy: (event, view) => copyCodeOnly(event, view, false),
    cut: (event, view) => copyCodeOnly(event, view, true),
    paste: (event, view) => {
      const files = event.clipboardData?.files;
      if (files && files.length > 0 && handleMediaFiles(view, files, notify)) {
        event.preventDefault();
        return true;
      }
      // Pasting in code: hand back to CodeMirror to insert text/plain as-is (Cmd+Shift+V takes this path too)
      if (caretInCode(view.state)) return false;
      const plain = event.clipboardData?.getData("text/plain") ?? "";
      const sel = view.state.selection.main;
      // Pasting a URL with text selected → auto-link
      if (/^https?:\/\/\S+$/.test(plain.trim()) && sel.from !== sel.to) {
        const text = view.state.sliceDoc(sel.from, sel.to);
        view.dispatch({
          changes: { from: sel.from, to: sel.to, insert: `[${text}](${plain.trim()})` },
        });
        event.preventDefault();
        return true;
      }
      // Rich text → Markdown (plain-text paste via Cmd+Shift+V)
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
      // Drop position follows the mouse: when dragging in, the cursor is usually elsewhere, so inserting at the cursor would be wrong
      const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
      if (!handleMediaFiles(view, files, notify, pos ?? undefined)) return false;
      event.preventDefault();
      return true;
    },
  }),
];
