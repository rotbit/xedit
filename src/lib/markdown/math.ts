/**
 * markdown-it math plugin: inline $...$ and block $$...$$, handed to MathJax for SVG at render time,
 * since WeChat can't load this site's scripts or fonts and only inline SVG pastes over intact.
 * Both rules count escaping backslashes and advance state themselves, following markdown-it's tokenizer conventions; read the notes throughout before changing.
 */
import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import { texToSvg } from "./mathjax";

// Inline $...$ and block $$...$$ math, rendered as MathJax SVG.
// The output keeps data-tex (raw TeX) on the wrapper so "复制到知乎" (Copy to Zhihu) can convert it into Zhihu formula images.

/** Only for stuffing raw TeX into the data-tex attribute: & < > " are common in TeX and would truncate the attribute unescaped. */
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** TeX to SVG. On syntax errors fall back to the raw source in <code>: better readers see the TeX than the whole render failing. */
function renderTex(tex: string, displayMode: boolean): string {
  try {
    return texToSvg(tex, displayMode);
  } catch {
    return `<code>${escapeAttr(tex)}</code>`;
  }
}

/** Inline math rule. silent means markdown-it is only probing for a match: no tokens may be emitted and pending must not be written. */
function mathInline(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;

  const start = state.pos + 1;
  let match = start;
  let pos: number;

  // Find the unescaped closing $
  while ((match = state.src.indexOf("$", match)) !== -1) {
    pos = match - 1;
    while (state.src[pos] === "\\") pos -= 1;
    // pos stops just before the run of backslashes; an odd difference means an even number of backslashes, so this $ is unescaped and can close
    if ((match - pos) % 2 === 1) break;
    match += 1;
  }

  if (match === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return false;
  }
  // Two adjacent $: an empty formula; emit $$ literally for the block rule or plain text, don't swallow it
  if (match - start === 0) {
    if (!silent) state.pending += "$$";
    state.pos = start + 1;
    return false;
  }

  const content = state.src.slice(start, match);
  // Whitespace on either side, or followed by a digit (e.g. a price like $5): treat as a plain character
  if (/^\s/.test(content) || /\s$/.test(content) || /^\d/.test(state.src.slice(match + 1))) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return false;
  }

  if (!silent) {
    const token = state.push("math_inline", "math", 0);
    token.markup = "$";
    token.content = content;
  }
  state.pos = match + 1;
  return true;
}

/** Block math rule, accepting both $$..$$ on one line and spanning multiple lines. */
function mathBlock(
  state: StateBlock,
  startLine: number,
  endLine: number,
  silent: boolean
): boolean {
  let pos = state.bMarks[startLine] + state.tShift[startLine];
  let max = state.eMarks[startLine];

  if (pos + 2 > max) return false;
  if (state.src.slice(pos, pos + 2) !== "$$") return false;
  if (silent) return true;

  pos += 2;
  let firstLine = state.src.slice(pos, max);
  let lastLine = "";
  let found = false;

  if (firstLine.trim().endsWith("$$")) {
    firstLine = firstLine.trim().slice(0, -2);
    found = true;
  }

  let next = startLine;
  while (!found) {
    next += 1;
    if (next >= endLine) break;
    pos = state.bMarks[next] + state.tShift[next];
    max = state.eMarks[next];
    // Indentation fell back outside the current block (e.g. the list item ended): the formula stops here, never crossing structure boundaries to find a closer
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith("$$")) {
      lastLine = line.trim().slice(0, -2);
      found = true;
    }
  }

  // Without a closing $$, next has reached endLine; still consume the remaining lines: an unclosed formula runs "to end of document", no backtracking
  state.line = next + 1;

  const token = state.push("math_block", "math", 0);
  token.block = true;
  token.content =
    (firstLine.trim() ? firstLine + "\n" : "") +
    state.getLines(startLine + 1, next, state.tShift[startLine], true) +
    (lastLine.trim() ? lastLine : "");
  token.map = [startLine, state.line];
  token.markup = "$$";
  return true;
}

/** Register both rules on MarkdownIt. The inline rule goes after escape so \$ still escapes normally;
 *  the block rule goes after blockquote with an alt list so math blocks can appear inside paragraphs, quotes and lists. */
export function mathPlugin(md: MarkdownIt): void {
  md.inline.ruler.after("escape", "math_inline", mathInline);
  md.block.ruler.after("blockquote", "math_block", mathBlock, {
    alt: ["paragraph", "reference", "blockquote", "list"],
  });

  md.renderer.rules.math_inline = (tokens, idx) => {
    const tex = tokens[idx].content;
    return `<span class="math math-inline" data-tex="${escapeAttr(tex)}">${renderTex(tex, false)}</span>`;
  };

  md.renderer.rules.math_block = (tokens, idx) => {
    const tex = tokens[idx].content;
    const line = tokens[idx].map ? ` data-line="${tokens[idx].map![0]}"` : "";
    return `<section class="math math-block" data-tex="${escapeAttr(tex)}"${line}>${renderTex(tex, true)}</section>\n`;
  };
}
