import { syntaxTree } from "@codemirror/language";
import { Prec, type EditorState, type Extension, type Line } from "@codemirror/state";
import { EditorView, keymap } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";

/**
 * 围栏代码块在即时渲染下的删除按键。
 *
 * 起因：开栏行被换成语言下拉、闭栏行被整行隐藏，两者都是 atomic 范围。默认的
 * Backspace / Delete 跨过 atomic 边界时照样按字符删，删掉的是看不见的 ```，
 * 结果要么块散架、要么把后面整篇正文吞进代码块。
 *
 * 对策：在围栏的进出口把删除键接管过来 —— 不许跨围栏合并（吞掉按键），改成先把
 * 光标送到该去的位置；只有「整块内容已空」这一种情形才真的动文档，直接删掉整块。
 * 优先级 Prec.high：高于默认按键表，低于斜杠菜单的 Prec.highest（菜单开着时
 * 它自己不碰删除键，两者互不打架）。整个扩展挂在 livePreview 上，源码模式不生效。
 */

export interface FencedBlock {
  readonly node: SyntaxNode;
  /** 开栏行（```lang） */
  readonly firstLine: Line;
  /** 闭栏行（```）；未闭合的块为 null */
  readonly lastLine: Line | null;
  /** 内容区起点：第一内容行行首；没有内容行时退化为开栏行行尾 */
  readonly contentFrom: number;
  /** 内容区终点：最后一个内容行行尾 */
  readonly contentTo: number;
  readonly closed: boolean;
}

function clampPos(state: EditorState, pos: number): number {
  return Math.max(0, Math.min(state.doc.length, pos));
}

/** pos 所在的围栏代码块；不在块内（含边界行）时返回 null */
export function fencedCodeAt(
  state: EditorState,
  pos: number,
  side: -1 | 0 | 1 = 0
): FencedBlock | null {
  const at = clampPos(state, pos);
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(at, side);
  for (; node; node = node.parent) if (node.name === "FencedCode") break;
  if (!node) return null;

  const firstLine = state.doc.lineAt(clampPos(state, node.from));
  const marks = node.getChildren("CodeMark");
  let lastLine: Line | null =
    marks.length >= 2 ? state.doc.lineAt(clampPos(state, marks[marks.length - 1].from)) : null;
  // 单行 ```（开栏与闭栏落在同一行）不算闭合，否则内容区会算出负区间
  if (lastLine && lastLine.number <= firstLine.number) lastLine = null;

  const endLine = lastLine ?? state.doc.lineAt(clampPos(state, node.to));
  // 光标虽然解析进了这个节点，但落在块的边界之外（比如闭栏行的换行符之后）时不算命中
  if (at < firstLine.from || at > endLine.to) return null;

  const hasContent = lastLine
    ? lastLine.number > firstLine.number + 1
    : endLine.number > firstLine.number;
  const contentFrom = hasContent ? clampPos(state, firstLine.to + 1) : firstLine.to;
  const rawTo = lastLine ? lastLine.from - 1 : node.to;
  const contentTo = Math.max(contentFrom, clampPos(state, rawTo));

  return { node, firstLine, lastLine, contentFrom, contentTo, closed: lastLine !== null };
}

/** 内容区全是空白（或压根没有内容行） */
export function isContentEmpty(state: EditorState, block: FencedBlock): boolean {
  if (block.contentTo <= block.contentFrom) return true;
  return state.sliceDoc(block.contentFrom, block.contentTo).trim().length === 0;
}

/** 删掉整块（连同一个相邻换行，免得原地留下一条空行）；导出给开栏行的删除按钮复用 */
export function deleteFencedBlock(view: EditorView, block: FencedBlock): void {
  const { state } = view;
  const len = state.doc.length;
  let from = clampPos(state, block.firstLine.from);
  let to = clampPos(state, block.lastLine ? block.lastLine.to : block.node.to);
  if (to < len && state.sliceDoc(to, to + 1) === "\n") to += 1;
  else if (from > 0 && state.sliceDoc(from - 1, from) === "\n") from -= 1;

  view.dispatch({
    changes: { from, to },
    selection: { anchor: Math.max(0, Math.min(from, len - (to - from))) },
    userEvent: "delete",
    scrollIntoView: true,
  });
}

/** 两侧都试一次：光标停在围栏边界时，单一 side 可能解析到块外的兄弟节点 */
function fenceAt(state: EditorState, pos: number): FencedBlock | null {
  return fencedCodeAt(state, pos, -1) ?? fencedCodeAt(state, pos, 1);
}

/** pos 是否落在内容行上（开栏行、闭栏行不算） */
function onContentLine(state: EditorState, block: FencedBlock, pos: number): boolean {
  const line = state.doc.lineAt(clampPos(state, pos));
  if (line.number <= block.firstLine.number) return false;
  return block.lastLine ? line.number < block.lastLine.number : true;
}

