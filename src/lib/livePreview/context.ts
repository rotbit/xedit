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

/** 任一选区（含非空）与 [from, to] 有交叠 —— 被选中的内容必须现出原文，
    否则选区落在被隐藏的文本上，用户既看不到选了什么，也看不到光标 */
export function selectionTouches(state: EditorState, from: number, to: number): boolean {
  return state.selection.ranges.some((r) => r.to >= from && r.from <= to);
}

/** 光标落在 [from, to]（含边界）内 —— 行内语法的还原判定 */
export function caretTouches(caret: number[], from: number, to: number): boolean {
  return caret.some((p) => p >= from && p <= to);
}

/** 光标严格位于 (from, to) 内部 —— 图片/表格/公式等整体部件的还原判定。
    边界不算：上下键路过时光标只会停在边界（atomicRanges 保证），不触发还原 */
export function caretInside(caret: number[], from: number, to: number): boolean {
  return caret.some((p) => p > from && p < to);
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
  /** 隐藏一段源码（不占位） */
  hide(from: number, to: number): void;
  /** 替换为部件并登记为 atomic：光标整体跳过，路过不还原 */
  replaceAtomic(from: number, to: number, widget?: WidgetType): void;
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
  const seenLineClass = new Set<string>();

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
    hide(from, to) {
      if (from < to) decos.push(Decoration.replace({}).range(from, to));
    },
    replaceAtomic(from, to, widget) {
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
