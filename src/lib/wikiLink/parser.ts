import { tags } from "@lezer/highlight";
import type { InlineContext, MarkdownConfig } from "@lezer/markdown";

/**
 * 给 CodeMirror 的 Markdown 解析器加上 `[[双向链接]]` 语法节点。
 *
 * 走 lezer 扩展而不是在装饰层用正则扫文本：语法树天然知道「这段在代码块里」，
 * 行内代码、围栏代码里的 `[[…]]` 不会被误判成链接，
 * 即时渲染那一层拿到的也是稳定的 from/to，不必自己维护位置。
 *
 * 节点结构（与 Obsidian 语法一致）：
 *   WikiLink
 *     ├─ WikiLinkMark    "[["
 *     ├─ WikiLinkTarget  目标标题
 *     ├─ WikiLinkMark    "|"（有别名时）
 *     ├─ WikiLinkAlias   显示文字（有别名时）
 *     └─ WikiLinkMark    "]]"
 */

const CH_OPEN = 91; // [
const CH_CLOSE = 93; // ]
const CH_LF = 10;
const CH_CR = 13;

/** 从 `[[` 处向后找同一行内的 `]]`；遇到换行或嵌套的 `[[` 即放弃 */
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
  // style 直接挂在 NodeSpec 上：不用另写 styleTags，编辑器已有的
  // tags.link / tags.processingInstruction 配色（见 lib/editor/highlight.ts）自动生效，
  // 源码模式下也一眼看得出这是链接
  defineNodes: [
    { name: "WikiLink", style: tags.link },
    { name: "WikiLinkMark", style: tags.processingInstruction },
    { name: "WikiLinkTarget", style: tags.link },
    { name: "WikiLinkAlias", style: tags.link },
  ],
  parseInline: [
    {
      name: "WikiLink",
      // 必须抢在 Link 之前：否则 `[[x]]` 的第一个 `[` 先被标准链接解析器吃掉
      before: "Link",
      parse(cx, next, pos) {
        if (next !== CH_OPEN || cx.char(pos + 1) !== CH_OPEN) return -1;
        const close = findClose(cx, pos);
        if (close < 0) return -1;

        const body = cx.slice(pos + 2, close);
        const bar = body.indexOf("|");
        // 空目标（`[[]]`、`[[ |别名]]`）不成链接，交还给普通文本
        if (!(bar === -1 ? body : body.slice(0, bar)).trim()) return -1;

        const children = [cx.elt("WikiLinkMark", pos, pos + 2)];
        const textFrom = pos + 2;
        if (bar === -1) {
          children.push(cx.elt("WikiLinkTarget", textFrom, close));
        } else {
          const barPos = textFrom + bar;
          if (barPos > textFrom) children.push(cx.elt("WikiLinkTarget", textFrom, barPos));
          children.push(cx.elt("WikiLinkMark", barPos, barPos + 1));
          // 别名可以为空（`[[目标|]]`），空区间不建节点
          if (close > barPos + 1) children.push(cx.elt("WikiLinkAlias", barPos + 1, close));
        }
        children.push(cx.elt("WikiLinkMark", close, close + 2));

        return cx.addElement(cx.elt("WikiLink", pos, close + 2, children));
      },
    },
  ],
};
