import type { EditorView } from "@codemirror/view";
import { t, tk } from "@/i18n/t";
import {
  cycleAlign,
  deleteColumn,
  deleteRow,
  insertColumn,
  insertRow,
} from "@/lib/editor/tableOps";
import { runTableOp, tableDomState, tableRangeOf, type CellPos } from "@/lib/livePreview/tableEdit";
import { revealTableSource } from "@/lib/livePreview/tableSource";

/**
 * Hover toolbar of the table widget (top-right inside the frame, shown on hover or while a cell has focus).
 * "Current" row / column is the last focused cell, defaulting to the first body row's first cell. Buttons act on
 * mousedown with preventDefault, so the focused cell keeps its focus; after a shape change the rebuilt table
 * focuses the sensible neighbor (see runTableOp).
 */

const SVG_NS = "http://www.w3.org/2000/svg";

/** 24×24 stroke icons: a row/column bar plus a +/− mark */
const ICONS: Record<string, string[]> = {
  "row-above": ["M4 13h16v7H4z", "M12 3v6", "M9 6h6"],
  "row-below": ["M4 4h16v7H4z", "M12 15v6", "M9 18h6"],
  "row-delete": ["M4 8.5h16v7H4z", "M9 12h6"],
  "col-left": ["M13 4h7v16h-7z", "M3 12h6", "M6 9v6"],
  "col-right": ["M4 4h7v16H4z", "M15 12h6", "M18 9v6"],
  "col-delete": ["M8.5 4h7v16h-7z", "M12 9v6"],
  align: ["M4 6h16", "M4 10h10", "M4 14h16", "M4 18h10"],
  source: ["M9 7l-5 5 5 5", "M15 7l5 5-5 5"],
};

function icon(paths: string[]): SVGSVGElement {
  const svg = document.createElementNS(SVG_NS, "svg");
  svg.setAttribute("width", "14");
  svg.setAttribute("height", "14");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("fill", "none");
  svg.setAttribute("stroke", "currentColor");
  svg.setAttribute("stroke-width", "1.8");
  svg.setAttribute("stroke-linecap", "round");
  svg.setAttribute("stroke-linejoin", "round");
  svg.setAttribute("aria-hidden", "true");
  for (const d of paths) {
    const path = document.createElementNS(SVG_NS, "path");
    path.setAttribute("d", d);
    svg.appendChild(path);
  }
  return svg;
}

/** The toolbar's target cell: last focused, clamped to the current shape */
function currentCell(wrap: HTMLElement): { cur: CellPos; rows: number; cols: number } | null {
  const state = tableDomState(wrap);
  if (!state) return null;
  const rows = state.parsed.rows.length;
  const cols = state.parsed.rows[0]?.length ?? 0;
  const last = state.last ?? { row: rows > 2 ? 2 : 0, col: 0 };
  const row = last.row === 1 || last.row >= rows ? (rows > 2 ? 2 : 0) : last.row;
  return { cur: { row, col: Math.min(last.col, Math.max(0, cols - 1)) }, rows, cols };
}

type Action = (wrap: HTMLElement, view: EditorView) => void;

const ACTIONS: { key: string; label: string; run: Action }[] = [
  {
    key: "row-above",
    label: tk("上方插入行"),
    run: (wrap) => {
      const c = currentCell(wrap);
      if (!c) return;
      const row = Math.max(c.cur.row, 2);
      runTableOp(wrap, (s, tb) => insertRow(s, tb, row - 1), { row, col: c.cur.col });
    },
  },
  {
    key: "row-below",
    label: tk("下方插入行"),
    run: (wrap) => {
      const c = currentCell(wrap);
      if (!c) return;
      const after = Math.max(c.cur.row, 1);
      runTableOp(wrap, (s, tb) => insertRow(s, tb, after), { row: after + 1, col: c.cur.col });
    },
  },
  {
    key: "row-delete",
    label: tk("删除行"),
    run: (wrap) => {
      const c = currentCell(wrap);
      if (!c) return;
      const { row, col } = c.cur;
      // The row below slides up into this index; at the bottom take the one above, or the header when none are left
      const remaining = c.rows - 1;
      const focus = row < remaining ? row : row - 1 >= 2 ? row - 1 : 0;
      runTableOp(wrap, (s, tb) => deleteRow(s, tb, row), { row: focus, col });
    },
  },
  {
    key: "col-left",
    label: tk("左侧插入列"),
    run: (wrap) => {
      const c = currentCell(wrap);
      if (!c) return;
      runTableOp(wrap, (s, tb) => insertColumn(s, tb, c.cur.col - 1), c.cur);
    },
  },
  {
    key: "col-right",
    label: tk("右侧插入列"),
    run: (wrap) => {
      const c = currentCell(wrap);
      if (!c) return;
      runTableOp(wrap, (s, tb) => insertColumn(s, tb, c.cur.col), { ...c.cur, col: c.cur.col + 1 });
    },
  },
  {
    key: "col-delete",
    label: tk("删除列"),
    run: (wrap) => {
      const c = currentCell(wrap);
      if (!c) return;
      const col = Math.min(c.cur.col, c.cols - 2);
      runTableOp(wrap, (s, tb) => deleteColumn(s, tb, c.cur.col), { row: c.cur.row, col });
    },
  },
  {
    key: "align",
    label: tk("对齐"),
    run: (wrap) => {
      const c = currentCell(wrap);
      if (c) runTableOp(wrap, (s, tb) => cycleAlign(s, tb, c.cur.col), c.cur);
    },
  },
  {
    key: "source",
    label: tk("源码"),
    run: (wrap, view) => {
      const range = tableRangeOf(wrap);
      if (range) revealTableSource(view, range.from);
    },
  },
];

export function buildTableToolbar(wrap: HTMLElement, view: EditorView): HTMLElement {
  const bar = document.createElement("div");
  bar.className = "cm-lp-table-tools";
  bar.contentEditable = "false";
  for (const action of ACTIONS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `cm-lp-table-tool cm-lp-table-tool-${action.key}`;
    const label = t(action.label);
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.appendChild(icon(ICONS[action.key]));
    // mousedown + preventDefault: the focused cell must not blur before the operation reads it
    btn.addEventListener("mousedown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      e.stopPropagation();
      action.run(wrap, view);
    });
    btn.addEventListener("click", (e) => e.preventDefault());
    bar.appendChild(btn);
  }
  return bar;
}
