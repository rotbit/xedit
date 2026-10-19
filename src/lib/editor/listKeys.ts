/**
 * Enter on an empty list item / empty quote line: exit instead of continuing another one.
 *
 * lang-markdown's built-in insertNewlineContinueMarkup behaves oddly in these two cases:
 * Enter on a nested list "  - " inserts a junk line with just one space and still continues the marker, needing three or four presses
 * to get out; Enter on "> " never exits the quote (keeps continuing "> ").
 *
 * So intercept before it (Prec.highest; markdownKeymap is Prec.high), handling only the case where "the line has nothing but
 * the marker": with indentation, outdent one level; at top level, strip the marker and leave a clean blank line;
 * everything else returns false to the default behavior (normal list and quote continuation stay with it).
 */

import { Prec, type EditorState, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { indentUnit } from "@codemirror/language";
import { caretInFencedCode } from "@/lib/livePreview/context";

/** The line has only a list marker (including a task item's `- [ ]`), followed by at most whitespace */
const EMPTY_ITEM = /^([ \t]*)((?:[-*+]|\d+[.)])(?:[ \t]+\[[ xX]\])?)[ \t]*$/;
/** The line has only quote markers: `>`, `> `, `> > ` all count */
const EMPTY_QUOTE = /^([ \t]*)((?:>[ \t]*)+)$/;
/** Start of any list item line, used to find the parent level's indent */
const ITEM_HEAD = /^([ \t]*)(?:[-*+]|\d+[.)])[ \t]/;

/** Replace the whole line with text, cursor at line end (line start when text is empty) */
function replaceLine(view: EditorView, line: Line, text: string): true {
  view.dispatch({
    changes: { from: line.from, to: line.to, insert: text },
    selection: { anchor: line.from + text.length },
    userEvent: "delete",
    scrollIntoView: true,
  });
  return true;
}

/**
 * Indent for outdenting one level: copy the nearest preceding list item that's shallower than this one.
 * Don't just cut a fixed indentUnit: lists pasted from elsewhere often use 4-space indents, and cutting 2 would leave it half a level in.
 */
function outerIndent(state: EditorState, line: Line, indent: string): string {
  for (let n = line.number - 1; n >= 1; n--) {
    const text = state.doc.line(n).text;
    if (!text.trim()) break; // Blank line = the previous list has ended, so there's no parent level to align with
    const m = text.match(ITEM_HEAD);
    if (m && m[1].length < indent.length) return m[1];
  }
  const unit = state.facet(indentUnit).length || 2;
  if (indent.endsWith("\t")) return indent.slice(0, -1);
  return indent.slice(0, Math.max(0, indent.length - unit));
}

function exitEmptyBlock(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  // "- " inside fenced code is just code text; Enter should simply insert a newline
  if (caretInFencedCode(state)) return false;
  const line = state.doc.lineAt(range.head);

  const item = line.text.match(EMPTY_ITEM);
  if (item) {
    const [, indent, marker] = item;
    if (!indent) return replaceLine(view, line, "");
    return replaceLine(view, line, `${outerIndent(state, line, indent)}${marker} `);
  }

  const quote = line.text.match(EMPTY_QUOTE);
  if (quote) {
    const [, indent, markers] = quote;
    const levels = (markers.match(/>/g) ?? []).length;
    // Nested quotes unwind one level at a time; only leaving the outermost actually exits the quote
    return replaceLine(view, line, levels > 1 ? `${indent}${"> ".repeat(levels - 1)}` : "");
  }

  return false;
}

/** Tab / Shift-Tab aren't handled here: indentMore/indentLess used by indentWithTab are exactly
 *  "add/remove one indentUnit at line start", which for list items is one indent level, so the behavior is already right */
export const listKeymap: Extension = Prec.highest(keymap.of([{ key: "Enter", run: exitEmptyBlock }]));
