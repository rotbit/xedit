/**
 * Tab / Shift-Tab inside a table: jump between cells instead of indenting the whole line.
 *
 * Why: the default indentWithTab inserts two spaces at the start of a table row, which instantly
 * breaks the table — and the indent bleeds into the following lines. In a table, Tab only ever means "next cell".
 *
 * Detection uses the syntax tree's Table node. When a table has just been started (header row only, no `| --- |` yet)
 * it doesn't parse as a Table, so we fall back to a "line starts with `|`" shape check, after first ruling out fenced code
 * (pipes in code are bitwise ops or regex alternation, not tables).
 */

import { EditorSelection, Prec, type EditorState, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { syntaxTree } from "@codemirror/language";
import type { SyntaxNode } from "@lezer/common";
import { caretInFencedCode } from "@/lib/livePreview/context";

interface Cell {
  /** Full cell range (including padding spaces on both sides), excluding the pipes */
  from: number;
  to: number;
}

/** Delimiter row `| --- | :-: |`: not content, Tab always skips over it */
function isDelimiterRow(line: Line): boolean {
  return line.text.includes("-") && /^[\s|:-]+$/.test(line.text);
}

function isTableLine(line: Line): boolean {
  return line.text.trim().startsWith("|");
}

function inTableNode(state: EditorState, pos: number): boolean {
  for (const side of [-1, 1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "Table") return true;
    }
  }
  return false;
}

/** Split this line into cells on pipes; `\|` is an escaped pipe and doesn't count */
function cellsOf(line: Line): Cell[] {
  const text = line.text;
  const bars: number[] = [];
  for (let i = 0; i < text.length; i++) {
    if (text[i] === "\\") i++;
    else if (text[i] === "|") bars.push(i);
  }
  if (bars.length === 0) return [];
  const cells: Cell[] = [];
  // Leading/trailing pipes are optional; without them, the segment outside the pipe is a cell too
  if (text.slice(0, bars[0]).trim()) cells.push({ from: line.from, to: line.from + bars[0] });
  for (let i = 0; i + 1 < bars.length; i++) {
    cells.push({ from: line.from + bars[i] + 1, to: line.from + bars[i + 1] });
  }
  const tailAt = bars[bars.length - 1] + 1;
  if (text.slice(tailAt).trim()) cells.push({ from: line.from + tailAt, to: line.to });
  return cells;
}

/** Content range of a cell: jumping in selects the content so typing replaces it (empty cells just get a cursor) */
function contentRange(state: EditorState, cell: Cell): [number, number] {
  const text = state.sliceDoc(cell.from, cell.to);
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  if (lead + trail >= text.length) {
    const at = Math.min(cell.from + 1, cell.to);
    return [at, at];
  }
  return [cell.from + lead, cell.to - trail];
}

/** Line range the table occupies: scan both ways from the cursor line, all contiguous table rows count */
function rowRange(state: EditorState, line: Line): { first: number; last: number } {
  let first = line.number;
  let last = line.number;
  while (first > 1 && isTableLine(state.doc.line(first - 1))) first--;
  while (last < state.doc.lines && isTableLine(state.doc.line(last + 1))) last++;
  return { first, last };
}

/** Tab in the last cell: append an empty row with the same column count, cursor in its first cell */
function appendRow(view: EditorView, lastLine: Line, columns: number): void {
  const row = `|${"  |".repeat(Math.max(1, columns))}`;
  view.dispatch({
    changes: { from: lastLine.to, insert: `\n${row}` },
    // After the newline + `| ` is exactly the empty slot in the first cell
    selection: { anchor: lastLine.to + 3 },
    userEvent: "input",
    scrollIntoView: true,
  });
}

function moveCell(view: EditorView, dir: 1 | -1): boolean {
  const { state } = view;
  const pos = state.selection.main.head;
  const line = state.doc.lineAt(pos);
  if (caretInFencedCode(state)) return false;
  if (!inTableNode(state, pos) && !isTableLine(line)) return false;

  let cells = cellsOf(line);
  if (cells.length === 0) return false;
  const at = cells.findIndex((c) => pos >= c.from && pos <= c.to);
  // A cursor outside the leading/trailing pipe counts as "before the first cell / after the last cell";
  // a cursor already on the delimiter row (clicked into) is treated as out of bounds, so the loop below moves it to the adjacent content row
  let next = isDelimiterRow(line)
    ? dir > 0
      ? cells.length
      : -1
    : (at < 0 ? (dir > 0 ? -1 : cells.length) : at) + dir;

  const { first, last } = rowRange(state, line);
  let row = line.number;
  while (next < 0 || next >= cells.length) {
    const step = row + dir;
    if (step < first || step > last) {
      // Out of bounds backwards: stay in the first cell, but still swallow the key so Tab doesn't indent the whole table
      if (dir < 0) return true;
      appendRow(view, state.doc.line(last), cells.length);
      return true;
    }
    row = step;
    const stepLine = state.doc.line(row);
    if (isDelimiterRow(stepLine)) continue;
    cells = cellsOf(stepLine);
    next = dir > 0 ? 0 : cells.length - 1;
  }

  const [from, to] = contentRange(state, cells[next]);
  view.dispatch({ selection: EditorSelection.range(from, to), scrollIntoView: true });
  return true;
}

/** Prec.highest: must run before markdownKeymap and indentWithTab;
 *  returns false outside tables so Tab indents as usual. Enter isn't intercepted; newline behavior stays default */
export const tableKeymap: Extension = Prec.highest(
  keymap.of([
    {
      key: "Tab",
      run: (view) => moveCell(view, 1),
      shift: (view) => moveCell(view, -1),
    },
  ])
);
