import { isolateHistory, redo, undo } from "@codemirror/commands";
import type { EditorState, TransactionSpec } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { displayCellText, insertRow, writeCell, type TableRange } from "@/lib/editor/tableOps";
import { renderCell, type ParsedTable } from "@/lib/livePreview/tableRender";

/**
 * In-place editing of a rendered table's cells.
 *
 * A focused cell shows its raw cell source as plain text and writes it back to the document on every input
 * (CodeMirror ignores DOM mutations inside widgets, so the write-back is ours). While a cell has focus,
 * root.activeElement is the cell rather than contentDOM, so CodeMirror considers itself unfocused: it neither
 * rewrites the DOM selection on dispatch nor runs its keymaps — the cell keys below are handled here instead.
 * The widget's updateDOM (tableWidget.ts) patches cells in place, so typing keeps the focused cell alive;
 * operations that change the table's shape rebuild it and refocus through pendingFocus.
 */

export interface CellPos {
  row: number;
  col: number;
}

export interface TableDom {
  view: EditorView;
  source: string;
  parsed: ParsedTable;
  /** Last focused cell: the toolbar's "current" row / column */
  last: CellPos | null;
  composing: boolean;
}

const tables = new WeakMap<HTMLElement, TableDom>();

export function tableDomState(wrap: HTMLElement): TableDom | undefined {
  return tables.get(wrap);
}

/** Cell to focus after a shape-changing operation rebuilds the table at `from` (consumed by the rebuilt DOM) */
let pendingFocus: (CellPos & { from: number }) | null = null;

/** The table's document range right now (the widget's position moves as text above it changes) */
export function tableRangeOf(wrap: HTMLElement): TableRange | null {
  const state = tables.get(wrap);
  if (!state || !wrap.isConnected) return null;
  const from = state.view.posAtDOM(wrap);
  return { from, to: from + state.source.length };
}

function cellAt(wrap: HTMLElement, pos: CellPos): HTMLElement | null {
  return wrap.querySelector<HTMLElement>(`[data-row="${pos.row}"][data-col="${pos.col}"]`);
}

function cellPos(cell: HTMLElement): CellPos {
  return { row: Number(cell.dataset.row), col: Number(cell.dataset.col) };
}

export function placeCaret(cell: HTMLElement, mode: "all" | "start" | "end" | number) {
  const sel = cell.ownerDocument.getSelection();
  if (!sel) return;
  const range = cell.ownerDocument.createRange();
  if (typeof mode === "number") {
    // Plain-text cells hold text nodes only: walk them to the character offset
    let rest = mode;
    const walker = cell.ownerDocument.createTreeWalker(cell, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) {
      const len = node.textContent?.length ?? 0;
      if (rest <= len) {
        range.setStart(node, rest);
        range.collapse(true);
        sel.removeAllRanges();
        sel.addRange(range);
        return;
      }
      rest -= len;
    }
    mode = "end";
  }
  range.selectNodeContents(cell);
  if (mode !== "all") range.collapse(mode === "start");
  sel.removeAllRanges();
  sel.addRange(range);
}

/** Caret offset within the cell's text, or null for a non-collapsed selection / one outside the cell */
function caretOffset(cell: HTMLElement): number | null {
  const sel = cell.ownerDocument.getSelection();
  if (!sel || sel.rangeCount === 0 || !sel.isCollapsed || !cell.contains(sel.anchorNode)) return null;
  const range = cell.ownerDocument.createRange();
  range.selectNodeContents(cell);
  range.setEnd(sel.anchorNode!, sel.anchorOffset);
  return range.toString().length;
}

export function focusCell(wrap: HTMLElement, pos: CellPos, mode: "all" | "start" | "end"): boolean {
  const cell = cellAt(wrap, pos);
  if (!cell) return false;
  cell.focus();
  placeCaret(cell, mode);
  return true;
}

/** Focus the table's first or last cell (used when the editor caret runs into the table's edge) */
export function focusTableEdge(wrap: HTMLElement, edge: "first" | "last"): boolean {
  const state = tables.get(wrap);
  if (!state) return false;
  const order = cellOrder(state.parsed);
  const pos = edge === "first" ? order[0] : order[order.length - 1];
  return !!pos && focusCell(wrap, pos, edge === "first" ? "start" : "end");
}

/** Reading order of the editable cells: rows top to bottom (delimiter skipped), cells left to right */
function cellOrder(parsed: ParsedTable): CellPos[] {
  const order: CellPos[] = [];
  parsed.rows.forEach((cells, row) => {
    if (row !== 1) cells.forEach((_, col) => order.push({ row, col }));
  });
  return order;
}

function bodyRows(parsed: ParsedTable): number[] {
  return parsed.rows.map((_, i) => i).filter((i) => i !== 1);
}

/**
 * Run a source transform on this table, then focus `focus` in the rebuilt widget.
 * Structural edits get their own undo step instead of merging into the surrounding typing.
 */
