import { Prec, type Extension } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import { renderedTableRanges } from "@/lib/livePreview/blocks";
import { focusTableEdge } from "@/lib/livePreview/tableEdit";

/**
 * The editor caret at the edge of a rendered table. Tables no longer turn into source when the caret touches them,
 * so a few default editing commands would act on pipes the user can't see:
 * - Backspace right after the table (or at the start of the line below it) would join that line into the last row,
 *   and a second Backspace would delete the whole atomic widget; Delete before it mirrors that at the header.
 *   The blank line counts too: removing it makes GFM swallow the following paragraph as a table row, silently now
 *   that the pipes stay hidden. Instead the caret steps into the nearest cell.
 * - Typing with the caret on the table's boundary would write into the first/last row's source; it goes onto its own line.
 */

function tableDom(view: EditorView, from: number): HTMLElement | null {
  for (const el of view.contentDOM.querySelectorAll<HTMLElement>(".cm-lp-table")) {
    if (view.posAtDOM(el) === from) return el;
  }
  return null;
}

function enterTable(view: EditorView, dir: "backward" | "forward"): boolean {
  const sel = view.state.selection.main;
  if (!sel.empty || view.state.selection.ranges.length > 1) return false;
  const { doc } = view.state;
  for (const r of renderedTableRanges(view.state)) {
    let hit = false;
    if (dir === "backward") {
      const next = r.to < doc.length ? doc.lineAt(r.to + 1) : null;
      hit = sel.head === r.to || (next !== null && sel.head === next.from);
    } else {
      const prev = r.from > 0 ? doc.lineAt(r.from - 1) : null;
      hit = sel.head === r.from || (prev !== null && sel.head === prev.to);
    }
    if (!hit) continue;
    const wrap = tableDom(view, r.from);
    return !!wrap && focusTableEdge(wrap, dir === "backward" ? "last" : "first");
  }
  return false;
}

export const tableBoundary: Extension = [
  Prec.high(
    keymap.of([
      { key: "Backspace", run: (view) => enterTable(view, "backward") },
      { key: "Delete", run: (view) => enterTable(view, "forward") },
    ])
  ),
  EditorView.inputHandler.of((view, from, to, text) => {
    if (from !== to || view.composing || text.includes("\n")) return false;
    for (const r of renderedTableRanges(view.state)) {
      if (from !== r.from && from !== r.to) continue;
      const insert = from === r.to ? `\n${text}` : `${text}\n`;
      view.dispatch({
        changes: { from, insert },
        selection: { anchor: from === r.to ? from + insert.length : from + text.length },
        userEvent: "input.type",
        scrollIntoView: true,
      });
      return true;
    }
    return false;
  }),
];
