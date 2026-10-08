/**
 * 待办的写回（副作用层）：勾选、追加都落到文章正文里，走现有的存储与同步。
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
import { appendTask, markPublished, parseTaskLines, toggleTaskLine } from "./parse";

export const NOTES_TITLE = "待办清单";

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
 * 行号对不上就按文字再找一次（取第一条勾选状态与目标相反的同名任务）；找不到返回 -1。
 */
function locateTask(md: string, item: TodoItem, checked: boolean): number {
  const today = todayKey();
  const tasks = parseTaskLines(md);
  const same = (raw: string) => parseDueTag(raw, today).text === item.text;
  const exact = tasks.find((t) => t.line === item.line);
  if (exact && same(exact.raw)) return exact.line;
  return tasks.find((t) => t.checked !== checked && same(t.raw))?.line ?? -1;
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

/**
 * 快速输入：往待办清单那篇追加一行；还没有这篇就建一篇。
 * createDoc 由界面层提供（要走本地 / 云端两条建稿路径，且不跳转打开）。
 */
export async function addNoteTask(
  text: string,
  docs: DocMeta[],
  createDoc: (title: string, content: string) => Promise<void>
): Promise<void> {
  const clean = text.replace(/[\r\n]+/g, " ").trim();
  if (!clean) return;
  const notes = findNotesDoc(docs);
  if (notes) {
    const md = readDocContent(notes.id);
    await writeDocContent(notes.id, appendTask(md, clean));
    return;
  }
  await createDoc(NOTES_TITLE, `---\ntype: todo\n---\n\n- [ ] ${clean}\n`);
}
