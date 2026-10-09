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
import { isNotesDoc, parsePublish, parseTaskLines, parseTaskRaw, type RawTask } from "./parse";

export interface TodoItem {
  /** `${docId}:${line}`，publish 来源的 line 为 -1 */
  key: string;
  docId: string;
  docTitle: string;
  line: number;
  text: string;
  due: string | null;
  /** 时间段的结束日（`@开始~结束`），due 是开始日；单日、没日期与 publish 来源为 null */
  end: string | null;
  checked: boolean;
  source: "doc" | "notes" | "publish";
  /** 关联文章的 docId（清单行尾的 `[[docId]]`）；只有 notes 来源会有，其它来源一律 null */
  link: string | null;
}

export interface TodoBuckets {
  overdue: TodoItem[];
  /**
   * 今天到期的（时间段是今天落在开始到结束之间的），加上 notes 来源的无日期待办：
   * 那篇清单就是专门记「要做」的，没排期就默认今天处理
   */
  today: TodoItem[];
  /** 文章正文里没定日期的（今天页不展示）、以及日期在以后的（右栏「接下来」）；都不计入侧栏计数 */
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
      // 关联标记只在清单里认：文章正文里的 `[[…]]` 是用户自己写的字，原样显示
      const { text, due, end, link } = row.isNotes
        ? parseTaskRaw(t.raw, today)
        : { ...parseDueTag(t.raw, today), link: null };
      out.push({ key: `${doc.id}:${t.line}`, docId: doc.id, docTitle, line: t.line, text, due, end, checked: t.checked, source, link });
    }
    if (row.publish.due && !row.publish.published) {
      out.push({
        key: `${doc.id}:-1`,
        docId: doc.id,
        docTitle,
        line: -1,
        text: `发布《${docTitle}》`, // i18n-ignore 会原样记进当日记录（数据）；界面在 today/parts.tsx 的 itemLabel 按语言重拼
        due: row.publish.due,
        end: null,
        checked: false,
        source: "publish",
        link: null,
      });
    }
  }
  return out;
}

/** 有日期的按（开始）日期升序，没日期的垫后；sort 是稳定的，同日期保持文库顺序 */
function byDue(a: TodoItem, b: TodoItem): number {
  if (a.due === b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : 1;
}

export function bucketTodos(items: TodoItem[], today: string): TodoBuckets {
  const b: TodoBuckets = { overdue: [], today: [], later: [], done: [] };
  for (const item of items) {
    // 时间段过了结束日才算逾期；开始日到结束日之间每天都在左栏
    const last = item.end ?? item.due;
    if (item.checked) b.done.push(item);
    else if (item.due && last && last < today) b.overdue.push(item);
    else if ((item.due && last && item.due <= today && today <= last) || (!item.due && item.source === "notes")) {
      b.today.push(item);
    } else b.later.push(item);
  }
  b.overdue.sort(byDue);
  b.later.sort(byDue);
  return b;
}

/** 侧栏「今天」的计数：和今天页左栏一致（逾期 + 今天，含清单里没定日期的） */
export function actionableCount(b: TodoBuckets): number {
  return b.overdue.length + b.today.length;
}

/** 待办清单那篇；有好几篇时取列表里的第一篇（文库按更新时间倒序，即最近动过的） */
export function findNotesDoc(docs: DocMeta[]): DocMeta | null {
  for (const doc of docs) {
    if (isTemplateDoc(doc)) continue;
    if (rowOf(doc).isNotes) return doc;
  }
  return null;
}
