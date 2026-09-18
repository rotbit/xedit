import { describe, expect, it, vi } from "vitest";

// @codemirror/view 模块加载时就要读 document.documentElement.style 做浏览器探测，
// node 环境的最小 document 桩里没有这一层，必须赶在 import 之前补上
vi.hoisted(() => {
  const doc = (globalThis as { document?: { documentElement?: unknown } }).document;
  if (doc && !doc.documentElement) doc.documentElement = { style: {} };
});

import { markdown } from "@codemirror/lang-markdown";
import { EditorState, type Range } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { Decoration } from "@codemirror/view";
import type { SyntaxNode } from "@lezer/common";
import { createLpContext, visibleLineRanges, type CodeRange } from "@/lib/livePreview/context";
import { fencedCodeDecorations } from "@/lib/livePreview/fence";

/**
 * eachLine 的可见区裁剪：一个三千行的代码块只要有一行落进视口，以前就得逐行铺三千条
 * 行级装饰，光标每动一下全部重来。这里守两条线：访问行数被限制在可见区内，
 * 以及 first/last 仍按块的真实首末行判定（滚到中段时中间行不能顶着圆角当块首画）。
 */

/** 三千行围栏代码块：首行 ```js、末行 ```、中间全是代码 */
function fencedDoc(total = 3000): string {
  const body = Array.from({ length: total - 2 }, (_, i) => `const v${i + 1} = ${i + 1};`);
  return ["```js", ...body, "```"].join("\n");
}

function makeState(doc: string): EditorState {
  let state = EditorState.create({ doc, extensions: [markdown()] });
  // 语法树字段初始只解析前 3000 个字符。ensureSyntaxTree 把剩下的活干完，
  // 但字段里挂着的仍是那棵半截树，还得过一道空事务才接上（syntaxTree(state) 这才是完整树）
  ensureSyntaxTree(state, state.doc.length, 20_000);
  state = state.update({}).state;
  return state;
}

/** 第 first 行行首到第 last 行行尾的位置区间 —— 冒充 view.visibleRanges 的一段 */
function lineSpan(state: EditorState, first: number, last: number): CodeRange {
  return { from: state.doc.line(first).from, to: state.doc.line(last).to };
}

function firstFencedNode(state: EditorState): SyntaxNode {
  const found: SyntaxNode[] = [];
  syntaxTree(state).iterate({
    enter: (node) => {
      if (node.name === "FencedCode") found.push(node.node);
    },
  });
  if (found.length === 0) throw new Error("语法树里没有 FencedCode");
  return found[0];
}

/** 行号 → 该行拿到的行级类（Decoration.line 的区间零宽、带 class） */
function lineClassMap(state: EditorState, decos: Range<Decoration>[]): Map<number, string[]> {
  const map = new Map<number, string[]>();
  for (const deco of decos) {
    const cls = deco.value.spec.class as string | undefined;
    if (!cls || deco.from !== deco.to) continue;
    const n = state.doc.lineAt(deco.from).number;
    map.set(n, [...(map.get(n) ?? []), cls]);
  }
  return map;
}

