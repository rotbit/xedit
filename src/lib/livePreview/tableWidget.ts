import { EditorView, WidgetType } from "@codemirror/view";
import { displayCellText, escapeCellText } from "@/lib/editor/tableOps";
import { parseTableSource, renderCell, type ParsedTable } from "@/lib/livePreview/tableRender";
import { attachTableEditing, placeCaret, tableDomState } from "@/lib/livePreview/tableEdit";
import { buildTableToolbar } from "@/lib/livePreview/tableToolbar";

/**
 * The live-preview table widget. Tables are edited in place: every cell is contenteditable and writes its text
 * back to the document as you type (tableEdit.ts), and the hover toolbar (tableToolbar.ts) runs the row / column
 * operations. The caret touching the table never reveals the pipes; source shows only on request (tableSource.ts).
 * Parsing and cell rendering are in tableRender.ts.
 */

/** Height of a table row: cell vertical padding 6+6, plus 15px font × 1.6 line height, rounded to ~33px
 *  (see .cm-lp-table table and th/td in live-blocks.css) */
const TABLE_ROW_HEIGHT = 33;
/** 1px top and bottom border on the outer frame, plus a bit of slack (.cm-lp-table's border + border-radius) */
const TABLE_CHROME_HEIGHT = 4;

/** contenteditable="plaintext-only" keeps pasted/dropped rich text and stray <div>s out of cells; browsers without it
 *  either throw on the assignment or ignore it, so fall back to "true" (paste and Enter are intercepted anyway) */
let plaintextOnly: boolean | null = null;
function makeEditable(cell: HTMLElement) {
  if (plaintextOnly !== false) {
    try {
      cell.contentEditable = "plaintext-only";
      plaintextOnly = cell.contentEditable === "plaintext-only";
    } catch {
      plaintextOnly = false;
    }
  }
  if (!plaintextOnly) cell.contentEditable = "true";
}

/** Rows shown in the DOM: every source row except the delimiter (it only provides alignment) */
function shownRows(parsed: ParsedTable): number[] {
  return parsed.rows.map((_, i) => i).filter((i) => i !== 1);
}

export class TableWidget extends WidgetType {
  /** Split lines only once for height estimation; a changed source is a different widget anyway (see eq) */
  private readonly lineCount: number;
  constructor(readonly source: string) {
    super();
    this.lineCount = source.split("\n").length;
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  get estimatedHeight() {
    return this.lineCount * TABLE_ROW_HEIGHT + TABLE_CHROME_HEIGHT;
  }
  toDOM(view: EditorView) {
    const parsed = parseTableSource(this.source);
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-table";
    const table = document.createElement("table");
    const head = document.createElement("thead");
    const body = document.createElement("tbody");
    for (const row of shownRows(parsed)) {
      const tr = document.createElement("tr");
      parsed.rows[row].forEach((cell, col) => {
        const td = document.createElement(row === 0 ? "th" : "td");
        const align = parsed.aligns[col];
        if (align) td.style.textAlign = align;
        td.dataset.row = String(row);
        td.dataset.col = String(col);
        td.dataset.sourceOffset = String(cell.offset);
        makeEditable(td);
        td.innerHTML = renderCell(cell.text);
        tr.appendChild(td);
      });
      (row === 0 ? head : body).appendChild(tr);
    }
    if (head.childElementCount > 0) table.appendChild(head);
    if (body.childElementCount > 0) table.appendChild(body);
    // The frame clips the rounded corners; the toolbar sits outside it (above the table) so it never covers a cell
    const frame = document.createElement("div");
    frame.className = "cm-lp-table-frame";
    frame.appendChild(table);
    wrap.appendChild(frame);
    wrap.appendChild(buildTableToolbar(wrap, view));
    attachTableEditing(wrap, view, this.source, parsed);
    return wrap;
  }
  /**
   * Patch the existing DOM when only cell contents changed, so the cell being typed in keeps its focus and caret.
   * A different shape (rows or cells added/removed) returns false and CodeMirror rebuilds via toDOM.
   */
  updateDOM(dom: HTMLElement) {
    const state = tableDomState(dom);
    if (!state) return false;
    const next = parseTableSource(this.source);
    const rows = shownRows(next);
    const trs = dom.querySelectorAll("tr");
    if (trs.length !== rows.length) return false;
    for (let i = 0; i < rows.length; i++) if (trs[i].children.length !== next.rows[rows[i]].length) return false;

    const active = dom.ownerDocument.activeElement;
    rows.forEach((row, i) => {
      Array.from(trs[i].children).forEach((el, col) => {
        const td = el as HTMLElement;
        const cell = next.rows[row][col];
        td.dataset.sourceOffset = String(cell.offset);
        td.style.textAlign = next.aligns[col] ?? "";
        if (td === active) {
          // Only an outside change (undo, another cursor) differs from what is typed; replace it then
          if (escapeCellText(td.textContent ?? "").trim() !== cell.text) {
            td.textContent = displayCellText(cell.text);
            placeCaret(td, "end");
          }
        } else if (state.parsed.rows[row]?.[col]?.text !== cell.text) {
          td.innerHTML = renderCell(cell.text);
        }
      });
    });
    state.source = this.source;
    state.parsed = next;
    return true;
  }
  ignoreEvent() {
    return true;
  }
}
