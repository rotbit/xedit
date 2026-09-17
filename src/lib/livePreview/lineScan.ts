import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { blockGuardRanges } from "@/lib/livePreview/blocks";
import type { CodeRange } from "@/lib/livePreview/context";

/**
 * 行内公式（$…$）与脚注定义行（[^id]: …）共用的「按行读原文」通道。
 *
 * 为什么不走语法树：lezer 的 markdown 解析器压根不认 `$`；脚注定义行也只有在内容
 * 恰好是个不含空格的词时才会被解析成 LinkReference，写成 `[^1]: 一段 说明` 就是普通段落。
 * 两样东西都只能自己扫文本。
 *
 * 扫文本就得自己划出「这里的字符不作数」的区间，否则代码块里的 `$` 会被当成公式定界符。
 * 区间分两档，因为两个功能要跳过的东西不一样：
 * - block：代码块、HTML 块，以及块级字段已经认领的表格/$$/frontmatter。两边都跳过。
 * - inline：行内代码、链接、图片、URL 这些已有归属的行内结构。只有公式跳过——
 *   脚注定义行行首那个 `[^id]` 本身就会被 lezer 当成 Link，拿这一档去挡就把自己挡没了。
 *
 * 成本上守两条线：只走 view.visibleRanges；可见文本里连 `$` 和 `[^` 都没有时直接收工，
 * 连语法树都不遍历（绝大多数文档是这种情况）。
 */

/** 会把内部字符整段带走的块级结构（进去了就不必再往里走） */
const BLOCK_NODES = new Set([
  "FencedCode",
  "CodeBlock",
  "CodeText",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstruction",
]);

/** 已有归属的行内结构。Link/Image 整段算数：`![$a$](x)` 里的 `$` 是图片说明的一部分，
    认成公式的话公式部件与图片部件会叠在同一段上（两条 replace 重叠，CodeMirror 直接抛错） */
const INLINE_NODES = new Set([
  "InlineCode",
  "HTMLTag",
  "Comment",
  "URL",
  "LinkTitle",
  "Link",
  "Image",
  "WikiLink",
  "Autolink",
]);

export interface ScanLine {
  /** 行首在文档中的偏移，行内匹配到的下标加上它就是文档坐标 */
  from: number;
  text: string;
}

export interface ScanGuards {
  /** 与代码块/HTML/已成块的区间相交 */
  inBlock(from: number, to: number): boolean;
  /** 与行内代码/链接/图片/URL 相交 */
  inInline(from: number, to: number): boolean;
}

function overlaps(ranges: CodeRange[], from: number, to: number): boolean {
  return ranges.some((r) => from < r.to && to > r.from);
}

function collectGuards(state: EditorState, view: EditorView): ScanGuards {
  const visibleFrom = view.visibleRanges[0]?.from ?? 0;
  const visibleTo = view.visibleRanges[view.visibleRanges.length - 1]?.to ?? 0;
  // 块级那份是全文的，先裁到可见范围：后面每个候选字符都要拿它过一遍，
  // 长文里几百个代码块全留着就是白跑几百次比较
  const block = blockGuardRanges(state).filter((r) => r.from <= visibleTo && r.to >= visibleFrom);
  const inline: CodeRange[] = [];
  for (const range of view.visibleRanges) {
    syntaxTree(state).iterate({
      from: range.from,
      to: range.to,
      enter: (node) => {
        if (BLOCK_NODES.has(node.name)) {
          block.push({ from: node.from, to: node.to });
          return false;
        }
        if (INLINE_NODES.has(node.name)) {
          inline.push({ from: node.from, to: node.to });
          return false;
        }
        return undefined;
      },
    });
  }
  return {
    inBlock: (from, to) => overlaps(block, from, to),
    inInline: (from, to) => overlaps(inline, from, to),
  };
}

/**
 * 遍历可见行，逐行交给 handle。guards 懒建一次（可见文本里有 `$` 或 `[^` 才建）。
 * 行号只增不回头：相邻可见区间理论上可能落在同一行，同一行扫两遍会把装饰也加两遍，
 * 两条一模一样的 replace 叠在一起 CodeMirror 会抛错。
 */
export function scanVisibleLines(
  view: EditorView,
  handle: (line: ScanLine, guards: ScanGuards) => void
): void {
  const { state } = view;
  let guards: ScanGuards | null = null;
  let done = 0;
  for (const range of view.visibleRanges) {
    const text = state.sliceDoc(range.from, range.to);
    if (!text.includes("$") && !text.includes("[^")) continue;
    guards ??= collectGuards(state, view);
    const first = Math.max(done + 1, state.doc.lineAt(range.from).number);
    const last = state.doc.lineAt(range.to).number;
    for (let n = first; n <= last; n++) {
      const line = state.doc.line(n);
      handle({ from: line.from, text: line.text }, guards);
    }
    done = Math.max(done, last);
  }
}
