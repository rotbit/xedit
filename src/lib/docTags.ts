/**
 * 文库级的标签视图：把 extractTags 的结果按文章缓存起来，供侧栏标签区与检索复用。
 *
 * 缓存是必须的而不是优化：正文躺在 localStorage，一次全库扫描要逐篇 getItem + 正则，
 * 而自动保存每隔几百毫秒就会换一次 docs 引用。以 updatedAt 作失效键，
 * 没改过的文章直接命中缓存，代价只落在真正动过的那一篇上。
 */

import { getDocContent } from "@/lib/docContent";
import { extractTags, normalizeTag } from "@/lib/frontmatter";
import type { DocMeta } from "@/features/workspace/types";

export interface TagCount {
  tag: string;
  count: number;
}

const cache = new Map<string, { updatedAt: string; tags: string[] }>();

/** 一篇文章的全部标签（frontmatter + 正文内联），小写去重 */
export function tagsOf(doc: DocMeta): string[] {
  const hit = cache.get(doc.id);
  if (hit && hit.updatedAt === doc.updatedAt) return hit.tags;
  const tags = extractTags(getDocContent(doc.id));
  cache.set(doc.id, { updatedAt: doc.updatedAt, tags });
  return tags;
}

/** 全库标签及篇数：按篇数降序，同篇数按标签字典序 */
export function buildTagIndex(docs: DocMeta[]): TagCount[] {
  const counts = new Map<string, number>();
  for (const doc of docs) {
    for (const tag of tagsOf(doc)) counts.set(tag, (counts.get(tag) ?? 0) + 1);
  }
  return [...counts]
    .map(([tag, count]) => ({ tag, count }))
    .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
}

/**
 * 文章是否命中全部查询标签。层级标签按前缀匹配：
 * 搜 `#前端` 应该把 `#前端/react` 的文章也捞出来（与 Obsidian 一致）。
 */
export function hasAllTags(docTags: string[], wanted: string[]): boolean {
  return wanted.every((w) => docTags.some((t) => t === w || t.startsWith(`${w}/`)));
}

/**
 * 拆查询词：`#标签` 与 `tag:标签` 抽成标签条件，其余原样拼回文本。
 * 拆不出合法标签的词（`#`、`#1`）退回普通文本，免得用户搜「#1 号方案」什么也搜不到。
 */
export function parseSearchQuery(query: string): { tags: string[]; text: string } {
  const tags: string[] = [];
  const rest: string[] = [];
  for (const word of query.split(/\s+/)) {
    if (!word) continue;
    const at = word.indexOf(":");
    const raw = word.startsWith("#")
      ? word.slice(1)
      : /^tags?:/i.test(word)
        ? word.slice(at + 1)
        : null;
    const tag = raw === null ? null : normalizeTag(raw);
    if (tag) tags.push(tag);
    else rest.push(word);
  }
  return { tags, text: rest.join(" ") };
}
