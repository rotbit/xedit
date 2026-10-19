/**
 * A single `*` inside a word is literal: multiplication like `3*2` or `a*b` is treated by CommonMark
 * as an emphasis delimiter, so `3*2 和 2*5` renders as "3<em>2 和 2</em>5" and users can't write multiplication.
 *
 * The rule is deliberately narrow: only "a single `*` with ASCII letters or digits directly on both sides" is not a delimiter.
 * `**重点**内容` (double star) and `这是*强调*吧` (between CJK chars) still work as usual;
 * in Chinese writing, bold/italics butting straight against text without spaces is the norm and must not break.
 *
 * The editor (@lezer/markdown) and preview/export (markdown-it) each get one, keeping all three parsers consistent.
 */
import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type { MarkdownConfig } from "@lezer/markdown";

const STAR = 42; /* * */

function isAsciiAlnum(code: number): boolean {
  return (
    (code >= 48 && code <= 57) || // 0-9
    (code >= 65 && code <= 90) || // A-Z
    (code >= 97 && code <= 122) // a-z
  );
}

/** Whether `src[pos]` is a multiplication-style `*` that should be output literally */
export function isLiteralStar(src: string, pos: number): boolean {
  if (src.charCodeAt(pos) !== STAR) return false;
  return isAsciiAlnum(src.charCodeAt(pos - 1)) && isAsciiAlnum(src.charCodeAt(pos + 1));
}

/** markdown-it inline rule: runs before emphasis and swallows such `*` as plain text */
function literalStarRule(state: StateInline, silent: boolean): boolean {
  if (!isLiteralStar(state.src, state.pos)) return false;
  if (!silent) state.pending += "*";
  state.pos += 1;
  return true;
}

export function intrawordStarPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "intraword_star", literalStarRule);
}

/** @lezer/markdown extension: return the consumed position without adding an element, making the char plain text */
export const intrawordStarExtension: MarkdownConfig = {
  parseInline: [
    {
      name: "IntrawordStar",
      before: "Emphasis",
      parse(cx, next, pos) {
        if (next !== STAR) return -1;
        // cx.text is the raw text of the current inline section; subtract the section start from offsets
        const i = pos - cx.offset;
        return isLiteralStar(cx.text, i) ? pos + 1 : -1;
      },
    },
  ],
};
