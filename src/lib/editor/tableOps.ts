/**
 * Pure source transforms for GFM pipe tables: cell lookup, cell write-back escaping, and the row / column /
 * alignment operations behind the live-preview table toolbar. Everything works on an EditorState plus the
 * table's [from, to] range and returns a TransactionSpec (or null when the operation is refused), so it can be
 * unit-tested without a DOM. The row/cell splitting below is shared with tableKeys.ts (source-mode Tab navigation),
 * so both paths agree on what an escaped pipe or an optional leading/trailing pipe means.
 */

import type { ChangeSpec, EditorState, Line, TransactionSpec } from "@codemirror/state";

export interface Cell {
  /** Full cell range (including padding spaces on both sides), excluding the pipes */
  from: number;
  to: number;
}

/** Delimiter row `| --- | :-: |`: not content, Tab always skips over it */
export function isDelimiterRow(line: Line): boolean {
  return line.text.includes("-") && /^[\s|:-]+$/.test(line.text);
}

/** Split this line into cells on pipes; `\|` is an escaped pipe and doesn't count */
export function cellsOf(line: Line): Cell[] {
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
export function contentRange(state: EditorState, cell: Cell): [number, number] {
  const text = state.sliceDoc(cell.from, cell.to);
  const lead = text.length - text.trimStart().length;
  const trail = text.length - text.trimEnd().length;
  if (lead + trail >= text.length) {
    const at = Math.min(cell.from + 1, cell.to);
    return [at, at];
  }
  return [cell.from + lead, cell.to - trail];
}

export interface TableRange {
  from: number;
  to: number;
}

export interface TableCellRange {
  /** Trimmed content range (an empty cell collapses to one position just inside its left pipe) */
  from: number;
  to: number;
  /** The whole cell between its pipes, padding included: write-back replaces this span */
  outer: Cell;
}

export interface TableRow {
  /** 1-based document line number */
  line: number;
  from: number;
  to: number;
  /** The `| --- | :-: |` row: never shown as cells, never deleted as a row */
  delimiter: boolean;
  cells: TableCellRange[];
}

export type Align = "left" | "right" | "center" | null;

/** The delimiter cell decides column alignment (:-- / --: / :-:) */
export function parseAlign(cell: string): Align {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

const ALIGN_CYCLE: Align[] = [null, "left", "center", "right"];
const ALIGN_SPEC: Record<string, string> = { none: "---", left: ":--", center: ":-:", right: "--:" };

/** Rows of the table, by source line (index 0 = header, 1 = delimiter row) */
export function tableCells(state: EditorState, from: number, to: number): TableRow[] {
  const rows: TableRow[] = [];
  const first = state.doc.lineAt(from).number;
  const last = state.doc.lineAt(to).number;
  for (let n = first; n <= last; n++) {
    const line = state.doc.line(n);
    const cells = cellsOf(line).map((outer) => {
      const [cf, ct] = contentRange(state, outer);
      return { from: cf, to: ct, outer };
    });
    rows.push({ line: n, from: line.from, to: line.to, delimiter: n === first + 1 && isDelimiterRow(line), cells });
  }
  return rows;
}

/** The cell (between pipes) containing pos on its line, or null */
export function cellRangeAt(state: EditorState, pos: number): Cell | null {
  const line = state.doc.lineAt(pos);
  return cellsOf(line).find((c) => pos >= c.from && pos <= c.to) ?? null;
}

/**
 * Plain text typed into a cell -> its Markdown source: newlines collapse to spaces and bare `|` become `\|`.
 * Backslash escapes are copied through as a pair, the same way cellsOf scans, so `\\|` stays a backslash
 * followed by an escaped pipe instead of turning into a cell boundary.
 */
export function escapeCellText(text: string): string {
  const flat = text.replace(/\r\n|\r|\n/g, " ");
  let out = "";
  for (let i = 0; i < flat.length; i++) {
    const ch = flat[i];
    if (ch === "\\" && i + 1 < flat.length) {
      out += ch + flat[i + 1];
      i++;
    } else if (ch === "|") out += "\\|";
    else out += ch;
  }
  return out;
}

/** Inverse for display while editing: a cell's trimmed source with `\|` shown as `|` */
export function displayCellText(source: string): string {
  let out = "";
  for (let i = 0; i < source.length; i++) {
    if (source[i] === "\\" && source[i + 1] === "|") {
      out += "|";
      i++;
    } else out += source[i];
  }
  return out;
}

/** What a cell's text becomes in the document: padded by one space on each side */
export function cellWriteBack(text: string): string {
  return ` ${escapeCellText(text).trim()} `;
}

/** Replace the cell containing pos with the typed text; null when the source already says the same thing */
export function writeCell(state: EditorState, pos: number, text: string): TransactionSpec | null {
  const cell = cellRangeAt(state, pos);
  if (!cell) return null;
  const current = state.sliceDoc(cell.from, cell.to);
  const next = cellWriteBack(text);
  if (current.trim() === next.trim()) return null;
  return { changes: { from: cell.from, to: cell.to, insert: next } };
}

function emptyRow(columns: number): string {
  return `|${"  |".repeat(Math.max(1, columns))}`;
}

/** Insert an empty row after afterRowIndex (header or delimiter both mean "first body row") */
export function insertRow(state: EditorState, table: TableRange, afterRowIndex: number): TransactionSpec | null {
  const rows = tableCells(state, table.from, table.to);
  if (rows.length < 2) return null;
  const after = Math.min(Math.max(afterRowIndex, 1), rows.length - 1);
  const at = rows[after].to;
  return {
    changes: { from: at, insert: `\n${emptyRow(rows[0].cells.length)}` },
    // After the newline + `| ` is the empty slot of the new row's first cell
    selection: { anchor: at + 3 },
  };
}

/** Delete a body row; the header and delimiter rows are refused */
export function deleteRow(state: EditorState, table: TableRange, rowIndex: number): TransactionSpec | null {
  const rows = tableCells(state, table.from, table.to);
  if (rowIndex < 2 || rowIndex >= rows.length) return null;
  return { changes: { from: rows[rowIndex - 1].to, to: rows[rowIndex].to } };
}

/** Change that adds one cell after column `after` (-1 = before the first) on a row, padding ragged rows */
function insertCellChange(state: EditorState, row: TableRow, after: number): ChangeSpec {
  const text = state.sliceDoc(row.from, row.to);
  const slot = row.delimiter ? " --- " : "  ";
  const cells = row.cells.map((c) => c.outer);
  if (after < 0) {
    if (text.trimStart().startsWith("|")) return { from: row.from + text.indexOf("|") + 1, insert: `${slot}|` };
    return { from: row.from, insert: `|${slot}|` };
  }
  if (after < cells.length) {
    const cell = cells[after];
    if (cell.to < row.to) return { from: cell.to + 1, insert: `${slot}|` };
    return { from: row.to, insert: `|${slot}|` };
  }
  // Ragged row shorter than the header: fill the missing cells first so the new one lands in the right column
  const pad = `${slot}|`.repeat(after + 1 - cells.length + 1);
  const trimmed = text.trimEnd();
  if (trimmed.endsWith("|")) return { from: row.from + trimmed.length, insert: pad };
  return { from: row.to, insert: `|${pad}` };
}

/** Insert an empty column after afterColIndex (-1 = new first column) */
export function insertColumn(state: EditorState, table: TableRange, afterColIndex: number): TransactionSpec | null {
  const rows = tableCells(state, table.from, table.to);
  const columns = rows[0]?.cells.length ?? 0;
  if (afterColIndex < -1 || afterColIndex >= columns) return null;
  return { changes: rows.map((row) => insertCellChange(state, row, afterColIndex)) };
}

/** Delete a column on every row that has it; deleting the last remaining column is refused */
export function deleteColumn(state: EditorState, table: TableRange, col: number): TransactionSpec | null {
  const rows = tableCells(state, table.from, table.to);
  const columns = rows[0]?.cells.length ?? 0;
  if (columns <= 1 || col < 0 || col >= columns) return null;
  const changes: ChangeSpec[] = [];
  for (const row of rows) {
    const cell = row.cells[col]?.outer;
    if (!cell) continue;
    // Take the cell plus its closing pipe; a tail cell without one takes the pipe before it instead
    if (cell.to < row.to) changes.push({ from: cell.from, to: cell.to + 1 });
    else changes.push({ from: Math.max(row.from, cell.from - 1), to: cell.to });
  }
  return { changes };
}

/** Cycle a column's alignment none -> left -> center -> right -> none by rewriting its delimiter cell */
export function cycleAlign(state: EditorState, table: TableRange, col: number): TransactionSpec | null {
  const rows = tableCells(state, table.from, table.to);
  const delimiter = rows[1];
  const cell = delimiter?.delimiter ? delimiter.cells[col] : undefined;
  if (!cell) return null;
  const current = parseAlign(state.sliceDoc(cell.from, cell.to).trim());
  const next = ALIGN_CYCLE[(ALIGN_CYCLE.indexOf(current) + 1) % ALIGN_CYCLE.length];
  return { changes: { from: cell.outer.from, to: cell.outer.to, insert: ` ${ALIGN_SPEC[next ?? "none"]} ` } };
}
