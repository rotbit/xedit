import DOMPurify from "dompurify";

/**
 * DOMPurify's default allowed protocols lack blob:, yet local library attachment images use blob: object URLs,
 * so without it the whole src gets stripped (every image breaks). Only blob is added to the default list; nothing else changes.
 */
const ALLOWED_URI =
  /^(?:(?:(?:f|ht)tps?|mailto|tel|callto|sms|cid|xmpp|matrix|blob):|[^a-z]|[a-z+.\-]+(?:[^a-z+.\-:]|$))/i;

const OPTIONS = {
  ADD_TAGS: ["section", "figure", "figcaption"],
  ADD_ATTR: ["data-line", "data-tex", "eeimg", "data-wiki", "data-callout"],
  ALLOWED_URI_REGEXP: ALLOWED_URI,
};

/**
 * Rendered HTML always goes through DOMPurify before entering the DOM,
 * preventing script injection via raw HTML embedded in Markdown.
 */
export function sanitizeHtml(html: string): string {
  return DOMPurify.sanitize(html, OPTIONS);
}

/** Batch preview blocks consume the sanitized nodes directly, avoiding a second HTML parse of the split result. */
export function sanitizeFragment(html: string): DocumentFragment {
  return DOMPurify.sanitize(html, { ...OPTIONS, RETURN_DOM_FRAGMENT: true });
}