export function runTableOp(
  wrap: HTMLElement,
  op: (state: EditorState, table: TableRange) => TransactionSpec | null,
  focus: CellPos | null
): boolean {
  const state = tables.get(wrap);
  const range = tableRangeOf(wrap);
  if (!state || !range) return false;
  const spec = op(state.view.state, range);
  if (!spec) return false;
  pendingFocus = focus ? { ...focus, from: range.from } : null;
  state.view.dispatch({
    changes: spec.changes,
    userEvent: "input.table",
    annotations: isolateHistory.of("full"),
  });
  // A rebuilt widget picks pendingFocus up in a microtask queued during dispatch; this one runs after it
  queueMicrotask(() => (pendingFocus = null));
  return true;
}

function writeBack(wrap: HTMLElement, cell: HTMLElement) {
  const state = tables.get(wrap);
  const range = tableRangeOf(wrap);
  if (!state || !range) return;
  const pos = range.from + Number(cell.dataset.sourceOffset);
  if (pos > range.to) return;
  const spec = writeCell(state.view.state, pos, cell.textContent ?? "");
  // userEvent "input" lets history merge consecutive keystrokes; no selection, the editor caret stays where it was
  if (spec) state.view.dispatch({ ...spec, userEvent: "input" });
}

/** Leave the table: put the editor caret on the line after it (or before it) and hand focus back to CodeMirror */
function exitTable(wrap: HTMLElement, cell: HTMLElement, where: "before" | "after") {
  const state = tables.get(wrap);
  const range = tableRangeOf(wrap);
  if (!state || !range) return;
  const { view } = state;
  const len = view.state.doc.length;
  const anchor =
    where === "after" ? (range.to < len ? range.to + 1 : range.to) : range.from > 0 ? range.from - 1 : range.from;
  cell.blur();
  view.dispatch({ selection: { anchor }, scrollIntoView: true });
  view.focus();
}

function moveLinear(wrap: HTMLElement, state: TableDom, from: CellPos, dir: 1 | -1) {
  const order = cellOrder(state.parsed);
  const at = order.findIndex((p) => p.row === from.row && p.col === from.col);
  const next = at + dir;
  if (next < 0) return;
  if (next < order.length) {
    focusCell(wrap, order[next], "all");
    return;
  }
  const last = state.parsed.rows.length - 1;
  runTableOp(wrap, (s, t) => insertRow(s, t, last), { row: last + 1, col: 0 });
}

function moveVertical(wrap: HTMLElement, state: TableDom, cell: HTMLElement, dir: 1 | -1, append: boolean) {
  const from = cellPos(cell);
  const rows = bodyRows(state.parsed);
  const nextRow = rows[rows.indexOf(from.row) + dir];
  if (nextRow === undefined) {
    if (dir > 0 && append) {
      const last = state.parsed.rows.length - 1;
      runTableOp(wrap, (s, t) => insertRow(s, t, last), { row: last + 1, col: from.col });
    } else exitTable(wrap, cell, dir > 0 ? "after" : "before");
    return;
  }
  const col = Math.min(from.col, state.parsed.rows[nextRow].length - 1);
  focusCell(wrap, { row: nextRow, col }, "all");
}

/** Toggle-free emphasis: wrap the selected text in the marker, or insert a pair with the caret between */
function wrapSelection(cell: HTMLElement, marker: string) {
  const sel = cell.ownerDocument.getSelection();
  const text = sel && cell.contains(sel.anchorNode) ? sel.toString() : "";
  const start = text ? null : caretOffset(cell);
  // execCommand goes through the normal input path, so write-back and the browser's caret handling stay in one place
  document.execCommand("insertText", false, `${marker}${text}${marker}`);
  if (start !== null) placeCaret(cell, start + marker.length);
}

function runHistory(wrap: HTMLElement, state: TableDom, cell: HTMLElement, command: typeof undo) {
  const range = tableRangeOf(wrap);
  // If the undone change alters the table's shape it gets rebuilt: come back to the same cell
  pendingFocus = range ? { ...cellPos(cell), from: range.from } : null;
  command(state.view);
  queueMicrotask(() => (pendingFocus = null));
}

