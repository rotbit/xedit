/**
 * Collects todos from the whole library into one table, then buckets them per the Today view's rules (pure functions + in-memory cache).
 *
 * The cache follows docIndex.ts: autosave swaps the docs reference every few hundred ms, and the Today page and sidebar count
 * recompute with it; staleness is judged only by updatedAt + chars in the metadata, so unchanged docs aren't even read.
 * The cache stores raw lines with date tags unresolved — what `@明天` means depends on "today",
 * so after midnight there's no need to re-read the whole library; resolving tags on read is enough.
 */

import { getDocContent } from "@/lib/docContent";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { isTemplateDoc } from "@/lib/templates";
import type { DocMeta } from "@/features/workspace/types";
import { isNotesDoc, parsePublish, parseTaskLines, resolveTask, type RawTask } from "./parse";

export interface TodoItem {
  /** `${docId}:${line}`; line is -1 for publish-sourced items */
  key: string;
  docId: string;
  docTitle: string;
  line: number;
  text: string;
  due: string | null;
  /** End date of a range (`@start~end`); due is the start date. null for single days, undated items and publish sources */
  end: string | null;
  /** For daily tasks, checked only means "done today"; it resets to not done the next day */
  checked: boolean;
  /** Daily task (`@每天` / `@daily`): due is always today and end is null, so it only lands in today or done */
  repeat: "daily" | null;
  source: "doc" | "notes" | "publish";
  /** docId of the linked article (the `[[docId]]` at the end of a checklist line); only notes sources have it, others are null */
  link: string | null;
}

export interface TodoBuckets {
  overdue: TodoItem[];
  /**
   * Due today (ranges where today falls between start and end), plus undated todos from the notes source:
   * that checklist exists purely to track things to do, so unscheduled items default to today
   */
  today: TodoItem[];
  /** Undated items from article bodies (not shown on the Today page) and future-dated ones (right column 「接下来」 (Up next)); neither counts toward the sidebar count */
  later: TodoItem[];
  done: TodoItem[];
}

interface CacheRow {
  updatedAt: string;
  chars: number | undefined;
  /** Body was empty when this entry was built: the cloud mirror may land locally a beat later, so empty results must not stick */
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

/** Drop entries no longer in the library (deleted, signed out / switched library); otherwise we keep holding parse results nobody needs */
export function pruneTodoCache(liveIds: Iterable<string>): void {
  const live = new Set(liveIds);
  for (const id of cache.keys()) if (!live.has(id)) cache.delete(id);
}

/**
 * Library-wide todos: `- [ ]` in bodies, the todo checklist doc, and publish schedules from frontmatter.
 * Articles in the template category are skipped — `- [ ] 检查错别字` in a template is a checklist for new drafts, not someone's task.
 */
export function collectTodos(docs: DocMeta[], today: string): TodoItem[] {
  const out: TodoItem[] = [];
  for (const doc of docs) {
    if (isTemplateDoc(doc)) continue;
    const row = rowOf(doc);
    const docTitle = doc.title || UNTITLED_DOC;
    const source = row.isNotes ? "notes" : "doc";
    for (const t of row.tasks) {
      // Link markers only count in the checklist: `[[…]]` in an article body is the user's own text, shown as-is
      const { text, due, end, link, repeat, checked } = resolveTask(t.raw, t.checked, today, row.isNotes);
      out.push({ key: `${doc.id}:${t.line}`, docId: doc.id, docTitle, line: t.line, text, due, end, checked, repeat, source, link });
    }
    if (row.publish.due && !row.publish.published) {
      out.push({
        key: `${doc.id}:-1`,
        docId: doc.id,
        docTitle,
        line: -1,
        text: `发布《${docTitle}》`, // i18n-ignore recorded verbatim into the day log (data); the UI rebuilds it per language in itemLabel in today/parts.tsx
        due: row.publish.due,
        end: null,
        checked: false,
        repeat: null,
        source: "publish",
        link: null,
      });
    }
  }
  return out;
}

/** Dated items ascending by (start) date, undated last; sort is stable so same-date items keep library order */
function byDue(a: TodoItem, b: TodoItem): number {
  if (a.due === b.due) return 0;
  if (!a.due) return 1;
  if (!b.due) return -1;
  return a.due < b.due ? -1 : 1;
}

export function bucketTodos(items: TodoItem[], today: string): TodoBuckets {
  const b: TodoBuckets = { overdue: [], today: [], later: [], done: [] };
  for (const item of items) {
    // A range is only overdue after its end date; every day from start to end it stays in the left column
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

/** Sidebar 「今天」 (Today) count: matches the Today page's left column (overdue + today, including undated checklist items) */
export function actionableCount(b: TodoBuckets): number {
  return b.overdue.length + b.today.length;
}

/** The todo checklist doc; if there are several, take the first in the list (library is sorted by updatedAt desc, i.e. most recently touched) */
export function findNotesDoc(docs: DocMeta[]): DocMeta | null {
  for (const doc of docs) {
    if (isTemplateDoc(doc)) continue;
    if (rowOf(doc).isNotes) return doc;
  }
  return null;
}
