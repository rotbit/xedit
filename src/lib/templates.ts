/**
 * 文章模板（纯函数，无 React）。
 *
 * 学 Obsidian 的做法：模板不是另一种实体，就是放在「模板」分类里的普通文章。
 * 于是不必新增存储、不必做管理界面 —— 编辑模板＝编辑那篇文章，
 * 删除、移动、同步、搜索全部沿用文章自己那一套。
 */

import type { DocMeta } from "@/features/workspace/types";
import { UNTITLED_DOC } from "@/lib/docDefaults";

/** 模板所在的分类名；子分类（如「模板/周报」）同样算模板 */
export const TEMPLATE_CATEGORY = "模板";

/** 分类路径是否落在模板目录下 */
export function isTemplateCategory(category?: string | null): boolean {
  if (!category) return false;
  return category === TEMPLATE_CATEGORY || category.startsWith(`${TEMPLATE_CATEGORY}/`);
}

/** 这篇文章是不是模板 */
export function isTemplateDoc(doc: Pick<DocMeta, "category">): boolean {
  return isTemplateCategory(doc.category);
}

/** 模板列表：按标题排序，好让下拉菜单的次序稳定（而不是跟着编辑时间乱跳） */
export function listTemplates(docs: readonly DocMeta[] | null | undefined): DocMeta[] {
  return (docs ?? [])
    .filter(isTemplateDoc)
    .slice()
    .sort((a, b) => a.title.localeCompare(b.title, "zh-Hans-CN"));
}

/** 从模板标题推出新文章的默认标题：「周报模板」→「周报」 */
export function defaultTitleFromTemplate(templateTitle: string): string {
  return templateTitle.replaceAll(TEMPLATE_CATEGORY, "").trim() || UNTITLED_DOC;
}

const WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const pad = (n: number) => String(n).padStart(2, "0");

export interface TemplateContext {
  /** 新文章的标题，对应 `{{title}}` */
  title: string;
  /** 注入时间，缺省取当下；留出参数只为可测 */
  now?: Date;
}

/**
 * `{{变量}}` 只认下面这几个，名字不区分大小写、两边允许空格（`{{ Date }}` 也算）。
 * 认不出的原样留着 —— 模板里写 `{{foo}}` 多半是作者自己的占位符，替成空串反而是帮倒忙。
 * 整篇字符串一起替换，所以 frontmatter 里的 `date: {{date}}` 同样生效。
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
    weekday: `星期${WEEKDAYS[now.getDay()]}`,
  };
  return content.replace(VAR, (whole, name: string) => {
    const value = values[name.toLowerCase()];
    return value === undefined ? whole : value;
  });
}
