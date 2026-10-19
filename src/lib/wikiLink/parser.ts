import { tags } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/**
 * Adds a `[[wiki link]]` syntax node to CodeMirror's Markdown parser.
 *
 * A lezer extension rather than regex-scanning text in the decoration layer: the syntax tree already knows "this is inside a code block",
 * so `[[…]]` in inline or fenced code isn't mistaken for a link,
 * and the live-preview layer gets stable from/to without tracking positions itself.
 *
 * Node structure (matches Obsidian syntax):
 *   WikiLink
 *     ├─ WikiLinkMark    "[["
 *     ├─ WikiLinkTarget  target title
 *     ├─ WikiLinkMark    "|" (when aliased)
 *     ├─ WikiLinkAlias   display text (when aliased)
 *     └─ WikiLinkMark    "]]"
 */

const CH_OPEN = 91; // [
const CH_CLOSE = 93; // ]
const CH_LF = 10;
const CH_CR = 13;

/** From `[[`, look ahead for `]]` on the same line; give up on a newline or a nested `[[` */
function findClose(cx: InlineContext, from: number): number {
  for (let i = from + 2; i < cx.end; i++) {
    const ch = cx.char(i);
    if (ch === CH_LF || ch === CH_CR) return -1;
    if (ch === CH_OPEN && cx.char(i + 1) === CH_OPEN) return -1;
    if (ch === CH_CLOSE && cx.char(i + 1) === CH_CLOSE) return i;
  }
  return -1;
}

export const wikiLinkExtension: MarkdownConfig = {
  // style hangs directly on the NodeSpec: no separate styleTags needed, the editor's existing
  // tags.link / tags.processingInstruction colors (see lib/editor/highlight.ts) apply automatically,
  // so it reads as a link at a glance even in source mode
  defineNodes: [
    { name: "WikiLink", style: tags.link },
    { name: "WikiLinkMark", style: tags.processingInstruction },
    { name: "WikiLinkTarget", style: tags.link },
    { name: "WikiLinkAlias", style: tags.link },
  ],
  parseInline: [
    {
      name: "WikiLink",
      // Must run before Link: otherwise the first `[` of `[[x]]` is eaten by the standard link parser
      before: "Link",
      parse(cx, next, pos) {
        if (next !== CH_OPEN || cx.char(pos + 1) !== CH_OPEN) return -1;
        const close = findClose(cx, pos);
        if (close < 0) return -1;

        const body = cx.slice(pos + 2, close);
        const bar = body.indexOf("|");
        // Empty targets (`[[]]`, `[[ |alias]]`) aren't links; leave them as plain text
        if (!(bar === -1 ? body : body.slice(0, bar)).trim()) return -1;

        const children = [cx.elt("WikiLinkMark", pos, pos + 2)];
        const textFrom = pos + 2;
        if (bar === -1) {
          children.push(cx.elt("WikiLinkTarget", textFrom, close));
        } else {
          const barPos = textFrom + bar;
          if (barPos > textFrom) children.push(cx.elt("WikiLinkTarget", textFrom, barPos));
          children.push(cx.elt("WikiLinkMark", barPos, barPos + 1));
          // The alias may be empty (`[[target|]]`); no node for an empty range
          if (close > barPos + 1) children.push(cx.elt("WikiLinkAlias", barPos + 1, close));
        }
        children.push(cx.elt("WikiLinkMark", close, close + 2));

        return cx.addElement(cx.elt("WikiLink", pos, close + 2, children));
      },
    },
  ],
};
