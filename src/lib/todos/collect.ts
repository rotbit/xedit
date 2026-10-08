/**
 * 把全库的待办汇总成一张表，再按「今天」视图的展示规则分桶（纯函数 + 内存缓存）。
 *
 * 缓存照抄 docIndex.ts 的思路：自动保存每几百毫秒换一次 docs 引用，「今天」页与侧栏计数
 * 都会跟着重算；只看元信息里的 updatedAt + chars 判失效，没变就连正文都不读。
 * 缓存里存的是未解析日期标签的原始行——`@明天` 指哪天取决于「今天」，
 * 跨过零点后不必为此重读全库正文，取用时现算一遍标签就够了。
 */

import { getDocContent } from "@/lib/docContent";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { isTemplateDoc } from "@/lib/templates";
import type { DocMeta } from "@/features/workspace/types";
import { parseDueTag } from "./dates";
import { isNotesDoc, parsePublish, parseTaskLines, type RawTask } from "./parse";

export interface TodoItem {
  /** `${docId}:${line}`，publish 来源的 line 为 -1 */
  key: string;
  docId: string;
  docTitle: string;
  line: number;
  text: string;
  due: string | null;
  checked: boolean;
  source: "doc" | "notes" | "publish";
}

export interface TodoBuckets {
  overdue: TodoItem[];
  today: TodoItem[];
  /** 只放 notes 来源的无日期待办：那篇清单就是专门记「要做」的，不该被折叠 */
  undated: TodoItem[];
  /** 文章正文里没定日期的、以及日期在以后的：今天页不展示，也不计入侧栏计数 */
  later: TodoItem[];
  done: TodoItem[];
}

interface CacheRow {
  updatedAt: string;
  chars: number | undefined;
  /** 建这条时正文是空的：云端镜像可能晚一步才落到本地，空结果不能长住 */
  empty: boolean;
  tasks: RawTask[];
  publish: { due: string | null; published: boolean };
  isNotes: boolean;
}

const cache = new Map<string, CacheRow>();

function rowOf(doc: DocMeta): CacheRow {
  const hit = cache.get(doc.id);
  if (hit && hit.updatedAt === doc.updatedAt && hit.chars === doc.chars && !hit.empty) return hit;
  const content = getDocContent(doc.id);
  const row: CacheRow = {
    updatedAt: doc.updatedAt,
    chars: doc.chars,
    empty: content.length === 0,
    tasks: parseTaskLines(content),
    publish: parsePublish(content),
    isNotes: isNotesDoc(content),
  };
  cache.set(doc.id, row);
  return row;
}

/** 丢掉已不在文库里的条目（删除、退出登录换库），不清就一直攥着用不到的解析结果 */
export function pruneTodoCache(liveIds: Iterable<string>): void {
  const live = new Set(liveIds);
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
}

/**
 * 全库待办：正文 `- [ ]`、待办清单那篇、frontmatter 的发布排期。
 * 模板分类里的文章跳过——模板里的 `- [ ] 检查错别字` 是给新稿用的清单，不是谁要做的事。
 */
export function collectTodos(docs: DocMeta[], today: string): TodoItem[] {
  const out: TodoItem[] = [];
  for (const doc of docs) {
    if (isTemplateDoc(doc)) continue;
    const row = rowOf(doc);
    const docTitle = doc.title || UNTITLED_DOC;
    const source = row.isNotes ? "notes" : "doc";
    for (const t of row.tasks) {
      const { text, due } = parseDueTag(t.raw, today);
      out.push({ key: `${doc.id}:${t.line}`, docId: doc.id, docTitle, line: t.line, text, due, checked: t.checked, source });
    }
    if (row.publish.due && !row.publish.published) {
      out.push({
        key: `${doc.id}:-1`,
        docId: doc.id,
        docTitle,
        line: -1,
        text: `发布《${docTitle}》`,
        due: row.publish.due,
        checked: false,
        source: "publish",
      });
    }
  }
  return out;
}

/** 有日期的按日期升序，没日期的垫后；sort 是稳定的，同日期保持文库顺序 */
function byDue(a: TodoItem, b: TodoItem): number {
  if (a.due === b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : 1;
}

export function bucketTodos(items: TodoItem[], today: string): TodoBuckets {
  const b: TodoBuckets = { overdue: [], today: [], undated: [], later: [], done: [] };
  for (const item of items) {
    if (item.checked) b.done.push(item);
    else if (item.due && item.due < today) b.overdue.push(item);
    else if (item.due === today) b.today.push(item);
    else if (!item.due && item.source === "notes") b.undated.push(item);
    else b.later.push(item);
  }
  b.overdue.sort(byDue);
  b.later.sort(byDue);
  return b;
}

/** 侧栏「今天」的计数：真正需要现在处理的那些 */
export function actionableCount(b: TodoBuckets): number {
  return b.overdue.length + b.today.length + b.undated.length;
}

/** 待办清单那篇；有好几篇时取列表里的第一篇（文库按更新时间倒序，即最近动过的） */
export function findNotesDoc(docs: DocMeta[]): DocMeta | null {
  for (const doc of docs) {
    if (isTemplateDoc(doc)) continue;
    if (rowOf(doc).isNotes) return doc;
  }
  return null;
}
