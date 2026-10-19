/**
 * The editor's formatting shortcut table, plus two keyboard-only line commands (to body text, ordered/bullet lists).
 *
 * Bindings all go through runFormatCommand in commands.ts, the same entry as the floating toolbar, slash menu, and command palette,
 * so formatting behavior is defined in one place. Only "back to body text" and "list toggle" have no entry in the command table
 * (and no toolbar buttons), so they're implemented here.
 *
 * Key choices (mac):
 * - ⌘⇧C is Chrome's "Inspect Element", which pages can't intercept, so inline code uses ⌘⇧K; ⌘` / ⌘⇧` are macOS
 *   window cycling and never reach the page either, so they're unusable.
 * - ⌘E / ⌘⇧E / ⌘/ / ⌘⇧P / ⌘O / ⌘P are already consumed globally in the capture phase by useEditorViewMode and Home,
 *   so they're all avoided here.
 * - Headings use ⌘⌥1/2/3, ⌘⌥0 returns to body text; ⌘⌥ combos are unused in Chrome/Safari.
 */

import type { ChangeSpec, EditorState, Line } from "@codemirror/state";
import type { EditorView, KeyBinding } from "@codemirror/view";
import { runFormatCommand, type FormatCommand, type Notify } from "@/lib/editor/commands";

/** Lines covered by the selection; a selection ending exactly at the next line start doesn't include that line (same convention as format.ts) */
function selectedLines(state: EditorState): Line[] {
  const range = state.selection.main;
  const first = state.doc.lineAt(range.from).number;
  const last = state.doc.lineAt(range.empty ? range.to : range.to - 1).number;
  const out: Line[] = [];
  for (let n = first; n <= last; n++) out.push(state.doc.line(n));
  return out;
}

/** With an empty selection, map the cursor with assoc=1 so it isn't left before the newly inserted marker after a prefix change (see format.ts) */
function applyLineChanges(view: EditorView, changes: ChangeSpec[]): void {
  const { state } = view;
  const range = state.selection.main;
  if (changes.length) {
    const set = state.changes(changes);
    view.dispatch({
      changes: set,
      ...(range.empty ? { selection: { anchor: set.mapPos(range.head, 1) } } : {}),
    });
  }
  view.focus();
}

/** Heading markers at line start; indentation and quote markers may precede them, which are kept while only `#` is stripped */
const HEADING_HEAD = /^([ \t]*(?:>[ \t]*)*)(#{1,6})[ \t]+/;
/** List markers at line start; a task item's `[ ]` counts as part of the marker */
const LIST_HEAD = /^([ \t]*)(?:[-*+]|\d+[.)])(?:[ \t]+\[[ xX]\])?[ \t]+/;
const BULLET_HEAD = /^[ \t]*[-*+][ \t]+(?!\[[ xX]\][ \t])/;
const ORDERED_HEAD = /^[ \t]*\d+[.)][ \t]+/;

/** Back to body text: strip only heading markers, keeping indentation, quotes, and the following text */
export function toParagraph(view: EditorView): void {
  const changes: ChangeSpec[] = [];
  for (const line of selectedLines(view.state)) {
    const m = line.text.match(HEADING_HEAD);
    if (m) changes.push({ from: line.from + m[1].length, to: line.from + m[0].length, insert: "" });
  }
  applyLineChanges(view, changes);
}

/**
 * Bullet/ordered list toggle: if all selected lines are already this list type, strip the markers; otherwise convert all to this type
 * (other list markers are replaced in place, not stacked as `- 1. `). Ordered lists are renumbered in selection order,
 * but existing numbering in the surrounding context isn't maintained; that's auto-renumbering, a separate concern.
 */
export function toggleList(view: EditorView, ordered: boolean): void {
  const lines = selectedLines(view.state);
  const head = ordered ? ORDERED_HEAD : BULLET_HEAD;
  const allSame = lines.every((line) => head.test(line.text));
  const changes: ChangeSpec[] = [];
  let index = 0;
  for (const line of lines) {
    const m = line.text.match(LIST_HEAD);
    const indent = m ? m[1] : line.text.slice(0, line.text.length - line.text.trimStart().length);
    const to = line.from + (m ? m[0].length : indent.length);
    index += 1;
    changes.push({
      from: line.from + indent.length,
      to,
      insert: allSame ? "" : ordered ? `${index}. ` : "- ",
    });
  }
  applyLineChanges(view, changes);
}

/** Shortcuts share the command entry with the toolbar and slash menu; formatting behavior is defined only in the command layer. */
function formatKey(key: string, cmd: FormatCommand, notify: Notify): KeyBinding {
  return {
    key,
    run: (view) => {
      runFormatCommand(view, cmd, notify);
      return true;
    },
  };
}

function localKey(key: string, run: (view: EditorView) => void): KeyBinding {
  return {
    key,
    run: (view) => {
      run(view);
      return true;
    },
  };
}

export function formatShortcuts(notify: Notify): KeyBinding[] {
  return [
    formatKey("Mod-b", "bold", notify),
    formatKey("Mod-i", "italic", notify),
    formatKey("Mod-k", "link", notify),
    formatKey("Mod-Shift-x", "strike", notify),
    formatKey("Mod-Shift-k", "code", notify),
    formatKey("Mod-Alt-1", "h1", notify),
    formatKey("Mod-Alt-2", "h2", notify),
    formatKey("Mod-Alt-3", "h3", notify),
    localKey("Mod-Alt-0", toParagraph),
    formatKey("Mod-Shift-.", "quote", notify),
    localKey("Mod-Shift-8", (view) => toggleList(view, false)),
    localKey("Mod-Shift-7", (view) => toggleList(view, true)),
    formatKey("Mod-Shift-9", "tasklist", notify),
  ];
}