function handleKey(wrap: HTMLElement, state: TableDom, cell: HTMLElement, e: KeyboardEvent): boolean {
  if (e.isComposing || e.keyCode === 229) return false;
  const mod = e.metaKey || e.ctrlKey;
  const plain = !mod && !e.altKey && !e.shiftKey;
  const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  switch (key) {
    case "Tab":
      if (mod || e.altKey) return false;
      moveLinear(wrap, state, cellPos(cell), e.shiftKey ? -1 : 1);
      return true;
    case "Enter":
      if (mod || e.altKey) return false;
      if (e.shiftKey) document.execCommand("insertText", false, "<br>");
      else moveVertical(wrap, state, cell, 1, true);
      return true;
    case "Escape":
      exitTable(wrap, cell, "after");
      return true;
    case "ArrowUp":
    case "ArrowDown":
      if (!plain) return false;
      moveVertical(wrap, state, cell, key === "ArrowDown" ? 1 : -1, false);
      return true;
    case "ArrowLeft":
    case "ArrowRight": {
      if (!plain) return false;
      const offset = caretOffset(cell);
      const left = key === "ArrowLeft";
      if (offset === null || offset !== (left ? 0 : (cell.textContent ?? "").length)) return false;
      const order = cellOrder(state.parsed);
      const at = order.findIndex((p) => p.row === cellPos(cell).row && p.col === cellPos(cell).col);
      const next = order[at + (left ? -1 : 1)];
      if (next) focusCell(wrap, next, left ? "end" : "start");
      return true;
    }
    case "a":
      // Chrome's native select-all widens to the outermost editable root (CodeMirror's content), taking focus with it
      if (!mod || e.altKey || e.shiftKey) return false;
      placeCaret(cell, "all");
      return true;
    case "z":
      if (!mod || e.altKey) return false;
      runHistory(wrap, state, cell, e.shiftKey ? redo : undo);
      return true;
    case "y":
      if (!mod || e.altKey || e.shiftKey) return false;
      runHistory(wrap, state, cell, redo);
      return true;
    case "b":
    case "i":
      if (!mod || e.altKey || e.shiftKey) return false;
      wrapSelection(cell, key === "b" ? "**" : "*");
      return true;
  }
  return false;
}

function eventCell(wrap: HTMLElement, e: Event): HTMLElement | null {
  const cell = (e.target as Element | null)?.closest?.<HTMLElement>("td, th") ?? null;
  return cell && wrap.contains(cell) ? cell : null;
}

/** Wire cell editing onto a freshly built table widget (once per toDOM; updateDOM keeps the listeners) */
export function attachTableEditing(wrap: HTMLElement, view: EditorView, source: string, parsed: ParsedTable) {
  const state: TableDom = { view, source, parsed, last: null, composing: false };
  tables.set(wrap, state);
  const rawOf = (cell: HTMLElement) => {
    const { row, col } = cellPos(cell);
    return state.parsed.rows[row]?.[col]?.text ?? "";
  };

  wrap.addEventListener("focusin", (e) => {
    const cell = eventCell(wrap, e);
    if (!cell) return;
    state.last = cellPos(cell);
    cell.classList.add("cm-lp-cell-editing");
    const raw = displayCellText(rawOf(cell));
    // Plain cells already read the same: leave the DOM alone so a click keeps its caret position
    if (cell.textContent !== raw) {
      cell.textContent = raw;
      placeCaret(cell, "end");
    }
  });
  wrap.addEventListener("focusout", (e) => {
    const cell = eventCell(wrap, e);
    if (!cell) return;
    state.composing = false;
    cell.classList.remove("cm-lp-cell-editing");
    cell.innerHTML = renderCell(rawOf(cell));
  });
  wrap.addEventListener("compositionstart", () => (state.composing = true));
  wrap.addEventListener("compositionend", (e) => {
    state.composing = false;
    const cell = eventCell(wrap, e);
    if (cell) writeBack(wrap, cell);
  });
  wrap.addEventListener("input", (e) => {
    const cell = eventCell(wrap, e);
    if (!cell || state.composing || (e as InputEvent).isComposing) return;
    writeBack(wrap, cell);
  });
  wrap.addEventListener("beforeinput", (e) => {
    const cell = eventCell(wrap, e);
    if (!cell) return;
    // Soft keyboards and the Edit menu bypass keydown: no line breaks in a cell, and undo belongs to the editor history
    if (e.inputType === "insertParagraph" || e.inputType === "insertLineBreak") e.preventDefault();
    if (e.inputType === "historyUndo" || e.inputType === "historyRedo") {
      e.preventDefault();
      runHistory(wrap, state, cell, e.inputType === "historyUndo" ? undo : redo);
    }
  });
  wrap.addEventListener("keydown", (e) => {
    const cell = eventCell(wrap, e);
    if (!cell || !handleKey(wrap, state, cell, e)) return;
    e.preventDefault();
    e.stopPropagation();
  });
  wrap.addEventListener("paste", (e) => {
    const cell = eventCell(wrap, e);
    if (!cell) return;
    e.preventDefault();
    const text = (e.clipboardData?.getData("text/plain") ?? "").replace(/\r\n|\r|\n/g, " ");
    if (text) document.execCommand("insertText", false, text);
  });

  // A shape-changing operation rebuilt this table: focus the cell it asked for once the DOM is attached
  if (pendingFocus) {
    queueMicrotask(() => {
      const target = pendingFocus;
      if (!target || !wrap.isConnected || view.posAtDOM(wrap) !== target.from) return;
      pendingFocus = null;
      const order = cellOrder(state.parsed);
      const exact = order.find((p) => p.row === target.row && p.col === target.col);
      const sameRow = order.filter((p) => p.row === target.row);
      const pos = exact ?? sameRow[sameRow.length - 1] ?? order[0];
      if (pos) focusCell(wrap, pos, "all");
    });
  }
}
