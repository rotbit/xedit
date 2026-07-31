// 全站统一的「字数」口径（中文写作惯例，客户端与服务端共用）：
// - 每个 CJK 字符（汉字、假名）算 1 字
// - 连续的西文字母/数字串算 1 字（"MiniMax" 是 1 字而不是 7 字符）
// - 标点、Markdown 语法符号、空白不计
// - 链接与图片只计可见文字，URL 不计

// 假名 / CJK 扩展 A / 基本区 / 兼容区 / 扩展 B 及以后
const CJK_RE = /[぀-ヿ㐀-䶿一-鿿豈-﫿\u{20000}-\u{2ebef}]/gu;
// 西文单词：字母或数字开头，词内允许撇号、连字符与小数点（"don't"、"3.5"、"state-of-the-art" 各算 1）
const WORD_RE = /[a-zA-Z0-9À-ɏ][a-zA-Z0-9À-ɏ'’._-]*/g;

export function wordCount(md: string): number {
  const text = md
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, " $1 ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, " $1 ");
  const cjk = text.match(CJK_RE)?.length ?? 0;
  const words = text.match(WORD_RE)?.length ?? 0;
  return cjk + words;
}
