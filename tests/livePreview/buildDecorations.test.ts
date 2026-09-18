import { describe, expect, it, vi } from "vitest";

// 同 eachLine.test.ts：@codemirror/view 加载时要读 document.documentElement.style
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
 * 整条 buildDecorations 的裁剪验收。
 *
 * buildDecorations 只用到 view 的 state 与 visibleRanges，node 环境里拿一个最小假 view
 * 就能驱动（部件的 toDOM 不会被调用，所以不需要 DOM）。块级字段（表格/公式）没装进来，
 * renderedBlockRanges 返回空数组，与线上「块里没有表格」的情形等价。
 */

/** 引用块套嵌套列表 + 一段普通嵌套列表，行数够多才看得出裁剪 */
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
  // 语法树字段初始只解析前 3000 个字符。ensureSyntaxTree 把剩下的活干完，
  // 但字段里挂着的仍是那棵半截树，还得过一道空事务才接上（syntaxTree(state) 这才是完整树）
  ensureSyntaxTree(state, state.doc.length, 20_000);
  state = state.update({}).state;
  return state;
}

function lineSpan(state: EditorState, first: number, last: number): CodeRange {
  return { from: state.doc.line(first).from, to: state.doc.line(last).to };
}

/** 最小假 view：buildDecorations 只认这两样 */
function fakeView(state: EditorState, visible: CodeRange[]): EditorView {
  return { state, visibleRanges: visible } as unknown as EditorView;
}

/** 窗口内的装饰：位置 + 类名（replace 类没有 class，记成 (replace)） */
function entries(set: DecorationSet, from: number, to: number): string[] {
  const out: string[] = [];
  set.between(from, to, (f, t, deco) => {
    out.push(`${f}-${t}:${(deco.spec.class as string | undefined) ?? "(replace)"}`);
  });
  return out;
}

/** 视口里那批引用/列表节点各自 eachLine 一趟，统计总共访问了多少行 */
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
    // 两段各向外扩 2 行后正好首尾相接（322 / 323），context 里会并成一段——
    // 不并的话整块的行级类要在接缝处走两遍
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
    // 不传 visible 就是改动前的行为：视口里随便一个引用/列表节点都把整块逐行铺一遍
    expect(visitedLines(state, window, undefined)).toBe(635);
    // 25 行可见区（21 行视口 + 各外扩 2 行）× 引用块一趟 + 窗口内各列表项一趟
    expect(visitedLines(state, window, visibleLineRanges(state, [window]))).toBe(60);
  });

  it("只看二十行时装饰总量远小于全量", () => {
    const full = count(buildDecorations(fakeView(state, [whole]), []).decorations);
    const clipped = count(
      buildDecorations(fakeView(state, [lineSpan(state, 300, 320)]), []).decorations
    );
    // 实测：整篇 5205 条，只看 21 行视口 116 条
    expect(full).toBeGreaterThan(5000);
    expect(clipped).toBeLessThan(150);
  });
});
