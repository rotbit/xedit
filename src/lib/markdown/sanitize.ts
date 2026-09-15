import DOMPurify from "dompurify";

/**
 * DOMPurify 默认放行的协议里没有 blob:，本地文库的附件图片走的正是 blob: object URL，
 * 不补上会被整条 src 剥掉（图全裂）。只在默认表上加一个 blob，其余判定一字不改。
 */
const ALLOWED_URI =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

/**
 * 渲染后的 HTML 统一经 DOMPurify 消毒后再进入 DOM，
 * 防止 Markdown 内嵌原始 HTML 时注入脚本。
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, {
    ADD_TAGS: ["section", "figure", "figcaption"],
    ADD_ATTR: ["data-line", "data-tex", "eeimg", "data-wiki", "data-callout"],
    ALLOWED_URI_REGEXP: ALLOWED_URI,
  });
}
