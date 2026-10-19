// Site-wide "word count" rule (Chinese writing convention, shared by client and server):
// - each CJK character (hanzi, kana) counts as 1
// - a run of Latin letters/digits counts as 1 ("MiniMax" is 1 word, not 7 characters)
// - punctuation, Markdown syntax and whitespace don't count
// - links and images count only visible text, not URLs (this step shares excerpt.ts's implementation; don't copy the regex again)

import { stripLinkSyntax } from "@/lib/excerpt";

// Kana / CJK Extension A / Basic block / Compatibility / Extension B and later
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿\u{20000}-\u{2ebef}]/gu;
// Latin words: start with a letter or digit, may contain apostrophes, hyphens and decimal points ("don't", "3.5", "state-of-the-art" each count as 1)
const WORD_RE = /[a-zA-Z0-9À-ɏ][a-zA-Z0-9À-ɏ'’._-]*/g;

export function wordCount(md: string): number {
  // keepAlt: image alt counts as visible text; pad: insert a space at replacements, or two adjacent links would merge into one word
  const text = stripLinkSyntax(md, { keepAlt: true, pad: true });
  const cjk = text.match(CJK_RE)?.length ?? 0;
  const words = text.match(WORD_RE)?.length ?? 0;
  return cjk + words;
}

// Reading time estimate: 400 Chinese chars per minute by default (shared by the reader-mode top bar and the article page meta line;
// both must show the same number, so don't write the divisor twice)
export const CHARS_PER_MINUTE = 400;
