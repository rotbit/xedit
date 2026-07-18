import DOMPurify from "dompurify";

/**
 * 渲染后的 HTML 统一经 DOMPurify 消毒后再进入 DOM，
 * 防止 Markdown 内嵌原始 HTML 时注入脚本。
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["section", "figure", "figcaption"],
    ADD_ATTR: ["data-line", "data-tex", "eeimg"],
  });
}
