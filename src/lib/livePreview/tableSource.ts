import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";
import { StateEffect, type EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { tableCells, type TableRange } from "@/lib/editor/tableOps";

/**
 * Explicit "show this table's source" mode. Tables are edited in place inside their widget (tableEdit.ts),
 * so the caret touching a table no longer reveals its pipes; the source only appears after this effect.
 * The block field (blocks.ts) keeps the start positions of tables in source mode, maps them through changes,
 * and drops one once no caret touches it any more, so leaving the source turns it back into a widget.
 */
export const showTableSource = StateEffect.define<number>();

/** The Table syntax node at pos (pos may sit on either boundary) */
export function tableAt(state: EditorState, pos: number): TableRange | null {
  for (const side of [1, -1] as const) {
    for (let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side); n; n = n.parent) {
      if (n.name === "Table") return { from: n.from, to: n.to };
    }
  }
  return null;
}

/** Switch the table at pos to source and put the caret at the end of its first body cell (or the first header cell) */
export function revealTableSource(view: EditorView, pos: number): boolean {
  const table = tableAt(view.state, pos);
  if (!table) return false;
  const rows = tableCells(view.state, table.from, table.to);
  const target = rows[2]?.cells[0] ?? rows[0]?.cells[0];
  view.dispatch({
    effects: showTableSource.of(table.from),
    selection: { anchor: target ? target.to : table.from },
    scrollIntoView: true,
  });
  view.focus();
  return true;
}
