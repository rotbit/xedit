/**
 * How font color is carried: Markdown has no color syntax, so the toolbar writes inline
 * `<span style="color:…">…</span>` (preview, WeChat copy, and export all allow this form).
 *
 * Generation (editor/format.ts) and recognition (livePreview/inline.ts) must match character for character,
 * so the tag spelling, matching regexes, and lookback window all live here; change one place and both stay in sync.
 *
 * "Find a pair of color tags in the syntax tree" lives here too: live preview hides tags with it, Delete skips tags with it,
 * the toolbar recolors in place with it, and the transaction filter cleans up orphan tags with it; all four must share one check,
 * since separate implementations always disagree somewhere (hidden tags that can't be deleted, or half-deleted pairs leaving an orphan).
 */

import { syntaxTree } from "@codemirror/language";
import type { EditorState } from "@codemirror/state";
import type { SyntaxNode } from "@lezer/common";

export const COLOR_SPAN_CLOSE = "</span>";

export function colorSpanOpen(color: string): string {
  return `<span style="color:${color}">`;
}

/** The whole text is exactly one opening tag (captures the color value); matches an HTMLTag node in the syntax tree as a whole */
export const COLOR_SPAN_OPEN_EXACT = /^<span style="color:([^"]*)">$/;

/** Text ending with an opening tag; used when looking back to the left of the selection */
export const COLOR_SPAN_OPEN_AT_END = /<span style="color:[^"]*">$/;

/** The whole text is exactly one complete color span (captures the inner text) */
export const COLOR_SPAN_WRAPPED = /^<span style="color:[^"]*">([\s\S]*)<\/span>$/;

/** How many chars to look back for an opening tag: the fixed part `<span style="color:` + `">` is 21 chars,
 *  leaving nearly 40 for the color value, enough for the longest forms like `rgb(255 255 255 / 0.85)` */
export const COLOR_SPAN_LOOKBACK = 60;

/** The range a tag occupies in the document */
export interface ColorSpanTag {
  readonly from: number;
  readonly to: number;
}

/** A successfully matched pair of color tags */
export interface ColorSpanPair {
  readonly open: ColorSpanTag;
  readonly close: ColorSpanTag;
  /** The color value written in the opening tag, taken verbatim (could be `#e11d48`, `rgb(…)`, etc.) */
  readonly color: string;
  /** Opening and closing tags are adjacent with nothing in between; these aren't hidden, see livePreview/inline.ts */
  readonly empty: boolean;
}

/** Any `<span …>` opening tag: spans without color must be counted when tracking nesting, or the depth is wrong */
const SPAN_OPEN_ANY = /^<span[\s>]/i;
const SPAN_CLOSE_ANY = /^<\/span\s*>$/i;

function pairOf(state: EditorState, open: SyntaxNode, close: SyntaxNode): ColorSpanPair | null {
  const color = state.sliceDoc(open.from, open.to).match(COLOR_SPAN_OPEN_EXACT);
  if (!color) return null; // A span, but not a toolbar color span; not handled here
  return {
    open: { from: open.from, to: open.to },
    close: { from: close.from, to: close.to },
    color: color[1],
    empty: close.from <= open.to,
  };
}

/** When node is a color span's opening tag, scan forward counting depth for the matching `</span>`; null if unpaired */
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

/** The reverse: when node is `</span>`, scan back for the matching opening tag (needed to recognize the pair when the cursor sits on the closing tag) */
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
 * Widen [from, to] to the enclosing top-level block (paragraph, list item, heading…).
 * A pair of color tags is always within one block, but the opening tag is often lines to the left of the change (multi-line paragraphs);
 * iterating only the changed range would miss it; widening to the block catches it without walking the whole doc each time.
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

/** All matched color spans near [from, to] (ascending by opening-tag position) */
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
 * The color tag hidden by live preview right next to pos; dir=-1 looks left, 1 looks right, null if none.
 * Uses the same pairing functions as livePreview/inline.ts: whatever is hidden there is what Delete skips.
 *
 * Note HTMLTag has children (`<span …>` contains StartTag/TagName/EndTag),
 * and resolveInner returns the innermost child, so walk up to HTMLTag before talking about boundaries.
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
  // Empty spans are shown as-is (see inline.ts), so delete by character
  if (!pair || pair.empty) return null;
  return { from: node.from, to: node.to };
}

/** Skip consecutive hidden tags from pos in direction dir, stopping at the first real character.
    Back-to-back pairs like `</span><span …>` must be skipped in one go, or Delete gets stuck in between */
export function skipHiddenColorTags(state: EditorState, pos: number, dir: -1 | 1): number {
  let at = pos;
  for (let tag = hiddenColorTagAt(state, at, dir); tag; tag = hiddenColorTagAt(state, at, dir)) {
    at = dir < 0 ? tag.from : tag.to;
  }
  return at;
}

/** Which color span's text pos falls in (including the two boundaries just inside the tags); for nesting, the innermost */
export function colorSpanPairAt(state: EditorState, pos: number): ColorSpanPair | null {
  let hit: ColorSpanPair | null = null;
  for (const pair of colorSpanPairsIn(state, pos, pos)) {
    if (pair.open.to > pos || pos > pair.close.from) continue;
    if (!hit || pair.open.from > hit.open.from) hit = pair;
  }
  return hit;
}
