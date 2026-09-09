import { getMirrorContent, saveMirrorLocal } from "@/lib/docStore";
import { isLocalId, updateLocalDoc } from "@/lib/localDocs";
import { pushMirrorDoc } from "@/lib/sync";

export interface EditorDocument {
  docId: string | null;
  title: string;
  content: string;
  category: string;
}

export type PersistResult = "draft" | "local" | "local-error" | "offline" | "push-failed" | "synced";

/**
 * 当前单文档编辑会话的落盘基准，跨组件卸载保留。
 * 页面间切换时用它识别 store 中未落盘的编辑，避免误用后台更新过的镜像覆盖输入。
 * “已落盘”不代表云端已确认；云端是否待同步仍由镜像 dirty 标记决定。
 */
let savedDocument: EditorDocument = { docId: null, title: "", content: "", category: "" };

export function getSavedDocument(): Readonly<EditorDocument> {
  return savedDocument;
}

export function rememberSavedDocument({ docId, title, content, category }: EditorDocument) {
  savedDocument = { docId, title, content, category };
}

export function isDocumentSaved(doc: EditorDocument): boolean {
  return savedDocument.docId === doc.docId && savedDocument.title === doc.title &&
    savedDocument.content === doc.content && savedDocument.category === doc.category;
}

/** 刷新后没有会话基准时沿用镜像比对规则；两者都没有则保留当前编辑内容。 */
export function hasPendingContent(id: string, content: string): boolean {
  const base = savedDocument.docId === id ? savedDocument.content : getMirrorContent(id);
  return base === null || content !== base;
}

/** 共用落盘步骤，提示、保存状态和版本归档由调用方按手动/自动保存策略处理。 */
export async function persistEditorDocument(doc: EditorDocument, onCloudPush: () => void): Promise<PersistResult> {
  const { docId, title, content, category } = doc;
  if (!docId) return "draft";
  if (isLocalId(docId)) {
    try {
      updateLocalDoc(docId, { title, content, category });
      rememberSavedDocument(doc);
      return "local";
    } catch {
      return "local-error";
    }
  }

  // 云端文档始终先落镜像，离线或推送失败后仍由同步引擎处理 dirty 内容。
  saveMirrorLocal(docId, { title, content, category });
  rememberSavedDocument(doc);
  if (!navigator.onLine) return "offline";
  onCloudPush();
  return await pushMirrorDoc(docId) ? "synced" : "push-failed";
}