describe("eachLine 可见区裁剪", () => {
  it("三千行代码块只画可见的五十几行，first/last 仍指向真实首末行", () => {
    const state = makeState(fencedDoc());
    const node = firstFencedNode(state);
    const ctx = createLpContext(state, [], visibleLineRanges(state, [lineSpan(state, 1000, 1050)]));

    const seen: Array<{ n: number; first: number; last: number }> = [];
    const visited = ctx.eachLine(node.from, node.to, (n, first, last) => {
      seen.push({ n, first, last });
      return "cm-lp-code";
    });

    // 1000–1050 共 51 行，各向外扩 2 行 = 55 行（改动前是整块 3000 行）
    expect(visited).toBe(55);
    expect(ctx.stats.linesVisited).toBe(55);
    expect(seen[0].n).toBe(998);
    expect(seen[seen.length - 1].n).toBe(1052);
    // 块的真实首末行号照旧下发，可见区里一行都不是首行/末行
    expect(seen.every((s) => s.first === 1 && s.last === 3000)).toBe(true);
    expect(seen.some((s) => s.n === s.first || s.n === s.last)).toBe(false);
  });

  it("裁剪后的中段全是 mid 类，没有 first/last 类漏出来", () => {
    const state = makeState(fencedDoc());
    const ctx = createLpContext(state, [], visibleLineRanges(state, [lineSpan(state, 1000, 1050)]));
    fencedCodeDecorations(ctx, firstFencedNode(state));

    const classes = lineClassMap(state, ctx.decos);
    // 55 行可见区，外加闭栏行那条常驻的 cm-lp-code-close：它按真实末行挂，与可见区无关
    expect(classes.size).toBe(56);
    expect(classes.get(3000)).toEqual(["cm-lp-code-close"]);
    const mids = [...classes].filter(([n]) => n !== 3000);
    expect(mids).toHaveLength(55);
    expect(mids.every(([, list]) => list.join(" ") === "cm-lp-code cm-lp-code-mid")).toBe(true);
  });

  it("可见区盖住块首/块尾时，首行 first、末行 last 照旧成立", () => {
    const state = makeState(fencedDoc());

    const head = createLpContext(state, [], visibleLineRanges(state, [lineSpan(state, 1, 20)]));
    fencedCodeDecorations(head, firstFencedNode(state));
    const headClasses = lineClassMap(state, head.decos);
    expect(headClasses.get(1)).toEqual(["cm-lp-code cm-lp-code-first"]);
    expect(headClasses.get(2)).toEqual(["cm-lp-code cm-lp-code-mid"]);
    // 末行在视口外：块级底色不画了，只剩与可见区无关的那条闭栏行内边距
    expect(headClasses.get(3000)).toEqual(["cm-lp-code-close"]);

    const tail = createLpContext(state, [], visibleLineRanges(state, [lineSpan(state, 2985, 3000)]));
    fencedCodeDecorations(tail, firstFencedNode(state));
    const tailClasses = lineClassMap(state, tail.decos);
    // 闭栏行另有一个常驻的 cm-lp-code-close（压成块底内边距），与裁剪无关
    expect(tailClasses.get(3000)).toEqual(["cm-lp-code cm-lp-code-last", "cm-lp-code-close"]);
    expect(tailClasses.has(1)).toBe(false);
  });

  it("两段可见区落在同一块里时，交叠处的行只装饰一次", () => {
    const state = makeState(fencedDoc());
    const node = firstFencedNode(state);
    const visible = visibleLineRanges(state, [
      lineSpan(state, 1000, 1010),
      lineSpan(state, 1005, 1020),
    ]);
    const ctx = createLpContext(state, [], visible);

    const seen: number[] = [];
    const visited = ctx.eachLine(node.from, node.to, (n) => {
      seen.push(n);
      return "cm-lp-code";
    });

    // 998–1022 归并成一段，既不重复遍历也不重复装饰
    expect(visited).toBe(25);
    expect(new Set(seen).size).toBe(seen.length);
    expect(lineClassMap(state, ctx.decos).size).toBe(25);
    expect(ctx.decos.length).toBe(25);
  });

  it("两段可见区互不相邻时各画各的，中间的行一行不碰", () => {
    const state = makeState(fencedDoc());
    const node = firstFencedNode(state);
    const visible = visibleLineRanges(state, [
      lineSpan(state, 1000, 1010),
      lineSpan(state, 2000, 2010),
    ]);
    const ctx = createLpContext(state, [], visible);
    const seen: number[] = [];
    ctx.eachLine(node.from, node.to, (n) => {
      seen.push(n);
      return "cm-lp-code";
    });

    expect(seen.length).toBe(30);
    expect(new Set(seen).size).toBe(30);
    expect(seen.some((n) => n > 1012 && n < 1998)).toBe(false);
  });

  it("光标停在视口外的开栏行（API 移光标）：照旧按 lineActive 现出源码，不受裁剪影响", () => {
    const state = makeState(fencedDoc());
    const node = firstFencedNode(state);
    const caret = [state.doc.line(1).from];
    const ctx = createLpContext(state, caret, visibleLineRanges(state, [lineSpan(state, 1000, 1050)]));
    fencedCodeDecorations(ctx, node);

    // 开栏行 lineActive 为真 → 不换标题条部件，``` 原样留着（与可见区无关）
    expect(ctx.lineActive(state.doc.line(1).from)).toBe(true);
    expect(ctx.atomics.some((deco) => deco.from === state.doc.line(1).from)).toBe(false);
    // 可见区里的行照画不误
    expect(ctx.stats.linesVisited).toBe(55);
  });

  it("不传 visible 时仍是旧行为：整块逐行", () => {
    const state = makeState(fencedDoc());
    const node = firstFencedNode(state);
    const ctx = createLpContext(state, []);

    const visited = ctx.eachLine(node.from, node.to, (n, first, last) =>
      n === first ? "first" : n === last ? "last" : "mid"
    );

    expect(visited).toBe(3000);
    expect(ctx.stats.linesVisited).toBe(3000);
    const classes = lineClassMap(state, ctx.decos);
    expect(classes.size).toBe(3000);
    expect(classes.get(1)).toEqual(["first"]);
    expect(classes.get(1500)).toEqual(["mid"]);
    expect(classes.get(3000)).toEqual(["last"]);
  });

  it("可见区盖住整篇时裁不掉任何行，与旧行为一致", () => {
    const state = makeState(fencedDoc());
    const node = firstFencedNode(state);
    const all = createLpContext(state, [], visibleLineRanges(state, [lineSpan(state, 1, 3000)]));
    const cls = (n: number, first: number, last: number) =>
      n === first ? "first" : n === last ? "last" : "mid";

    expect(all.eachLine(node.from, node.to, cls)).toBe(3000);
    const full = createLpContext(state, []);
    full.eachLine(node.from, node.to, cls);
    expect(lineClassMap(state, all.decos)).toEqual(lineClassMap(state, full.decos));
  });
});
