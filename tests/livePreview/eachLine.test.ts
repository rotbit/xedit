import { describe, expect, it, vi } from "vitest";

// @codemirror/view reads document.documentElement.style at module load for browser detection,
// and the minimal document stub in node lacks it, so it must be patched in before the import
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
 * Visible-range clipping in eachLine: as soon as one line of a 3000-line code block entered the viewport, we used to lay down 3000
 * line decorations, all redone on every cursor move. Two guarantees here: lines visited are limited to the visible range,
 * and first/last are still judged by the block's real first and last lines (scrolled to the middle, a middle line mustn't get the rounded corners of a block start).
 */

/** 3000-line fenced code block: first line ```js, last line ```, all code in between */
function fencedDoc(total = 3000): string {
  const body = Array.from({ length: total - 2 }, (_, i) => `const v${i + 1} = ${i + 1};`);
  return ["```js", ...body, "```"].join("\n");
}

function makeState(doc: string): EditorState {
  let state = EditorState.create({ doc, extensions: [markdown()] });
  // The syntax tree field initially parses only the first 3000 characters. ensureSyntaxTree finishes the rest,
  // but the field still holds the partial tree, and it takes an empty transaction to pick it up (only then is syntaxTree(state) complete)
  ensureSyntaxTree(state, state.doc.length, 20_000);
  state = state.update({}).state;
  return state;
}

/** Position range from the start of line first to the end of line last — posing as one entry of view.visibleRanges */
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

/** Line number → line classes it received (Decoration.line ranges are zero-width with a class) */
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

    // 1000–1050 is 51 lines, plus 2 on each side = 55 lines (previously the whole 3000-line block)
    expect(visited).toBe(55);
    expect(ctx.stats.linesVisited).toBe(55);
    expect(seen[0].n).toBe(998);
    expect(seen[seen.length - 1].n).toBe(1052);
    // The block's real first/last line numbers are still passed down; no line in the visible range is first/last
    expect(seen.every((s) => s.first === 1 && s.last === 3000)).toBe(true);
    expect(seen.some((s) => s.n === s.first || s.n === s.last)).toBe(false);
  });

  it("裁剪后的中段全是 mid 类，没有 first/last 类漏出来", () => {
    const state = makeState(fencedDoc());
    const ctx = createLpContext(state, [], visibleLineRanges(state, [lineSpan(state, 1000, 1050)]));
    fencedCodeDecorations(ctx, firstFencedNode(state));

    const classes = lineClassMap(state, ctx.decos);
    // 55 visible lines, plus the always-present cm-lp-code-close on the closing fence line: it's attached by the real last line, independent of the visible range
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
    // Last line is outside the viewport: block background isn't drawn, leaving only the closing-line padding, which doesn't depend on the visible range
    expect(headClasses.get(3000)).toEqual(["cm-lp-code-close"]);

    const tail = createLpContext(state, [], visibleLineRanges(state, [lineSpan(state, 2985, 3000)]));
    fencedCodeDecorations(tail, firstFencedNode(state));
    const tailClasses = lineClassMap(state, tail.decos);
    // The closing fence line has its own always-present cm-lp-code-close (block bottom padding), unrelated to clipping
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

    // 998–1022 merge into one range, with no duplicate traversal or decoration
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

    // lineActive is true on the opening fence line → the header bar widget isn't swapped in and ``` stays as-is (independent of the visible range)
    expect(ctx.lineActive(state.doc.line(1).from)).toBe(true);
    expect(ctx.atomics.some((deco) => deco.from === state.doc.line(1).from)).toBe(false);
    // Lines in the visible range are still drawn correctly
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
