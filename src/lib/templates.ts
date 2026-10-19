/**
 * Article templates (pure functions, no React).
 *
 * Borrowed from Obsidian: a template isn't a separate entity, just an ordinary article in the 「模板」 (Templates) category.
 * So no new storage and no management UI: editing a template = editing that article,
 * and delete, move, sync and search all reuse the article's own machinery.
 */

import type { DocMeta } from "@/features/workspace/types";
import { UNTITLED_DOC } from "@/lib/docDefaults";

/** Category name for templates; subcategories (e.g. 「模板/周报」) count as templates too */
export const TEMPLATE_CATEGORY = "模板"; // i18n-ignore reserved category name stored in data; displayed via t()

/** Whether a category path falls under the templates folder */
export function isTemplateCategory(category?: string | null): boolean {
  if (!category) return false;
  return category === TEMPLATE_CATEGORY || category.startsWith(`${TEMPLATE_CATEGORY}/`);
}

/** Whether this article is a template */
export function isTemplateDoc(doc: Pick<DocMeta, "category">): boolean {
  return isTemplateCategory(doc.category);
}

/** Template list sorted by title so the dropdown order is stable (rather than jumping around with edit times) */
export function listTemplates(docs: readonly DocMeta[] | null | undefined): DocMeta[] {
  return (docs ?? [])
    .filter(isTemplateDoc)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
}

/** Derive a new article's default title from the template title: 「周报模板」 → 「周报」 */
export function defaultTitleFromTemplate(templateTitle: string): string {
  return templateTitle.replaceAll(TEMPLATE_CATEGORY, "").trim() || UNTITLED_DOC;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"]; // i18n-ignore values of the {{weekday}} template variable, written into the body as content

const pad = (n: number) => String(n).padStart(2, "0");

export interface TemplateContext {
  /** The new article's title, for `{{title}}` */
  title: string;
  /** Injected time, defaulting to now; the parameter exists only for testability */
  now?: Date;
}

/**
 * Only the `{{variables}}` below are recognized; names are case-insensitive with optional surrounding spaces (`{{ Date }}` counts).
 * Unrecognized ones stay as-is: a `{{foo}}` in a template is most likely the author's own placeholder, and blanking it would do more harm than good.
 * Replacement runs over the whole string, so `date: {{date}}` in frontmatter works too.
 */
const VAR = /\{\{[ \t]*([^{}\r\n]*?)[ \t]*\}\}/g;

export function applyTemplate(content: string, ctx: TemplateContext): string {
  const now = ctx.now ?? new Date();
  const ymd = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
  const hm = `${pad(now.getHours())}:${pad(now.getMinutes())}`;
  const values: Record<string, string> = {
    date: ymd,
    time: hm,
    datetime: `${ymd} ${hm}`,
    title: ctx.title,
    year: String(now.getFullYear()),
    month: pad(now.getMonth() + 1),
    day: pad(now.getDate()),
    weekday: `星期${WEEKDAYS[now.getDay()]}`, // i18n-ignore values of the {{weekday}} template variable, written into the body as content
  };
  return content.replace(VAR, (whole, name: string) => {
    const value = values[name.toLowerCase()];
    return value === undefined ? whole : value;
  });
}
