import { EditorSelection } from "@codemirror/state";
import { EditorView } from "@codemirror/view";

export function wrapSelection(
  view: EditorView,
  before: string,
  after: string,
  placeholderText: string
) {
  const { state } = view;
  const changes = state.changeByRange((range) => {
    const text = state.doc.sliceString(range.from, range.to) || placeholderText;
    const insert = `${before}${text}${after}`;
    return {
      changes: { from: range.from, to: range.to, insert },
      range: EditorSelection.range(
        range.from + before.length,
        range.from + before.length + text.length
      ),
    };
  });
  view.dispatch(changes);
  view.focus();
}

/** 字体颜色：Markdown 没有颜色语法，用内联 <span style="color:…"> 承载
 *  （预览、公众号复制链路已放行该形态）。color 传 null 表示清除颜色。
 *  选区恰好是一个颜色 span、或恰好是其内部文字时，就地改写/剥掉原标签，避免嵌套套娃 */
export function applyColor(view: EditorView, color: string | null) {
  const openTagOf = (c: string) => `<span style="color:${c}">`;
  const CLOSE_TAG = "</span>";
  const { state } = view;
  const changes = state.changeByRange((range) => {
    let { from, to } = range;
    // 选区两侧紧贴着一对颜色标签（比如刚上完色又换色）：扩到整个标签一起改写
    const beforeText = state.doc.sliceString(Math.max(0, from - 60), from);
    const openAtLeft = beforeText.match(/<span style="color:[^"]*">$/);
    if (openAtLeft && state.doc.sliceString(to, to + CLOSE_TAG.length) === CLOSE_TAG) {
      from -= openAtLeft[0].length;
      to += CLOSE_TAG.length;
    }
    const text = state.doc.sliceString(from, to);
    const wrapped = text.match(/^<span style="color:[^"]*">([\s\S]*)<\/span>$/);
    if (color === null && !wrapped) return { range }; // 没颜色可清，原样不动
    const inner = (wrapped ? wrapped[1] : text) || "有色文字";
    const open = color === null ? "" : openTagOf(color);
    const insert = color === null ? inner : `${open}${inner}${CLOSE_TAG}`;
    return {
      changes: { from, to, insert },
      range: EditorSelection.range(from + open.length, from + open.length + inner.length),
    };
  });
  view.dispatch(changes);
  view.focus();
}

export function prefixLines(view: EditorView, prefix: string) {
  const { state } = view;
  const range = state.selection.main;
  const fromLine = state.doc.lineAt(range.from);
  const toLine = state.doc.lineAt(range.to);
  const changes = [];
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = state.doc.line(n);
    // 已有相同前缀则移除（toggle）
    if (line.text.startsWith(prefix)) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: "" });
    } else {
      changes.push({ from: line.from, insert: prefix });
    }
  }
  view.dispatch({ changes });
  view.focus();
}

const TASK_ITEM = /^(\s*)[-*+] \[[ xX]\] /;
const BULLET_ITEM = /^\s*[-*+] /;

/** 任务列表 toggle：已是任务项 → 摘掉标记退回普通文字（勾没勾都摘）；
 *  已是无序列表项 → 就地补上 [ ]，不再套一层 -；其余（含空行）→ 补完整的 "- [ ] "。
 *  缩进一律保留，嵌套层级不会被拉平 */
export function toggleTaskLines(view: EditorView) {
  const { state } = view;
  const range = state.selection.main;
  const fromLine = state.doc.lineAt(range.from);
  const toLine = state.doc.lineAt(range.to);
  const changes = [];
  for (let n = fromLine.number; n <= toLine.number; n++) {
    const line = state.doc.line(n);
    const task = line.text.match(TASK_ITEM);
    if (task) {
      changes.push({
        from: line.from + task[1].length,
        to: line.from + task[0].length,
        insert: "",
      });
      continue;
    }
    const bullet = line.text.match(BULLET_ITEM);
    if (bullet) {
      changes.push({ from: line.from + bullet[0].length, insert: "[ ] " });
      continue;
    }
    const indent = line.text.length - line.text.trimStart().length;
    changes.push({ from: line.from + indent, insert: "- [ ] " });
  }
  // 空行上点按钮是最常见的用法，光标要落到标记之后，能直接接着打字
  const changeSet = state.changes(changes);
  view.dispatch({
    changes: changeSet,
    ...(range.empty ? { selection: { anchor: changeSet.mapPos(range.head, 1) } } : {}),
  });
  view.focus();
}

export function insertBlock(view: EditorView, text: string) {
  const { state } = view;
  const range = state.selection.main;
  const line = state.doc.lineAt(range.from);
  const needLeadingNewline = line.text.trim() !== "";
  const insert = `${needLeadingNewline ? "\n\n" : ""}${text}\n`;
  const pos = line.to;
  view.dispatch({
    changes: { from: pos, insert },
    selection: { anchor: pos + insert.length },
  });
  view.focus();
}

export const TABLE_TEMPLATE = `| 表头 | 表头 |
| --- | --- |
| 内容 | 内容 |
| 内容 | 内容 |`;
