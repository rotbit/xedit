/**
 * 颜色 span 常隐之后的编辑兜底：删除键接管 + 孤儿标签清理。
 *
 * 即时渲染下 `<span style="color:…">` 的首尾标签是藏着的、还登记成了 atomic（见
 * livePreview/inline.ts）。代价全在删除键上：默认的 Backspace 往左退一格正好退进被藏起来的
 * 标签里，@codemirror/commands 的 skipAtomic 于是把整段标签一起删掉 —— 用户以为删了一个字，
 * 实际删掉了三十多个看不见的字符，正文里留下一个孤零零的 `</span>`。
 *
 * 所以这里做两件事：
 * - 按键接管：光标紧贴隐藏标签时跳过标签，删它外侧的那一个字符，标签本身不动；
 * - 兜底清理：标签仍被整段删掉时（选中一片文字删除、剪切、粘贴覆盖），把配对的另一半
 *   一并删掉；中间文字被删空的一对标签也一起收走——留着就是看不见又删不掉的垃圾。
 *
 * 两者都只挂在即时渲染上（livePreview/index.ts）：源码模式下标签是看得见的普通文字，
 * 该怎么删就怎么删，插手反而是捣乱。
 */

import {
  EditorState,
  Prec,
  Transaction,
  findClusterBreak,
  type ChangeDesc,
  type Extension,
} from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import {
  colorSpanPairsIn,
  skipHiddenColorTags,
  type ColorSpanTag,
} from "@/lib/editor/colorSpan";

/** 单个空选区才接管；其余（有选区、多光标、输入法合成中）一律交回默认行为 */
function loneCaret(view: EditorView): number | null {
  if (view.composing || view.compositionStarted) return null;
  const { selection } = view.state;
  return selection.ranges.length === 1 && selection.main.empty ? selection.main.head : null;
}

function backspaceOverTag(view: EditorView): boolean {
  const { state } = view;
  const head = loneCaret(view);
  if (head === null) return false;
  const start = skipHiddenColorTags(state, head, -1);
  if (start === head) return false; // 光标没贴着隐藏标签，与本文件无关
  // 文首：左边没有东西可删。吞掉按键——放给默认行为的话它会把标签删穿
  if (start === 0) return true;
  const line = state.doc.lineAt(start);
  // 标签左边是行首：删掉的就是那个换行（并到上一行），与没有标签时的手感一致
  const from =
    start === line.from
      ? start - 1
      : line.from + findClusterBreak(line.text, start - line.from, false, false);
  view.dispatch({
    changes: { from, to: start },
    // 光标落在被删掉那个字符的位置上（标签外侧），接着打字就是普通颜色
    selection: { anchor: from },
    userEvent: "delete.backward",
    scrollIntoView: true,
  });
  return true;
}

function deleteOverTag(view: EditorView): boolean {
  const { state } = view;
  const head = loneCaret(view);
  if (head === null) return false;
  const end = skipHiddenColorTags(state, head, 1);
  if (end === head) return false;
  if (end === state.doc.length) return true; // 文末，同上吞掉
  const line = state.doc.lineAt(end);
  // 标签右边是行尾：删掉换行，把下一行并上来
  const to =
    end === line.to
      ? end + 1
      : line.from + findClusterBreak(line.text, end - line.from, true, true);
  view.dispatch({
    changes: { from: end, to },
    // 不动光标：删除点在它右边，它原地就贴着删除处，还留在 span 里，接着打字仍是这个颜色
    userEvent: "delete.forward",
    scrollIntoView: true,
  });
  return true;
}

/** 变更之后这个标签是否原样还在（位置可以平移，文字得一字不差）；在就返回新坐标。
    assoc 取「朝标签内侧」：正好贴着标签插入的文字不算标签的一部分 */
function mappedTag(tr: Transaction, tag: ColorSpanTag, text: string): ColorSpanTag | null {
  const from = tr.changes.mapPos(tag.from, 1);
  const to = tr.changes.mapPos(tag.to, -1);
  if (to - from !== tag.to - tag.from) return null;
  return tr.newDoc.sliceString(from, to) === text ? { from, to } : null;
}

/** 标签被某一次变更整段吃掉了。只坏了几个字符不算：atomic 之下基本不会发生，
    真发生了也说明用户在源码层面动手，别替他乱删另一头 */
function tagRemoved(changes: ChangeDesc, tag: ColorSpanTag): boolean {
  let removed = false;
  changes.iterChangedRanges((fromA, toA) => {
    if (fromA <= tag.from && toA >= tag.to) removed = true;
  });
  return removed;
}

/**
 * 孤儿标签清理：用户的删除动作把一对标签删剩一半时，追加一次变更把另一半也带走。
 * 中间文字被删空的一对（开闭标签贴到了一起）同样收走。
 *
 * 只认用户事件，且跳过 undo/redo —— 历史自带完整的前后状态，再补一刀等于撤销撤不回原样。
 */
const colorSpanCleanup = EditorState.transactionFilter.of((tr) => {
  if (!tr.docChanged) return tr;
  const event = tr.annotation(Transaction.userEvent);
  if (!event || event === "undo" || event === "redo") return tr;

  // 只有「删掉了东西」的变更才可能弄出孤儿。纯插入（打字、输入法上屏）直接放行，
  // 省掉每敲一个字都去扫一遍语法树
  let delFrom = -1;
  let delTo = -1;
  tr.changes.iterChangedRanges((fromA, toA) => {
    if (toA <= fromA) return;
    if (delFrom < 0) delFrom = fromA;
    delTo = toA;
  });
  if (delFrom < 0) return tr;

  const before = tr.startState;
  const drop: { from: number; to: number }[] = [];
  for (const pair of colorSpanPairsIn(before, delFrom, delTo)) {
    const openText = before.sliceDoc(pair.open.from, pair.open.to);
    const closeText = before.sliceDoc(pair.close.from, pair.close.to);
    const open = mappedTag(tr, pair.open, openText);
    const close = mappedTag(tr, pair.close, closeText);
    if (open && close) {
      // 两个标签都还在，但中间的字被删光了：这对空标签既看不见又删不掉，一起收走
      if (!pair.empty && open.to === close.from) drop.push({ from: open.from, to: close.to });
    } else if (open && tagRemoved(tr.changes, pair.close)) {
      drop.push(open);
    } else if (close && tagRemoved(tr.changes, pair.open)) {
      drop.push(close);
    }
  }
  if (drop.length === 0) return tr;

  // 坐标已经是变更后的新文档坐标，所以要 sequential；嵌套 span 可能让外层的清理排在
  // 内层后面，ChangeSet 只认升序
  drop.sort((a, b) => a.from - b.from);
  // 外层空 span 的清理区间会把内层的整个包进去，重叠的变更 ChangeSet 直接抛错：只留不相交的
  const merged = drop.filter((d, i) => i === 0 || d.from >= drop[i - 1].to);
  return [tr, { changes: merged, sequential: true }];
});

/**
 * Prec.highest 而不是 high：要抢在 markdownKeymap 的 deleteMarkupBackward（Prec.high）前面——
 * 与 pairs.ts 同一个理由。不贴着隐藏标签时立刻返回 false，其余删除行为原样不动。
 */
export const colorSpanKeys: Extension = [
  Prec.highest(
    keymap.of([
      { key: "Backspace", run: backspaceOverTag },
      { key: "Delete", run: deleteOverTag },
    ])
  ),
  colorSpanCleanup,
];
