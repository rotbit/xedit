/**
 * 字词中间的单个 `*` 按字面处理：`3*2`、`a*b` 这类乘号写法在 CommonMark 里
 * 会被当成斜体定界符，于是 `3*2 和 2*5` 渲染成「3<em>2 和 2</em>5」，用户没法写出乘法。
 *
 * 规则刻意收得很窄：只有「单个 `*`，且左右紧挨的都是 ASCII 字母或数字」才不算定界符。
 * `**重点**内容`（双星）和 `这是*强调*吧`（中文夹字）仍照常生效，
 * 中文写作里不加空格直接接粗体 / 斜体是常态，不能伤到。
 *
 * 编辑器（@lezer/markdown）与预览 / 导出（markdown-it）各接一份，三处解析保持一致。
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

/** `src[pos]` 是否是一个该按字面输出的乘号式 `*` */
export function isLiteralStar(src: string, pos: number): boolean {
  if (src.charCodeAt(pos) !== STAR) return false;
  return isAsciiAlnum(src.charCodeAt(pos - 1)) && isAsciiAlnum(src.charCodeAt(pos + 1));
}

/** markdown-it 行内规则：排在 emphasis 之前，把这种 `*` 当普通文字吞掉 */
function literalStarRule(state: StateInline, silent: boolean): boolean {
  if (!isLiteralStar(state.src, state.pos)) return false;
  if (!silent) state.pending += "*";
  state.pos += 1;
  return true;
}

export function intrawordStarPlugin(md: MarkdownIt): void {
  md.inline.ruler.before("emphasis", "intraword_star", literalStarRule);
}

/** @lezer/markdown 扩展：返回消费掉的位置但不加元素，这个字符就成了普通文本 */
export const intrawordStarExtension: MarkdownConfig = {
  parseInline: [
    {
      name: "IntrawordStar",
      before: "Emphasis",
      parse(cx, next, pos) {
        if (next !== STAR) return -1;
        // cx.text 是当前行内段的原文，偏移量要减去段起点
        const i = pos - cx.offset;
        return isLiteralStar(cx.text, i) ? pos + 1 : -1;
      },
    },
  ],
};
