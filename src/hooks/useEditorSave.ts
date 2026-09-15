"use client";

import { useEffect, useRef } from "react";
import { toast } from "@/components/Toast";
import { isLocalId } from "@/lib/localDocs";
import { isDocumentSaved, persistEditorDocument, type EditorDocument, type PersistResult } from "@/lib/editorPersistence";
import { useStore, type SaveState } from "@/store/useStore";

/** 保留两种入口的提示策略：手动保存失败显示待同步，自动保存在线失败显示错误。 */
function saveStateFor(result: PersistResult, manual: boolean): SaveState {
  switch (result) {
    case "draft":
    case "local": return "local";
    case "local-error": return "error";
    case "offline": return "pending";
    case "push-failed": return manual || !navigator.onLine ? "pending" : "error";
    case "synced": return "saved";
  }
}

async function saveDocument(doc: EditorDocument, manual: boolean): Promise<PersistResult> {
  const result = await persistEditorDocument(doc, () => useStore.getState().setSaveState("saving"));
  // 手动同步成功后继续显示保存中，等版本请求结束再提示；无文档草稿沿用现有状态。
  if (!manual || (result !== "synced" && result !== "draft")) {
    useStore.getState().setSaveState(saveStateFor(result, manual));
  }
  return result;
}

/** 手动存档只在同步成功后请求，版本失败不会把已保存的正文标成失败。 */
async function saveManualVersion(id: string) {
  try {
    const response = await fetch(`/api/documents/${id}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "manual" }),
    });
    const data = await response.json().catch(() => ({}));
    useStore.getState().setSaveState("saved");
    toast(data.created ? "已保存并存档版本" : "已保存（内容与最近版本相同）", "success");
  } catch {
    useStore.getState().setSaveState("saved");
    toast("已同步云端，版本存档失败", "error");
  }
}

async function saveNow() {
  const doc = useStore.getState();
  const result = await saveDocument(doc, true);
  switch (result) {
    case "draft": return toast("本地文稿已实时保存", "success");
    case "local": return toast("已保存到本地", "success");
    case "local-error": return toast("保存失败：浏览器存储空间不足", "error");
    case "offline": return toast("已存本地，联网后自动同步", "success");
    case "push-failed": return toast("云端暂不可达，已存本地稍后自动同步", "error");
    case "synced": return saveManualVersion(doc.docId!);
  }
}

/** 管理保存触发时机与版本归档；文档加载完成后调用，保留同次提交中先装载再判脏的顺序。 */
export function useEditorSave() {
  const idleVersionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const savedThisSession = useRef(false);

  useEffect(() => () => {
    if (idleVersionTimer.current) clearTimeout(idleVersionTimer.current);
  }, []);

  // 关闭页面时补一次自动存档；服务端负责自动版本的节流与改动量门槛。
  useEffect(() => {
    const flush = () => {
      const id = useStore.getState().docId;
      if (!id || isLocalId(id) || !savedThisSession.current) return;
      if (!navigator.onLine || !navigator.sendBeacon) return;
      navigator.sendBeacon(
        `/api/documents/${id}/versions`,
        new Blob([JSON.stringify({ kind: "auto" })], { type: "application/json" })
      );
      savedThisSession.current = false;
    };
    window.addEventListener("pagehide", flush);
    return () => window.removeEventListener("pagehide", flush);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      // 切标签前的落盘只是借这条事件让编辑器把节流中的输入吐进 store，
      // 保存由发起方（useWorkspaceNav）就地完成，这里不该再弹提示、归档手动版本
      if ((e as CustomEvent<{ flushOnly?: boolean }>).detail?.flushOnly) return;
      void saveNow();
    };
    window.addEventListener("xedit:save-now", handler);
    return () => window.removeEventListener("xedit:save-now", handler);
  }, []);

  const docId = useStore((s) => s.docId);
  const title = useStore((s) => s.title);
  const content = useStore((s) => s.content);
  const category = useStore((s) => s.category);

  useEffect(() => {
    if (!docId) {
      // 装载 effect 可能在同一次提交中设好 docId，不能用旧的 null 覆盖已装载文档的状态。
      if (!useStore.getState().docId) useStore.getState().setSaveState("local");
      return;
    }
    const doc = { docId, title, content, category };
    if (isDocumentSaved(doc)) return;
    const timer = setTimeout(async () => {
      const result = await saveDocument(doc, false);
      if (result !== "synced") return;
      savedThisSession.current = true;
      // 停止编辑 5 分钟后存档；成功保存下一次编辑时重新计时。
      if (idleVersionTimer.current) clearTimeout(idleVersionTimer.current);
      idleVersionTimer.current = setTimeout(() => {
        void fetch(`/api/documents/${docId}/versions`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ kind: "auto" }),
        }).catch(() => undefined);
      }, 5 * 60_000);
    }, isLocalId(docId) ? 500 : 800);
    return () => clearTimeout(timer);
  }, [docId, title, content, category]);
}
