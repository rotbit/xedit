/**
 * Writing todos back (side-effect layer): check, append and delete all land in the article body via existing storage and sync.
 *
 * The doc open in the editor can't be written to storage directly: the editor store holds the latest content,
 * and the next autosave writes the whole doc back from it, overwriting whatever we wrote to storage.
 * So for that doc we update the store, remount the editor, and leave persistence to autosave.
 */

import { getDocContent } from "@/lib/docContent";
import { saveMirrorLocal } from "@/lib/docStore";
import { isLocalId, notifyDocReplaced, notifyDocsChanged, updateLocalDoc } from "@/lib/localDocs";
import { pushMirrorDoc } from "@/lib/sync";
import { isDocOpenInEditor } from "@/lib/editor/mounted";
import { useStore } from "@/store/useStore";
import type { DocMeta } from "@/features/workspace/types";
import { findNotesDoc, type TodoItem } from "./collect";
import { todayKey } from "./dates";
import { logEvent } from "./events";
import {
  appendTask,
  markPublished,
  moveTaskLine,
  parseTaskLines,
  removeTaskLine,
  resolveTask,
  type DueRange,
  setPublishDate,
  setTaskLineDue,
  setTaskLineLink,
  setTaskLineRepeat,
  toggleTaskLine,
} from "./parse";

export const NOTES_TITLE = "待办清单"; // i18n-ignore stored name, displayed via t()

/** store.docId isn't cleared after closing the reader; trusting it alone would write changes into a store nobody persists. Go by the editor's mount registration instead */
const isOpenInEditor = (docId: string) => isDocOpenInEditor(docId) && useStore.getState().docId === docId;

/**
 * Read the body: if the editor has it open, read the store. First use flushOnly to have the editor push throttled input into the store
 * (like persistOnHide in useEditorSave); otherwise the rewrite is based on a stale draft missing the last few characters.
 */
function readDocContent(docId: string): string {
  if (isOpenInEditor(docId)) {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("xedit:save-now", { detail: { flushOnly: true } }));
    }
    return useStore.getState().content;
  }
  return getDocContent(docId);
}

/**
 * Write the whole body back. updateLocalDoc / saveMirrorLocal patch by field,
 * so passing only content won't clear the title or category. saveMirrorLocal throws when storage is full; the caller shows the message.
 */
export async function writeDocContent(docId: string, next: string): Promise<void> {
  if (isOpenInEditor(docId)) {
    useStore.getState().setContent(next);
    notifyDocReplaced(docId);
  } else if (isLocalId(docId)) {
    updateLocalDoc(docId, { content: next });
  } else {
    saveMirrorLocal(docId, { content: next });
    // Offline, the mirror is already marked dirty and the sync engine pushes once back online; don't wait for the push here, checking must feel instant
    if (typeof navigator !== "undefined" && navigator.onLine) void pushMirrorDoc(docId);
  }
  notifyDocsChanged();
}

/**
 * Find the line this todo is on right now. The list is computed from the cache and the user may have just edited the body elsewhere,
 * so if the line number doesn't match, search again by text; -1 if not found.
 * When notChecked is given, only a same-text task whose checked state is its opposite matches (checking looks for the unchecked one);
 * deletion doesn't care about state, pass null. Checked state follows resolveTask: a daily task's `[x]` may be from yesterday,
 * so comparing the raw checkbox would miss the one not yet done today.
 */
function locateTask(md: string, item: TodoItem, notChecked: boolean | null, today: string = todayKey()): number {
  // Same rule as collectTodos: checklist lines strip the link marker too before comparing; body lines strip only date / repeat tags
  const tasks = parseTaskLines(md).map((t) => ({ line: t.line, ...resolveTask(t.raw, t.checked, today, item.source === "notes") }));
  const exact = tasks.find((t) => t.line === item.line);
  if (exact && exact.text === item.text) return exact.line;
  return tasks.find((t) => (notChecked === null || t.checked !== notChecked) && t.text === item.text)?.line ?? -1;
}

/** Check / uncheck a todo; checking logs a 「完成」 (Done) entry to the day log */
export async function setTaskChecked(item: TodoItem, checked: boolean): Promise<void> {
  const md = readDocContent(item.docId);
  let next = md;
  if (item.source === "publish") {
    // Publish schedules can only be checked: unchecking would mean deleting the published key, which nobody needs
    if (!checked) return;
    next = markPublished(md);
  } else {
    const today = todayKey();
    const line = locateTask(md, item, checked, today);
    if (line < 0) return;
    next = toggleTaskLine(md, line, checked, today);
  }
  if (next === md) return;
  await writeDocContent(item.docId, next);
  if (checked) logEvent({ kind: "task", text: item.text, docId: item.docId, title: item.docTitle });
}

