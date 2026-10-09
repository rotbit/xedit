/**
 * 待办的写回（副作用层）：勾选、追加、删除都落到文章正文里，走现有的存储与同步。
 *
 * 编辑器正开着的那篇不能直接写存储：编辑器 store 里的内容才是最新的，
 * 下一次自动保存会拿它整篇回写，把这边写进存储的改动盖掉。
 * 所以那一篇改 store、让编辑器重挂载，落盘交给自动保存。
 */

import { getDocContent } from "@/lib/docContent";
import { saveMirrorLocal } from "@/lib/docStore";
import { isLocalId, notifyDocReplaced, notifyDocsChanged, updateLocalDoc } from "@/lib/localDocs";
import { pushMirrorDoc } from "@/lib/sync";
import { isDocOpenInEditor } from "@/lib/editor/mounted";
import { useStore } from "@/store/useStore";
import type { DocMeta } from "@/features/workspace/types";
import { findNotesDoc, type TodoItem } from "./collect";
import { parseDueTag, todayKey } from "./dates";
import { logEvent } from "./events";
import {
  appendTask,
  markPublished,
  parseTaskLines,
  parseTaskRaw,
  removeTaskLine,
  type DueRange,
  setPublishDate,
  setTaskLineDue,
  setTaskLineLink,
  toggleTaskLine,
} from "./parse";

export const NOTES_TITLE = "待办清单"; // i18n-ignore 存储名，显示处 t()

/** 关掉阅读器后 store.docId 不会清空，只认 store 会把改动写进没人落盘的 store 里；以编辑器挂载登记为准 */
const isOpenInEditor = (docId: string) => isDocOpenInEditor(docId) && useStore.getState().docId === docId;

/**
 * 读正文：编辑器开着它就读 store。先借 flushOnly 让编辑器把节流窗口里压着的输入吐进 store
 * （同 useEditorSave 的 persistOnHide），否则改写基于的是少了最后几个字的旧稿。
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
 * 整篇写回正文。updateLocalDoc / saveMirrorLocal 都是按字段打补丁，
 * 只传 content 不会清掉标题和分类。存储写满时 saveMirrorLocal 会抛，交给调用方提示。
 */
export async function writeDocContent(docId: string, next: string): Promise<void> {
  if (isOpenInEditor(docId)) {
    useStore.getState().setContent(next);
    notifyDocReplaced(docId);
  } else if (isLocalId(docId)) {
    updateLocalDoc(docId, { content: next });
  } else {
    saveMirrorLocal(docId, { content: next });
    // 离线时镜像已标脏，联网后同步引擎会推；这里不等推送结果，勾选要即时
    if (typeof navigator !== "undefined" && navigator.onLine) void pushMirrorDoc(docId);
  }
  notifyDocsChanged();
}

/**
 * 找到这条待办此刻所在的行。列表是按缓存算的，用户可能刚在别处改过正文，
 * 行号对不上就按文字再找一次；找不到返回 -1。
 * notChecked 给定时只认勾选状态与它相反的同名任务（勾选要找还没勾的那条）；
 * 删除不挑状态，传 null。
 */
function locateTask(md: string, item: TodoItem, notChecked: boolean | null): number {
  const today = todayKey();
  const tasks = parseTaskLines(md);
  // 口径同 collectTodos：清单行要连关联标记一起剥掉再比，正文行只剥日期标签
  const same = (raw: string) =>
    (item.source === "notes" ? parseTaskRaw(raw, today) : parseDueTag(raw, today)).text === item.text;
  const exact = tasks.find((t) => t.line === item.line);
  if (exact && same(exact.raw)) return exact.line;
  return tasks.find((t) => (notChecked === null || t.checked !== notChecked) && same(t.raw))?.line ?? -1;
}

/** 勾选 / 取消一条待办；勾上时记一条「完成」到当日记录 */
export async function setTaskChecked(item: TodoItem, checked: boolean): Promise<void> {
  const md = readDocContent(item.docId);
  let next = md;
  if (item.source === "publish") {
    // 发布排期只能勾上：取消勾选意味着删掉 published 键，没人需要
    if (!checked) return;
    next = markPublished(md);
  } else {
    const line = locateTask(md, item, checked);
    if (line < 0) return;
    next = toggleTaskLine(md, line, checked);
  }
  if (next === md) return;
  await writeDocContent(item.docId, next);
  if (checked) logEvent({ kind: "task", text: item.text, docId: item.docId, title: item.docTitle });
}

/** 往指定文章末尾追加一条待办（addNoteTask 往清单那篇追加时用） */
export async function addTaskToDoc(docId: string, text: string): Promise<void> {
  const md = readDocContent(docId);
  const next = appendTask(md, text);
  if (next === md) return; // 空文字
  await writeDocContent(docId, next);
}

/**
 * 从文章正文里删掉这条待办所在的那一行。publish 来源没有对应的行（它来自 frontmatter），
 * 界面上不给删除入口，这里也直接忽略。
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
 * 把一条待办挪到 range（开始日 + 可选结束日；null = 不定日期）：正文里的改行尾日期标签，
 * 发布排期改 frontmatter，且只取开始日（发布是某一天的事，没有时间段）。
 * 发布排期没有「不定日期」——去掉 publish 键等于取消排期，界面上不给这个入口，这里也忽略。
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
 * 关联 / 更换 / 取消关联文章（link 为 null）：改清单行尾的 `[[docId]]`。
 * 发布排期本身就是某篇文章的，没有关联可改，直接忽略。
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
 * 建稿函数由界面层提供（要走本地 / 云端两条建稿路径，且不跳转打开），返回新文章 id。
 * opts.log 为 false 时不记「新建」到当日记录（建待办清单那篇这种用户看不见的实现细节）
 */
export type CreateDocQuietly = (title: string, content: string, opts?: { log?: boolean }) => Promise<string>;

/**
 * 快速输入的默认目标（独立待办）：往待办清单那篇追加一行；还没有这篇就建一篇。
 * docs 要传全库：清单那篇不在侧栏可见列表里，传可见列表会每次都误建一篇。
 */
export async function addNoteTask(text: string, docs: DocMeta[], createDoc: CreateDocQuietly): Promise<void> {
  const body = appendTask("", text);
  if (!body) return;
  const notes = findNotesDoc(docs);
  if (notes) return addTaskToDoc(notes.id, text);
  // 清单那篇对用户隐形，建它不算「新建了一篇文章」
  await createDoc(NOTES_TITLE, `---\ntype: todo\n---\n\n${body}`, { log: false });
}
