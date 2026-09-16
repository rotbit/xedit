/**
 * markdown-it 的公式插件：行内 $...$ 与块级 $$...$$，在渲染期就交给 MathJax 出 SVG，
 * 因为公众号那边拿不到本站的脚本和字体，只有内联 SVG 能原样贴过去。
 * 两条规则都得自己数转义反斜杠、自己推进 state，写法贴着 markdown-it 的 tokenizer 约定，改之前先看各处说明。
 */
import type MarkdownIt from "markdown-it";
import type StateInline from "markdown-it/lib/rules_inline/state_inline.mjs";
import type StateBlock from "markdown-it/lib/rules_block/state_block.mjs";
import { texToSvg } from "./mathjax";

// 行内 $...$ 与块级 $$...$$ 公式，渲染为 MathJax SVG。
// 渲染结果外层保留 data-tex（原始 TeX），供“复制到知乎”时转换为知乎公式图片。

/** 只服务于把原始 TeX 塞进 data-tex 属性：TeX 里 & < > " 都是常见字符，不转义会把属性截断。 */
function escapeAttr(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/** TeX 转 SVG。语法错误时退化成 <code> 原文——宁可读者看到公式源码，也不要整篇渲染失败。 */
function renderTex(tex: string, displayMode: boolean): string {
  try {
    return texToSvg(tex, displayMode);
  } catch {
    return `<code>${escapeAttr(tex)}</code>`;
  }
}

/** 行内公式规则。silent 表示 markdown-it 只在试探能否匹配，此时不许产出 token、也不许写 pending。 */
function mathInline(state: StateInline, silent: boolean): boolean {
  if (state.src[state.pos] !== "$") return false;

  const start = state.pos + 1;
  let match = start;
  let pos: number;

  // 找到未被转义的闭合 $
  while ((match = state.src.indexOf("$", match)) !== -1) {
    pos = match - 1;
    while (state.src[pos] === "\\") pos -= 1;
    // pos 停在连续反斜杠的前一位，差值为奇数说明反斜杠是偶数个，这个 $ 没被转义，可以当闭合符
    if ((match - pos) % 2 === 1) break;
    match += 1;
  }

  if (match === -1) {
    if (!silent) state.pending += "$";
    state.pos = start;
    return false;
  }
  // 两个 $ 紧挨着：这是空公式，按字面输出 $$ 交给块级规则或普通文本，不要吞掉
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

/** 块级公式规则，同时认 $$..$$ 写在一行和跨多行两种形态。 */
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
    // 缩进退回到当前块之外（例如列表项已结束），公式就此中断，不跨结构边界去找闭合符
    if (pos < max && state.tShift[next] < state.blkIndent) break;
    const line = state.src.slice(pos, max);
    if (line.trim().endsWith("$$")) {
      lastLine = line.trim().slice(0, -2);
      found = true;
    }
  }

  // 找不到闭合 $$ 时 next 已经走到 endLine，这里照样吃掉剩下的行：未闭合的公式按「一直到文末」处理，不回退
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

/** 把两条规则注册进 MarkdownIt。行内规则排在 escape 之后，\$ 才能照常转义；
 *  块级规则排在 blockquote 之后并声明 alt 列表，公式块才允许出现在段落、引用和列表内部。 */
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
