import { describe, expect, it, vi } from "vitest";

// Same as eachLine.test.ts: @codemirror/view reads document.documentElement.style on load
vi.hoisted(() => {
  const doc = (globalThis as { document?: { documentElement?: unknown } }).document;
  if (doc && !doc.documentElement) doc.documentElement = { style: {} };
});

import { markdown } from "@codemirror/lang-markdown";
import { EditorState } from "@codemirror/state";
import { ensureSyntaxTree, syntaxTree } from "@codemirror/language";
import type { DecorationSet, EditorView } from "@codemirror/view";
import { buildDecorations } from "@/lib/livePreview";
import { createLpContext, visibleLineRanges, type CodeRange } from "@/lib/livePreview/context";

/**
 * End-to-end clipping check for buildDecorations.
 *
 * buildDecorations only uses the view's state and visibleRanges, so a minimal fake view in node
 * can drive it (widgets' toDOM is never called, so no DOM is needed). Block-level fields (tables/math) aren't installed,
 * so renderedBlockRanges returns an empty array, equivalent to "no tables in the block" in production.
 */

/** A blockquote wrapping a nested list + a plain nested list; needs enough lines for clipping to show */
function nestedDoc(items = 200): string {
  const lines: string[] = ["# 标题", ""];
  for (let i = 1; i <= items; i++) {
    lines.push(`> - **第 ${i} 项** 带 \`code\``);
    lines.push(`>   - 子项 ${i}`);
    lines.push(`>     续行 ${i}`);
  }
  lines.push("");
  for (let i = 1; i <= items; i++) {
    lines.push(`- 列表 ${i} 有 *强调*`);
    lines.push(`  - [ ] 子任务 ${i}`);
  }
  return lines.join("\n");
}

function makeState(doc: string): EditorState {
  let state = EditorState.create({ doc, extensions: [markdown()] });
  // The syntax tree field initially parses only the first 3000 characters. ensureSyntaxTree finishes the rest,
  // but the field still holds the partial tree, and it takes an empty transaction to pick it up (only then is syntaxTree(state) complete)
  ensureSyntaxTree(state, state.doc.length, 20_000);
  state = state.update({}).state;
  return state;
}

function lineSpan(state: EditorState, first: number, last: number): CodeRange {
  return { from: state.doc.line(first).from, to: state.doc.line(last).to };
}

/** Minimal fake view: buildDecorations only looks at these two */
function fakeView(state: EditorState, visible: CodeRange[]): EditorView {
  return { state, visibleRanges: visible } as unknown as EditorView;
}

/** Decorations in the window: position + class name (replace decorations have no class, recorded as (replace)) */
function entries(set: DecorationSet, from: number, to: number): string[] {
  const out: string[] = [];
  set.between(from, to, (f, t, deco) => {
    out.push(`${f}-${t}:${(deco.spec.class as string | undefined) ?? "(replace)"}`);
  });
  return out;
}

/** Run eachLine once for each quote/list node in the viewport and count the total lines visited */
function visitedLines(
  state: EditorState,
  window: CodeRange,
  visible: CodeRange[] | undefined
): number {
  const ctx = createLpContext(state, [], visible);
  syntaxTree(state).iterate({
    from: window.from,
    to: window.to,
    enter: (node) => {
      if (node.name === "Blockquote") ctx.eachLine(node.from, node.to, () => "cm-lp-quote");
      if (node.name === "ListItem") ctx.eachLine(node.from, node.to, () => "cm-lp-li");
    },
  });
  return ctx.stats.linesVisited;
}

function count(set: DecorationSet): number {
  let n = 0;
  set.between(0, 1e9, () => {
    n++;
  });
  return n;
}

describe("buildDecorations 可见区裁剪", () => {
  const state = makeState(nestedDoc());
  const whole = lineSpan(state, 1, state.doc.lines);

  it("引用块里嵌套列表：裁剪后可见行上的装饰与全量计算逐条一致", () => {
    const window = lineSpan(state, 300, 320);
    const full = buildDecorations(fakeView(state, [whole]), []);
    const clipped = buildDecorations(fakeView(state, [window]), []);

    const got = entries(clipped.decorations, window.from, window.to);
    expect(got).toEqual(entries(full.decorations, window.from, window.to));
    expect(got.length).toBeGreaterThan(20);
    expect(got.some((e) => e.includes("cm-lp-quote"))).toBe(true);
    expect(got.some((e) => e.includes("cm-lp-li"))).toBe(true);
  });

  it("普通嵌套列表（含任务项、悬挂缩进）同样逐条一致", () => {
    const window = lineSpan(state, 700, 720);
    const full = buildDecorations(fakeView(state, [whole]), []);
    const clipped = buildDecorations(fakeView(state, [window]), []);

    const got = entries(clipped.decorations, window.from, window.to);
    expect(got).toEqual(entries(full.decorations, window.from, window.to));
    expect(got.some((e) => e.includes("cm-lp-hang"))).toBe(true);
  });

  it("两段可见区都落在同一个引用块里：每行只装饰一次，各段的结果与单独算一样", () => {
    // After each expands by 2 lines the two ranges touch exactly (322 / 323), and context merges them into one —
    // otherwise the block's line classes would be walked twice at the seam
    const a = lineSpan(state, 300, 320);
    const b = lineSpan(state, 325, 340);
    const built = buildDecorations(fakeView(state, [a, b]), []);

    const got = entries(built.decorations, a.from, b.to);
    expect(new Set(got).size).toBe(got.length);
    expect(got.filter((e) => e.includes("cm-lp-quote"))).toHaveLength(41);

    expect(entries(built.decorations, a.from, a.to)).toEqual(
      entries(buildDecorations(fakeView(state, [a]), []).decorations, a.from, a.to)
    );
    expect(entries(built.decorations, b.from, b.to)).toEqual(
      entries(buildDecorations(fakeView(state, [b]), []).decorations, b.from, b.to)
    );
  });

  it("同一个视口、同一批节点：旧行为要走整块，裁剪后只走视口那几十行", () => {
    const window = lineSpan(state, 300, 320);
    // Without visible it's the old behavior: any quote/list node in the viewport walks its whole block line by line
    expect(visitedLines(state, window, undefined)).toBe(635);
    // 25 visible lines (21-line viewport + 2 extra each side) × one pass for the quote + one pass per list item in the window
    expect(visitedLines(state, window, visibleLineRanges(state, [window]))).toBe(60);
  });

  it("只看二十行时装饰总量远小于全量", () => {
    const full = count(buildDecorations(fakeView(state, [whole]), []).decorations);
    const clipped = count(
      buildDecorations(fakeView(state, [lineSpan(state, 300, 320)]), []).decorations
    );
    // Measured: 5205 for the whole doc, 116 for just the 21-line viewport
    expect(full).toBeGreaterThan(5000);
    expect(clipped).toBeLessThan(150);
  });
});
