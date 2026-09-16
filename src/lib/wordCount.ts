// 全站统一的「字数」口径（中文写作惯例，客户端与服务端共用）：
// - 每个 CJK 字符（汉字、假名）算 1 字
// - 连续的西文字母/数字串算 1 字（"MiniMax" 是 1 字而不是 7 字符）
// - 标点、Markdown 语法符号、空白不计
// - 链接与图片只计可见文字，URL 不计（这一步与摘要共用 excerpt.ts 的实现，别再各抄一份正则）

import { stripLinkSyntax } from "@/lib/excerpt";

// 假名 / CJK 扩展 A / 基本区 / 兼容区 / 扩展 B 及以后
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿\u{20000}-\u{2ebef}]/gu;
// 西文单词：字母或数字开头，词内允许撇号、连字符与小数点（"don't"、"3.5"、"state-of-the-art" 各算 1）
const WORD_RE = /[a-zA-Z0-9À-ɏ][a-zA-Z0-9À-ɏ'’._-]*/g;

export function wordCount(md: string): number {
  // keepAlt：图片 alt 算可见文字；pad：替换处补空格，否则紧挨的两个链接会被当成一个词
  const text = stripLinkSyntax(md, { keepAlt: true, pad: true });
  const cjk = text.match(CJK_RE)?.length ?? 0;
  const words = text.match(WORD_RE)?.length ?? 0;
  return cjk + words;
}

// 阅读时长的估算口径：中文默认 400 字/分钟（阅读模式顶栏与文章页元信息行共用，
// 两处显示的数字必须一致，别各写一遍除数）
export const CHARS_PER_MINUTE = 400;
