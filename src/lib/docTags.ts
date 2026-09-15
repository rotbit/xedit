/**
 * 文库级的标签视图：供侧栏标签区与检索复用。
 *
 * 标签本身从 docIndex 取 —— 那一层已经按 updatedAt + 正文长度缓存好了派生数据，
 * 和检索、反链共用同一次解析，这里不再另存一份。
 */

import { indexOf, pruneIndex } from "@/lib/docIndex";
import { normalizeTag } from "@/lib/frontmatter";
import type { DocMeta } from "@/features/workspace/types";

export interface TagCount {
  tag: string;
  count: number;
}

/** 一篇文章的全部标签（frontmatter + 正文内联），小写去重 */
export function tagsOf(doc: DocMeta): string[] {
  return indexOf(doc).tags;
}

/** 全库标签及篇数：按篇数降序，同篇数按标签字典序 */
export function buildTagIndex(docs: DocMeta[]): TagCount[] {
  // 全库扫描是唯一一处手里握着完整文库的地方，顺带把删掉的文章从索引缓存里清出去
  pruneIndex(docs.map((doc) => doc.id));
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
