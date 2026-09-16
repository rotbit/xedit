/**
 * 字体颜色的载体形态：Markdown 没有颜色语法，工具栏写出的是内联
 * `<span style="color:…">…</span>`（预览、公众号复制、导出链路都已放行这个形态）。
 *
 * 生成（editor/format.ts）与识别（livePreview/inline.ts）必须一字不差地对齐，
 * 所以标签拼法、匹配正则、回看窗口都收在这里，改一处即两边同步。
 */

export const COLOR_SPAN_CLOSE = "</span>";

export function colorSpanOpen(color: string): string {
  return `<span style="color:${color}">`;
}

/** 整段文字恰好就是一个开标签（捕获颜色值）——语法树里 HTMLTag 节点的整体匹配 */
export const COLOR_SPAN_OPEN_EXACT = /^<span style="color:([^"]*)">$/;

/** 文字末尾紧跟着一个开标签——选区左侧回看时用 */
export const COLOR_SPAN_OPEN_AT_END = /<span style="color:[^"]*">$/;

/** 整段文字恰好是一个完整的颜色 span（捕获内部文字） */
export const COLOR_SPAN_WRAPPED = /^<span style="color:[^"]*">([\s\S]*)<\/span>$/;

/** 向左回看多少个字符去找开标签：固定部分 `<span style="color:` + `">` 共 21 字符，
 *  余下近 40 个留给颜色值，`rgb(255 255 255 / 0.85)` 这类最长写法也装得下 */
export const COLOR_SPAN_LOOKBACK = 60;
