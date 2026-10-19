import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { EditorView } from "@codemirror/view";
import { blockGuardRanges } from "@/lib/livePreview/blocks";
import type { CodeRange } from "@/lib/livePreview/context";

/**
 * Shared "read the source line by line" channel for inline math ($…$) and footnote definition lines ([^id]: …).
 *
 * Why not use the syntax tree: lezer's markdown parser doesn't know `$` at all; and a footnote definition line only parses as a LinkReference
 * when its content happens to be a single word without spaces — written as 「[^1]: 一段 说明」 it's just a normal paragraph.
 * Both can only be found by scanning the text ourselves.
 *
 * Scanning text means marking out "characters here don't count" ranges ourselves, otherwise `$` in code blocks would be taken as math delimiters.
 * There are two tiers, because the two features need to skip different things:
 * - block: code blocks, HTML blocks, and tables/$$/frontmatter already claimed by the block field. Both features skip these.
 * - inline: inline structures already owned by something — inline code, links, images, URLs. Only math skips these —
 *   the `[^id]` at the start of a footnote definition is itself treated as a Link by lezer, so using this tier would block the footnote itself.
 *
 * Cost is kept in check two ways: only walk view.visibleRanges; if the visible text contains neither `$` nor `[^`, bail out immediately
 * without even walking the syntax tree (true for the vast majority of documents).
 */

/** Block structures that take their inner characters wholesale (no need to descend once inside) */
const BLOCK_NODES = new Set([
  "FencedCode",
  "CodeBlock",
  "CodeText",
  "HTMLBlock",
  "CommentBlock",
  "ProcessingInstruction",
]);

/** Inline structures already owned by something. Link/Image count as whole spans: the `$` in `![$a$](x)` is part of the image caption,
    and treating it as math would stack a math widget and an image widget on the same span (two overlapping replaces make CodeMirror throw) */
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
  /** Document offset of the line start; add it to in-line match indexes to get document coordinates */
  from: number;
  text: string;
}

export interface ScanGuards {
  /** Intersects code blocks/HTML/claimed block ranges */
  inBlock(from: number, to: number): boolean;
  /** Intersects inline code/links/images/URLs */
  inInline(from: number, to: number): boolean;
}

function overlaps(ranges: CodeRange[], from: number, to: number): boolean {
  return ranges.some((r) => from < r.to && to > r.from);
}

function collectGuards(state: EditorState, view: EditorView): ScanGuards {
  const visibleFrom = view.visibleRanges[0]?.from ?? 0;
  const visibleTo = view.visibleRanges[view.visibleRanges.length - 1]?.to ?? 0;
  // The block-level ranges are whole-doc, so clip them to the visible range first: every candidate char below is checked against them,
  // and keeping hundreds of code blocks from a long doc would mean hundreds of wasted comparisons
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
 * Walk visible lines, handing each to handle. guards are built lazily once (only if the visible text has `$` or `[^`).
 * Line numbers only increase, never go back: adjacent visible ranges can in theory fall on the same line, and scanning a line twice would add decorations twice;
 * two identical replaces stacked together make CodeMirror throw.
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
