import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** Triple-click (or more) line selection: select only to the end of the line, excluding the newline.
 *  CodeMirror's default line selection is line.from ~ line.to + 1 (with the newline), so drawSelection
 *  paints a sliver of empty selection and a cursor at the start of the next line, looking like "the next line got selected too".
 *  Here we take over mouse gestures with detail >= 3: whole-line selection and line-wise drag extension both stop at line.to. */
export const lineSelectionWithoutNewline = EditorView.mouseSelectionStyle.of((view, event) => {
  if (event.button !== 0 || event.detail < 3) return null;
  const pos = view.posAtCoords({ x: event.clientX, y: event.clientY });
  if (pos == null) return null;
  let startFrom = view.state.doc.lineAt(pos).from;
  let startSel = view.state.selection;
  return {
    update(update) {
      if (update.docChanged) {
        startFrom = update.changes.mapPos(startFrom);
        startSel = startSel.map(update.changes);
      }
    },
    get(curEvent, extend, multiple) {
      const { state } = view;
      const cur = view.posAtCoords({ x: curEvent.clientX, y: curEvent.clientY }) ?? startFrom;
      const startLine = state.doc.lineAt(startFrom);
      const curLine = state.doc.lineAt(cur);
      // Dragging down: anchor at the start line's beginning, head at the current line's end; reversed when dragging up. Neither crosses a newline
      const range =
        curLine.from >= startLine.from
          ? EditorSelection.range(startLine.from, curLine.to)
          : EditorSelection.range(startLine.to, curLine.from);
      if (extend) return startSel.replaceRange(startSel.main.extend(range.from, range.to));
      if (multiple) return startSel.addRange(range);
      return EditorSelection.create([range]);
    },
  };
});