/** Append a todo to the end of the given article (used by addNoteTask when appending to the checklist) */
export async function addTaskToDoc(docId: string, text: string): Promise<void> {
  const md = readDocContent(docId);
  const next = appendTask(md, text);
  if (next === md) return; // Empty text
  await writeDocContent(docId, next);
}

/**
 * Delete the line holding this todo from the article body. Publish sources have no corresponding line (they come from frontmatter);
 * the UI offers no delete for them, so just ignore here.
 */
export async function deleteTask(item: TodoItem): Promise<void> {
  if (item.source === "publish") return;
  const md = readDocContent(item.docId);
  const line = locateTask(md, item, null);
  if (line < 0) return;
  const next = removeTaskLine(md, line);
  if (next === md) return;
  await writeDocContent(item.docId, next);
}

/**
 * Move a todo to range (start date + optional end date; null = undated): body todos get their trailing date tag rewritten,
 * publish schedules get frontmatter updated, using only the start date (publishing happens on one day, no ranges).
 * Publish schedules have no "undated" — removing the publish key means unscheduling, which the UI doesn't offer, so ignore here.
 */
export async function setTaskDue(item: TodoItem, range: DueRange | null): Promise<void> {
  const md = readDocContent(item.docId);
  let next = md;
  if (item.source === "publish") {
    if (!range) return;
    next = setPublishDate(md, range.due);
  } else {
    const line = locateTask(md, item, null);
    if (line < 0) return;
    next = setTaskLineDue(md, line, range);
  }
  if (next === md) return;
  await writeDocContent(item.docId, next);
}

/**
 * Link / change / unlink an article (link null): edits the `[[docId]]` at the end of the checklist line.
 * A publish schedule already belongs to an article, so there's no link to change; ignore.
 */
export async function setTaskLink(item: TodoItem, link: string | null): Promise<void> {
  if (item.source === "publish") return;
  const md = readDocContent(item.docId);
  const line = locateTask(md, item, null);
  if (line < 0) return;
  const next = setTaskLineLink(md, line, link);
  if (next === md) return;
  await writeDocContent(item.docId, next);
}

/**
 * Set / clear daily repeat. Clearing swaps in today's date, see setTaskLineRepeat; publish schedules don't repeat, ignore.
 */
export async function setTaskRepeat(item: TodoItem, on: boolean): Promise<void> {
  if (item.source === "publish") return;
  const md = readDocContent(item.docId);
  const today = todayKey();
  const line = locateTask(md, item, null, today);
  if (line < 0) return;
  const next = setTaskLineRepeat(md, line, on, today);
  if (next === md) return;
  await writeDocContent(item.docId, next);
}

/**
 * Drag-to-reorder: move item's line to just before / after target's line. Only checklist items in the same doc can be reordered —
 * the Today list's order for those is simply their line order in the checklist, so moving the line is the whole persistence story (no separate order store).
 * Lines are located fresh (the list may be stale against edits made elsewhere); if either is gone, do nothing.
 */
export async function reorderTask(item: TodoItem, target: TodoItem, place: "before" | "after"): Promise<void> {
  if (item.source !== "notes" || target.source !== "notes" || item.docId !== target.docId) return;
  const md = readDocContent(item.docId);
  const from = locateTask(md, item, null);
  const to = locateTask(md, target, null);
  if (from < 0 || to < 0) return;
  const next = moveTaskLine(md, from, to, place);
  if (next === md) return;
  await writeDocContent(item.docId, next);
}

/**
 * The doc-creation function is supplied by the UI layer (it goes through the local / cloud creation paths, without navigating to it) and returns the new article id.
 * With opts.log false, no 「新建」 (New) entry is logged to the day log (for implementation details the user doesn't see, like creating the todo checklist)
 */
export type CreateDocQuietly = (title: string, content: string, opts?: { log?: boolean }) => Promise<string>;

/**
 * Default target for quick entry (standalone todo): append a line to the todo checklist; create it if it doesn't exist yet.
 * docs must be the whole library: the checklist isn't in the sidebar's visible list, and passing that list would create a new one every time.
 */
export async function addNoteTask(text: string, docs: DocMeta[], createDoc: CreateDocQuietly): Promise<void> {
  const body = appendTask("", text);
  if (!body) return;
  const notes = findNotesDoc(docs);
  if (notes) return addTaskToDoc(notes.id, text);
  // The checklist is invisible to the user; creating it doesn't count as "created an article"
  await createDoc(NOTES_TITLE, `---\ntype: todo\n---\n\n${body}`, { log: false });
}
