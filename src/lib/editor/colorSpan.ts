/**
 * 字体颜色的载体形态：Markdown 没有颜色语法，工具栏写出的是内联
 * `<span style="color:…">…</span>`（预览、公众号复制、导出链路都已放行这个形态）。
 *
 * 生成（editor/format.ts）与识别（livePreview/inline.ts）必须一字不差地对齐，
 * 所以标签拼法、匹配正则、回看窗口都收在这里，改一处即两边同步。
 *
 * 「从语法树里找出一对颜色标签」也收在这里：即时渲染据此藏标签、删除键据此跳标签、
 * 工具栏据此就地改色、事务过滤器据此收拾孤儿标签——四处判定必须是同一份，
 * 各写各的总会有一处对不上（藏起来的标签删不掉，或者删了一半剩个孤儿）。
 */

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export const COLOR_SPAN_CLOSE = "</span>";

export function colorSpanOpen(color: string): string {
  return `<span style="color:${color}">`;
}

/** 整段文字恰好就是一个开标签（捕获颜色值）——语法树里 HTMLTag 节点的整体匹配 */
export const COLOR_SPAN_OPEN_EXACT = /^<span style="color:([^"]*)">$/;

/** 文字末尾紧跟着一个开标签——选区左侧回看时用 */
export const COLOR_SPAN_OPEN_AT_END = /<span style="color:[^"]*">$/;

/** 整段文字恰好是一个完整的颜色 span（捕获内部文字） */
export const COLOR_SPAN_WRAPPED = /^<span style="color:[^"]*">([\s\S]*)<\/span>$/;

/** 向左回看多少个字符去找开标签：固定部分 `<span style="color:` + `">` 共 21 字符，
 *  余下近 40 个留给颜色值，`rgb(255 255 255 / 0.85)` 这类最长写法也装得下 */
export const COLOR_SPAN_LOOKBACK = 60;

/** 一个标签在文档里占的区间 */
export interface ColorSpanTag {
  readonly from: number;
  readonly to: number;
}

/** 配对成功的一对颜色标签 */
export interface ColorSpanPair {
  readonly open: ColorSpanTag;
  readonly close: ColorSpanTag;
  /** 开标签里写着的颜色值，原样取出（`#e11d48`、`rgb(…)` 都可能） */
  readonly color: string;
  /** 首尾标签紧挨着，中间一个字都没有 —— 这种不藏，见 livePreview/inline.ts */
  readonly empty: boolean;
}

/** 任意 `<span …>` 开标签：嵌套计数时不带颜色的 span 也得数上，否则深度会算错 */
const SPAN_OPEN_ANY = /^<span[\s>]/i;
const SPAN_CLOSE_ANY = /^<\/span\s*>$/i;

function pairOf(state: EditorState, open: SyntaxNode, close: SyntaxNode): ColorSpanPair | null {
  const color = state.sliceDoc(open.from, open.to).match(COLOR_SPAN_OPEN_EXACT);
  if (!color) return null; // 是 span 但不是工具栏写的颜色 span，不归这套逻辑管
  return {
    open: { from: open.from, to: open.to },
    close: { from: close.from, to: close.to },
    color: color[1],
    empty: close.from <= open.to,
  };
}

/** node 是颜色 span 的开标签时，往后按深度计数找配对的 `</span>`；不成对返回 null */
export function colorSpanPairFromOpen(state: EditorState, node: SyntaxNode): ColorSpanPair | null {
  if (node.name !== "HTMLTag") return null;
  if (!COLOR_SPAN_OPEN_EXACT.test(state.sliceDoc(node.from, node.to))) return null;
  let depth = 1;
  for (let sib = node.nextSibling; sib; sib = sib.nextSibling) {
    if (sib.name !== "HTMLTag") continue;
    const text = state.sliceDoc(sib.from, sib.to);
    if (SPAN_OPEN_ANY.test(text)) depth++;
    else if (SPAN_CLOSE_ANY.test(text) && --depth === 0) return pairOf(state, node, sib);
  }
  return null;
}

