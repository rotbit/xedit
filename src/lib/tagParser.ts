import { tags } from "@lezer/highlight";
import type { MarkdownConfig } from "@lezer/markdown";
import { isTagBoundary, isTagChar, normalizeTag } from "@/lib/frontmatter";

/**
 * 给 CodeMirror 的 Markdown 解析器加上 `#标签` 语法节点。
 *
 * 与 [[双向链接]] 同样走 lezer 扩展而不是在装饰层扫正则：语法树天然知道
 * 「这段在代码块里」，`#!/usr/bin/env` 这类注释、行内代码里的井号都不会被误判；
 * 标题行的 `#` 更是早在块级阶段就被 HeaderMark 吃掉，压根到不了行内解析。
 *
 * 规则与 extractTags 一致（见 frontmatter.ts）：`#` 前是行首或空白，
 * 后面紧跟至少一个标签字符，纯数字不算标签。
 */

const CH_HASH = 35; // #
const CH_SLASH = 47; // /

export const tagExtension: MarkdownConfig = {
  // style 挂在 NodeSpec 上，与 wikiLinkParser 同一套写法；
  // 源码模式没有 labelName 的配色规则，标签就是普通文字——源码模式本来就该是原文
  defineNodes: [{ name: "Tag", style: tags.labelName }],
  parseInline: [
    {
      name: "Tag",
      parse(cx, next, pos) {
        if (next !== CH_HASH) return -1;
        // pos === cx.offset 时前面是块的起点（段落必从行首开始），按行首处理；
        // 再往前读会越过 cx.text 的左边界拿到 NaN
        const prev = pos > cx.offset ? String.fromCharCode(cx.char(pos - 1)) : "";
        if (!isTagBoundary(prev)) return -1;

        let end = pos + 1;
        while (end < cx.end && isTagChar(String.fromCharCode(cx.char(end)))) end++;
        // 层级标签末尾的 `/` 不算内容（`#前端/` 就是 `#前端`）
        while (end > pos + 1 && cx.char(end - 1) === CH_SLASH) end--;
        if (end === pos + 1) return -1;
        if (!normalizeTag(cx.slice(pos, end))) return -1; // 纯数字是编号不是标签

        return cx.addElement(cx.elt("Tag", pos, end));
      },
    },
  ],
};