/** 只移动光标、不动文档 */
function moveCaret(view: EditorView, pos: number): true {
  view.dispatch({
    selection: { anchor: clampPos(view.state, pos) },
    scrollIntoView: true,
  });
  return true;
}

/** 光标在块外、但紧贴着某个块的那一侧时，把该块取出来（dir: -1 看上一行，1 看下一行） */
function adjacentFence(state: EditorState, line: Line, dir: -1 | 1): FencedBlock | null {
  const n = line.number + dir;
  if (n < 1 || n > state.doc.lines) return null;
  const neighbor = state.doc.line(n);
  const block = fencedCodeAt(state, neighbor.from, 1);
  if (!block) return null;
  if (dir === -1) return block.lastLine?.number === neighbor.number ? block : null;
  return block.firstLine.number === neighbor.number ? block : null;
}

function handleBackspace(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  const pos = range.head;
  const line = state.doc.lineAt(pos);
  const block = fenceAt(state, pos);

  if (block) {
    // 1) 内容已经空了：整块留着只是垃圾，一次删干净
    if (onContentLine(state, block, pos) && isContentEmpty(state, block)) {
      deleteFencedBlock(view, block);
      return true;
    }
    // 2) 第一内容行行首：默认行为会把首行代码并进开栏行，直接吞掉
    if (pos === block.contentFrom && !isContentEmpty(state, block)) return true;
    // 3) 闭栏行行首：闭栏行是隐藏的，往上退一行行尾（回到最后一个内容行）
    if (block.lastLine && pos === block.lastLine.from) {
      return moveCaret(view, state.doc.line(block.lastLine.number - 1).to);
    }
    // 4) 开栏行行首：不许和上一行合并，只把光标送到上一行行尾
    if (pos === block.firstLine.from && line.number > 1) {
      return moveCaret(view, state.doc.line(line.number - 1).to);
    }
    return false;
  }

  // 5) 紧跟闭栏行的下一行行首：空行就顺手删掉，光标一律落回块内最后一个内容行行尾
  const above = pos === line.from ? adjacentFence(state, line, -1) : null;
  if (above) {
    if (line.length === 0 && line.from > 0) {
      view.dispatch({
        changes: { from: line.from - 1, to: line.to },
        selection: { anchor: clampPos(state, above.contentTo) },
        userEvent: "delete",
        scrollIntoView: true,
      });
      return true;
    }
    return moveCaret(view, above.contentTo);
  }
  return false;
}

function handleDelete(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  if (!range.empty) return false;
  const pos = range.head;
  const line = state.doc.lineAt(pos);
  const block = fenceAt(state, pos);

  if (block) {
    // 1) 内容已经空了：整块删掉
    if (onContentLine(state, block, pos) && isContentEmpty(state, block)) {
      deleteFencedBlock(view, block);
      return true;
    }
    // 2) 最后一个内容行行尾：再往后就是闭栏行，吞掉
    if (pos === block.contentTo && !isContentEmpty(state, block)) return true;
    // 3) 开栏行行尾：正向删会把第一行代码吸上来，吞掉
    if (pos === block.firstLine.to) return true;
    // 4) 闭栏行行尾：跳到块外的下一行行首，别把后文吸进代码块
    if (block.lastLine && pos === block.lastLine.to && block.lastLine.number < state.doc.lines) {
      return moveCaret(view, state.doc.line(block.lastLine.number + 1).from);
    }
    return false;
  }

  // 5) 紧邻开栏行的上一行行尾：光标进块，落到第一内容行行首
  const below = pos === line.to ? adjacentFence(state, line, 1) : null;
  if (below) return moveCaret(view, below.contentFrom);
  return false;
}

/** 块内全选先只选内容区：⌘A → Backspace → Backspace 三步删掉整块 */
function handleSelectAll(view: EditorView): boolean {
  const { state } = view;
  const range = state.selection.main;
  // 已经全选整篇：再收缩回代码块只会像是全选失效（连按两下 ⌘A 的常见手势）
  if (range.from === 0 && range.to === state.doc.length) return false;
  const block = fenceAt(state, range.head);
  if (!block) return false;
  const { contentFrom, contentTo } = block;
  if (range.head < contentFrom || range.head > contentTo) return false;
  if (range.from === contentFrom && range.to === contentTo) return false;
  view.dispatch({
    selection: { anchor: contentFrom, head: contentTo },
    scrollIntoView: true,
  });
  return true;
}

export const fenceKeymap: Extension = Prec.high(
  keymap.of([
    { key: "Backspace", run: handleBackspace },
    { key: "Delete", run: handleDelete },
    { key: "Mod-a", run: handleSelectAll },
  ])
);