/** 反过来：node 是 `</span>` 时往前找配对的开标签（光标贴在闭标签上时要认出这一对） */
export function colorSpanPairFromClose(state: EditorState, node: SyntaxNode): ColorSpanPair | null {
  if (node.name !== "HTMLTag") return null;
  if (!SPAN_CLOSE_ANY.test(state.sliceDoc(node.from, node.to))) return null;
  let depth = 1;
  for (let sib = node.prevSibling; sib; sib = sib.prevSibling) {
    if (sib.name !== "HTMLTag") continue;
    const text = state.sliceDoc(sib.from, sib.to);
    if (SPAN_CLOSE_ANY.test(text)) depth++;
    else if (SPAN_OPEN_ANY.test(text) && --depth === 0) return pairOf(state, sib, node);
  }
  return null;
}

/**
 * 把 [from, to] 放宽到所在的顶层块（段落、列表项、标题…）。
 * 一对颜色标签必在同一个块里，可开标签往往在变更点左边好几行（跨行的段落），
 * 只按变更区间去 iterate 会漏掉它；放宽到整块既扫得全，又不必每次遍历全文。
 */
function blockRange(state: EditorState, from: number, to: number): [number, number] {
  const tree = syntaxTree(state);
  let start = state.doc.lineAt(from).from;
  let end = state.doc.lineAt(to).to;
  for (const [pos, side] of [
    [from, -1],
    [to, 1],
  ] as const) {
    let top: SyntaxNode | null = null;
    for (let n: SyntaxNode | null = tree.resolveInner(pos, side); n?.parent; n = n.parent) top = n;
    if (!top) continue;
    start = Math.min(start, top.from);
    end = Math.max(end, top.to);
  }
  return [start, end];
}

/** [from, to] 附近所有配对成功的颜色 span（按开标签位置升序） */
export function colorSpanPairsIn(state: EditorState, from: number, to: number): ColorSpanPair[] {
  const len = state.doc.length;
  const [start, end] = blockRange(state, Math.max(0, Math.min(from, len)), Math.max(0, Math.min(to, len)));
  const pairs: ColorSpanPair[] = [];
  syntaxTree(state).iterate({
    from: start,
    to: end,
    enter: (node) => {
      if (node.name !== "HTMLTag") return;
      const pair = colorSpanPairFromOpen(state, node.node);
      if (pair) pairs.push(pair);
    },
  });
  return pairs;
}

/**
 * pos 紧贴着的那个「即时渲染下藏起来的颜色标签」；dir=-1 看左边、1 看右边，没有则 null。
 * 判定走的是与 livePreview/inline.ts 同一套配对函数：那边藏什么，删除键就跳什么。
 *
 * 注意 HTMLTag 是有子节点的（`<span …>` 里还嵌着 StartTag/TagName/EndTag），
 * resolveInner 交回来的是最里层的那个子节点，得往上走到 HTMLTag 才谈得上边界。
 */
export function hiddenColorTagAt(
  state: EditorState,
  pos: number,
  dir: -1 | 1
): ColorSpanTag | null {
  let node: SyntaxNode | null = syntaxTree(state).resolveInner(pos, dir);
  while (node && node.name !== "HTMLTag") node = node.parent;
  if (!node) return null;
  if (dir < 0 ? node.to !== pos : node.from !== pos) return null;
  const pair = colorSpanPairFromOpen(state, node) ?? colorSpanPairFromClose(state, node);
  // 空 span 是原样露着的（见 inline.ts），按字符删才对
  if (!pair || pair.empty) return null;
  return { from: node.from, to: node.to };
}

/** 从 pos 往 dir 方向连着跳过隐藏标签，停在第一个真实字符处。
    `</span><span …>` 这种首尾相接的两对标签要一口气跳完，否则删除键会卡在中间 */
export function skipHiddenColorTags(state: EditorState, pos: number, dir: -1 | 1): number {
  let at = pos;
  for (let tag = hiddenColorTagAt(state, at, dir); tag; tag = hiddenColorTagAt(state, at, dir)) {
    at = dir < 0 ? tag.from : tag.to;
  }
  return at;
}

/** pos 落在哪个颜色 span 的文字里（含紧贴标签内侧的两个边界）；嵌套时取最里面那一层 */
export function colorSpanPairAt(state: EditorState, pos: number): ColorSpanPair | null {
  let hit: ColorSpanPair | null = null;
  for (const pair of colorSpanPairsIn(state, pos, pos)) {
    if (pair.open.to > pos || pos > pair.close.from) continue;
    if (!hit || pair.open.from > hit.open.from) hit = pair;
  }
  return hit;
}
