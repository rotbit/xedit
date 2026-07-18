import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import { texToSvg } from "./mathjax";

// 行内 $...$ 与块级 $$...$$ 公式，渲染为 MathJax SVG。
// 渲染结果外层保留 data-tex（原始 TeX），供“复制到知乎”时转换为知乎公式图片。

function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function renderTex(tex: string, displayMode: boolean): string {
  try {
    return texToSvg(tex, displayMode);
  } catch {
    return `<code>${escapeAttr(tex)}</code>`;
  }
}

function mathInline(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;

  const start = state.pos + 1;
  let match = start;
  let pos: number;

  // 找到未被转义的闭合 $
  while ((match = state.src.indexOf("$", match)) !== -1) {
    pos = match - 1;
    while (state.src[pos] === "\\") pos -= 1;
    if ((match - pos) % 2 === 1) break;
    match += 1;
  }

  if (match === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return false;
  }
  if (match - start === 0) {
    if (!silent) state.pending += "$$";
    state.pos = start + 1;
    return false;
  }

  const content = state.src.slice(start, match);
  // 前后是空白，或后跟数字（如价格 $5），视为普通字符
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
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith("$$")) {
      lastLine = line.trim().slice(0, -2);
      found = true;
    }
  }

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
