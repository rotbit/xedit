import type { SyntaxNode } from "@lezer/common";
import { syntaxTree } from "@codemirror/language";
import { Decoration, type WidgetType } from "@codemirror/view";
import { StateEffect, type EditorState, type Range } from "@codemirror/state";

/**
 * 即时渲染的共用判定与装饰收集器。
 *
 * 装饰分两条通路：行内/行级的走视图插件（livePreview/index.ts），跨行替换（表格、块级公式）
 * 只能走状态字段（CodeMirror 禁止插件提供跨行 replace）。两边必须共用同一套光标/选区
 * 规则，否则同一次移动会得到互相矛盾的还原结果，所以判定函数集中放这里。
 */

/** 用轻量 effect 触发一次装饰重算（鼠标点击收尾、MathJax 异步就绪时使用）。 */
export const refreshLivePreview = StateEffect.define<null>();

/** 光标位置集合（仅空选区）：节点级还原的判定依据 */
export function caretPositions(state: EditorState): number[] {
  return state.selection.ranges.filter((r) => r.empty).map((r) => r.head);
}

export function hasTextSelection(state: EditorState): boolean {
  return state.selection.ranges.some((range) => !range.empty);
}

/** 光标是否落在围栏代码块内（含两侧边界行）。
    两个用处共用同一份判定：即时渲染据此换浅色光标；斜杠菜单据此拒绝触发——
    代码里敲 `/` 是路径、正则、注释，弹菜单只会碍事 */
export function caretInFencedCode(state: EditorState): boolean {
  const pos = state.selection.main.head;
  for (const side of [-1, 1] as const) {
    let n: SyntaxNode | null = syntaxTree(state).resolveInner(pos, side);
    for (; n; n = n.parent) if (n.name === "FencedCode") return true;
  }
  return false;
}

/** 任一选区（含非空）与 [from, to] 有交叠 —— 行级标记（#、>、围栏行）的还原判定。
    行级标记现出时是零宽悬挂盒或等宽替换，不推动正文，所以可以大方地跟着选区走：
    选到哪一行就让那行的记号露出来，用户看得见自己选中/将要复制的是什么。
    块级部件（表格/公式/图片）不用这一档 —— 它们现出源码是整块的高度变化，
    ⌘A 或拖选一过全篇就炸开，见 blocks.ts 的 renderable */
export function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

/** 有非空选区整个落在 (from, to) 内部 —— 块级部件「已经展开着、正在里面选文字」的判定。
    必须严格内部：拖选扫过一整块时 atomicRanges 会把选区两端对齐到 from/to，
    含边界就会把「从外面拖过整块」也认成「在里面选」，整块当场炸成源码 */
export function selectionInside(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => !r.empty && r.from > from && r.to < to);
}

/** 光标落在 [from, to]（含边界）内 —— 行内语法与整体部件（图片/视频/分割线/表格/公式）
    共用的还原判定。边界必须算数：点开源码后光标挪到区间两端（行首、`)` 之后、`---` 末尾）
    就正好踩在边界上，用严格内部判定会当场翻回部件，在同一行里移动光标就成了来回闪。
    只认光标不认选区：拖选/全选时每个部件都多出几行源码，版面会整体抖一下 */
export function caretTouches(caret: number[], from: number, to: number): boolean {
  return caret.some((p) => p >= from && p <= to);
}

/** 光标落在 [from, to) 内（含左边界、不含右边界）—— 任务记号 `[ ]` 的还原判定。
    右边界（`]` 之后）是从正文首字按 ← 过来的落点，也是最常停的位置，含进来的话
    复选框一按左键就翻成 `[x]` 文字；左边界是从行首往右走进记号的入口，得能现出源码改 */
export function caretAtStartOrInside(caret: number[], from: number, to: number): boolean {
  return caret.some((p) => p >= from && p < to);
}

export interface CodeRange {
  from: number;
  to: number;
}

/** 位置是否落在任一围栏代码块里 */
export function inCodeRanges(ranges: CodeRange[], pos: number): boolean {
  return ranges.some((r) => pos >= r.from && pos <= r.to);
}

export interface LpContext {
  readonly state: EditorState;
  readonly caret: number[];
  readonly decos: Range<Decoration>[];
  readonly atomics: Range<Decoration>[];
  /** 本次收集到的围栏代码块区间：逐行扫描（空行、公式）要跳过它们 */
  readonly codeRanges: CodeRange[];
  /** 本次扫出的行内公式区间（见 inlineMath.ts）：里面的字符是 TeX，不再当 Markdown 标记 */
  readonly mathRanges: CodeRange[];
  /** 隐藏一段源码（不占位） */
  hide(from: number, to: number): void;
  /** 替换为部件并登记为 atomic：光标整体跳过，路过不还原 */
  replaceAtomic(from: number, to: number, widget?: WidgetType): void;
  /** 这一段是否落在行内公式里 —— hide/replaceAtomic 会默默拒绝这种区间（见下方 inMath）。
      要「几段一起藏、要藏就全藏」的地方（颜色 span 的首尾标签）得先问一句再动手，
      否则只藏住一头，另一头孤零零地露在正文里 */
  inMath(from: number, to: number): boolean;
  /** 给 pos 所在行加行级类；同行同类只加一次（嵌套结构会重复命中） */
  lineClass(pos: number, cls: string): void;
  /** [from, to] 覆盖的每一行都加行级类 */
  eachLine(from: number, to: number, cls: (n: number, first: number, last: number) => string): void;
  /** 光标或选区落在 pos 所在行 —— 行首标记（#、>）的还原判定 */
  lineActive(pos: number): boolean;
}

export function createLpContext(state: EditorState, caret: number[]): LpContext {
  const decos: Range<Decoration>[] = [];
  const atomics: Range<Decoration>[] = [];
  const codeRanges: CodeRange[] = [];
  const mathRanges: CodeRange[] = [];
  const seenLineClass = new Set<string>();

  /** 与已登记的行内公式区间相交。公式是先于语法树那一趟扫出来的，`$a*b*c$` 里的 `*`
      是 TeX 的一部分：被当成强调标记藏掉的话，一来源码看不见也删不动，二来两条 replace
      叠在同一段上 CodeMirror 直接抛错。所以所有替换类装饰都得先过这一关 */
  const inMath = (from: number, to: number) =>
    mathRanges.some((r) => from < r.to && to > r.from);

  const lineClass = (pos: number, cls: string) => {
    const line = state.doc.lineAt(pos);
    const key = `${line.from}:${cls}`;
    if (seenLineClass.has(key)) return;
    seenLineClass.add(key);
    decos.push(Decoration.line({ class: cls }).range(line.from));
  };

  return {
    state,
    caret,
    decos,
    atomics,
    codeRanges,
    mathRanges,
    hide(from, to) {
      if (from < to && !inMath(from, to)) decos.push(Decoration.replace({}).range(from, to));
    },
    inMath,
    replaceAtomic(from, to, widget) {
      if (inMath(from, to)) return;
      const deco = Decoration.replace(widget ? { widget } : {}).range(from, to);
      decos.push(deco);
      atomics.push(deco);
    },
    lineClass,
    eachLine(from, to, cls) {
      const first = state.doc.lineAt(from).number;
      const last = state.doc.lineAt(to).number;
      for (let n = first; n <= last; n++) lineClass(state.doc.line(n).from, cls(n, first, last));
    },
    lineActive(pos) {
      const line = state.doc.lineAt(pos);
      return caretTouches(caret, line.from, line.to) || selectionTouches(state, line.from, line.to);
    },
  };
}
