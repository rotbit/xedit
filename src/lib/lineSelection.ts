import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

/** 三击（及连击更多次）选行：只选到行尾，不含行尾换行符。
 *  CodeMirror 默认的行选区是 line.from ~ line.to + 1（带换行），drawSelection
 *  会在下一行行首画出一小截空选区和光标，看起来像"多选了下一行"。
 *  这里接管 detail >= 3 的鼠标手势：整行选择、拖拽按行扩展，都停在 line.to。 */
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
      // 向下拖：锚在起始行行首、头在当前行行尾；向上拖反之。均不跨过换行符
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
