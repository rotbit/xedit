import MarkdownIt from "markdown-it";
import { intrawordStarPlugin } from "@/lib/markdown/intrawordStar";
import { EditorView, WidgetType } from "@codemirror/view";
import { sanitizeHtml } from "@/lib/markdown/sanitize";
import { texToSvg } from "@/lib/markdown/mathjax";
import { mathJaxReady, refreshWhenMathReady } from "@/lib/livePreview/mathReady";
import { editOnClick } from "@/lib/livePreview/widgetUtils";

/** Block-level live-render widgets (tables, $$ math). Multi-line replacement can only come from a state field;
 *  decoration building is in blocks.ts. All HTML written to the DOM goes through DOMPurify first (sanitizeHtml) */

/** Cells run inline rendering only: block rules would wrap a cell's content in <p> again and blow up row height.
 *  The instance is created lazily once and reused across every editor relayout */
let inlineMd: MarkdownIt | null = null;
function renderCell(source: string): string {
  if (!inlineMd) inlineMd = new MarkdownIt({ html: false }).use(intrawordStarPlugin);
  return sanitizeHtml(inlineMd.renderInline(source));
}

/** Cells keep their source offsets so a click jumps straight to the matching row/column; escaping is left to Markdown rendering. */
function splitRow(line: string): { text: string; from: number }[] {
  const cells: { text: string; from: number }[] = [];
  let start = 0;
  const addCell = (end: number) => {
    const raw = line.slice(start, end);
    cells.push({ text: raw.trim(), from: start + raw.length - raw.trimStart().length });
    start = end + 1;
  };
  for (let i = 0; i < line.length; i++) {
    if (line[i] === "\\") {
      i++;
      continue;
    }
    if (line[i] === "|") addCell(i);
  }
  addCell(line.length);
  if (line.trimStart().startsWith("|")) cells.shift();
  if (cells.length > 0 && cells[cells.length - 1].text === "" && line.trimEnd().endsWith("|")) cells.pop();
  return cells;
}

/** The second (delimiter) row determines column alignment (:-- / --: / :-:) */
function parseAlign(cell: string): "left" | "right" | "center" | null {
  const left = cell.startsWith(":");
  const right = cell.endsWith(":");
  if (left && right) return "center";
  if (right) return "right";
  if (left) return "left";
  return null;
}

/** Height of a table row: cell vertical padding 6+6, plus 15px font × 1.6 line height, rounded to ~33px
 *  (see .cm-lp-table table and th/td in live-blocks.css) */
const TABLE_ROW_HEIGHT = 33;
/** 1px top and bottom border on the outer frame, plus a bit of slack (.cm-lp-table's border + border-radius) */
const TABLE_CHROME_HEIGHT = 4;

/** Estimated height of a math block: 10px vertical padding each side (.cm-lp-math), plus a typical one-line formula SVG height */
const MATH_BLOCK_HEIGHT = 64;

export class TableWidget extends WidgetType {
  /** Split lines only once: height estimation and DOM building both go row by row, and a changed source is a different widget anyway (see eq) */
  private readonly rows: string[];
  constructor(readonly source: string) {
    super();
    this.rows = source.split("\n");
  }
  eq(other: TableWidget) {
    return other.source === this.source;
  }
  get estimatedHeight() {
    return this.rows.length * TABLE_ROW_HEIGHT + TABLE_CHROME_HEIGHT;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-table";
    const table = document.createElement("table");
    const { rows } = this;
    const aligns = (rows[1] ? splitRow(rows[1]) : []).map((cell) => parseAlign(cell.text));
    const head = document.createElement("thead");
    const body = document.createElement("tbody");

    let lineOffset = 0;
    rows.forEach((line, index) => {
      const rowOffset = lineOffset;
      lineOffset += line.length + 1;
      if (index === 1) return; // the delimiter row only provides alignment, it isn't shown in the table
      const tr = document.createElement("tr");
      splitRow(line).forEach((cell, col) => {
        const td = document.createElement(index === 0 ? "th" : "td");
        const align = aligns[col];
        if (align) td.style.textAlign = align;
        td.dataset.sourceOffset = String(rowOffset + cell.from);
        td.innerHTML = renderCell(cell.text);
        tr.appendChild(td);
      });
      (index === 0 ? head : body).appendChild(tr);
    });

    if (head.childElementCount > 0) table.appendChild(head);
    if (body.childElementCount > 0) table.appendChild(body);
    wrap.appendChild(table);
    // +1 skips the leading `|`: landing inside the table range makes the decoration yield to source
    editOnClick(wrap, view, 1);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}

/** MathJax loads asynchronously: on first render it's usually not ready, so show the source as a placeholder; once ready
 *  refreshLivePreview triggers a rebuild (readiness and refresh are in mathReady.ts, shared with inline math).
 *  ready is part of eq, otherwise the widget would be "equal" and keep the stale DOM */
export class MathBlockWidget extends WidgetType {
  private readonly ready = mathJaxReady();
  constructor(readonly tex: string) {
    super();
  }
  eq(other: MathBlockWidget) {
    return other.tex === this.tex && other.ready === this.ready;
  }
  get estimatedHeight() {
    return MATH_BLOCK_HEIGHT;
  }
  toDOM(view: EditorView) {
    const wrap = document.createElement("div");
    wrap.className = "cm-lp-math";
    if (!this.ready) {
      const holder = document.createElement("span");
      holder.className = "cm-lp-math-loading";
      holder.textContent = this.tex;
      wrap.appendChild(holder);
      refreshWhenMathReady(view);
    } else {
      try {
        // texToSvg produces MathJax's own SVG; still sanitize it through the shared pipeline before it enters the DOM
        wrap.innerHTML = sanitizeHtml(texToSvg(this.tex, true));
      } catch {
        wrap.classList.add("cm-lp-math-error");
        wrap.textContent = this.tex;
      }
    }
    // +2 skips the leading `$$`: a cursor inside the range restores the source
    editOnClick(wrap, view, 2);
    return wrap;
  }
  ignoreEvent() {
    return true;
  }
}
