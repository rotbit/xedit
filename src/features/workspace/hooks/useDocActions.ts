"use client";

import { useState } from "react";
import {
  isLocalId,
  listLocalDocs,
  createLocalDoc,
  updateLocalDoc,
  deleteLocalDoc,
  listLocalCats,
  notifyDocsChanged,
} from "@/lib/localDocs";
import { getActiveVault } from "@/lib/localBackend/vaultSession";
import { getDocContent } from "@/lib/docContent";
import { saveMirrorLocal, removeMirrorDoc, applyServerDoc } from "@/lib/docStore";
import { syncNow } from "@/lib/sync";
import { applyTemplate, defaultTitleFromTemplate, isTemplateCategory } from "@/lib/templates";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { logEvent } from "@/lib/todos/events";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";
import { t, tk } from "@/i18n/t";
import { askInput, askConfirm } from "@/components/PromptDialog";
import { UNCATEGORIZED, isVirtualCat } from "../constants";
import { displayCatPath } from "../lib/catPath";
import { mergedCloudList } from "../lib/docSource";
import type { DocMeta } from "../types";
import type { AuthMode } from "./useAuthMode";
import type { DocLibrary } from "./useDocLibrary";
import type { WorkspaceNav } from "./useWorkspaceNav";

interface Params {
  auth: AuthMode;
  library: DocLibrary;
  nav: WorkspaceNav;
}

/** Doc create/update/delete and list refresh, dispatched across three paths: local mode / offline / cloud */
export function useDocActions({ auth, library, nav }: Params) {
  const { localMode, online } = auth;
  const { setDocs, setCustomCats, setTrashDocs } = library;
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pushingFeishu, setPushingFeishu] = useState(false);

  /** Manual refresh: when logged in, run a full sync (pulling changes from other devices / MCP clients); in local mode, reread the local library */
  const refreshDocs = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const work = async () => {
        if (localMode) {
          if (nav.isTrash) setTrashDocs(getActiveVault()?.listTrash() ?? []);
          setDocs(listLocalDocs());
          setCustomCats(listLocalCats());
        } else if (nav.isTrash) {
          const list = await fetch("/api/documents?trash=1")
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []);
          setTrashDocs(list);
        } else {
          await syncNow(); // SYNC_DONE_EVENT refreshes the list when done; read once more here as a fallback
          setDocs(mergedCloudList());
        }
      };
      // Spin for at least 400ms so an instant finish doesn't just flash the icon with no visible feedback
      await Promise.all([work(), new Promise((r) => setTimeout(r, 400))]);
      toast(t("已刷新"), "success");
    } finally {
      setRefreshing(false);
    }
  };

  /** Create a doc locally (logged out, or logged in but offline — the sync engine uploads it once back online) */
  const createDocLocally = (
    cat: string,
    relist: () => DocMeta[],
    title?: string,
    content?: string
  ) => {
    try {
      const doc = createLocalDoc({ category: cat, title, content });
      logEvent({ kind: "create", docId: doc.id, title: doc.title });
      setDocs(relist());
      nav.openDoc(doc.id);
    } catch {
      toast(t("新建失败：浏览器存储空间不足"), "error");
    }
  };

  /** @param init Prefilled fields: title (when a `[[wikilink]]` points to a missing doc, create it with the target title) and body (from a template) */
  const createDoc = async (category?: string, init?: { title?: string; content?: string }) => {
    const cat = category ?? (isVirtualCat(nav.activeCat) ? UNCATEGORIZED : nav.activeCat);
    const title = init?.title?.trim() || UNTITLED_DOC;
    const content = init?.content ?? "";
    if (localMode) return createDocLocally(cat, listLocalDocs, title, content);
    if (!online) return createDocLocally(cat, mergedCloudList, title, content);

    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title, content, category: cat }),
      });
      if (!res.ok) throw new Error();
      const doc = await res.json();
      applyServerDoc(doc); // New docs go into the mirror right away, available to the editor and offline at any time
      logEvent({ kind: "create", docId: doc.id, title: doc.title });
      setDocs(mergedCloudList());
      nav.openDoc(doc.id);
      setCreating(false);
    } catch {
      toast(t("新建失败"), "error");
      setCreating(false);
    }
  };

  /**
   * Silent create: only refresh the list after creating, without opening it. Used by Today page quick add —
   * noting a task auto-creates the todo-list doc, and the user should stay on the Today page.
   * Failures throw directly (storage full / API error); the caller decides how to report them. Returns the new doc id.
   * With opts.log false, "created" isn't recorded in the daily log: the todo-list doc is an implementation detail
   * and shouldn't appear in "Done" or the monthly stats' "Docs created".
   */
  const createDocQuietly = async (
    title: string,
    content: string,
    opts?: { log?: boolean },
    /** Which category it goes into; defaults to 「未分类」 (the todo-list doc and quick creates both use the default) */
    category: string = UNCATEGORIZED
  ): Promise<string> => {
    const log = opts?.log !== false;
    const local = localMode || !online;
    if (local) {
      const doc = createLocalDoc({ category, title, content });
      if (log) logEvent({ kind: "create", docId: doc.id, title: doc.title });
      setDocs(localMode ? listLocalDocs() : mergedCloudList());
      return doc.id;
    }
    const res = await fetch("/api/documents", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, content, category }),
    });
    if (!res.ok) throw new Error(`create failed: ${res.status}`);
    const doc = await res.json();
    applyServerDoc(doc);
    if (log) logEvent({ kind: "create", docId: doc.id, title: doc.title });
    setDocs(mergedCloudList());
    return doc.id as string;
  };

  /**
   * Create from a template: copy the template body (including frontmatter) and substitute variables like `{{date}}`.
   * Ask for the title first, since `{{title}}` needs it before the doc can be saved.
   */
  const createFromTemplate = async (template: DocMeta, category?: string) => {
    const name = (
      await askInput({
        title: t("用模板新建"),
        placeholder: t("文章标题"),
        defaultValue: defaultTitleFromTemplate(template.title),
      })
    )?.trim();
    if (!name) return; // Cancelled
    const title = name.slice(0, 200);
    // A doc created from a template is a real doc and shouldn't land back in the template category (especially when currently inside the 「模板」 folder)
    const fallback =
      isVirtualCat(nav.activeCat) || isTemplateCategory(nav.activeCat)
        ? UNCATEGORIZED
        : nav.activeCat;
    await createDoc(category ?? fallback, {
      title,
      content: applyTemplate(getDocContent(template.id), { title }),
    });
  };

  const removeDoc = async (doc: DocMeta) => {
    const label = doc.title || t(UNTITLED_DOC);
    if (localMode) {
      // Deleting in a disk library moves into .trash/ (the backend's deleteDoc already does this); browser storage deletes for real
      const vault = getActiveVault();
      const ok = await askConfirm({
        title: t("删除文章"),
        message: vault
          ? t("删除「{name}」？移入回收站，可在回收站恢复。", { name: label })
          : t("删除「{name}」？本地文章删除后无法找回。", { name: label }),
        confirmText: vault ? t("移入回收站") : t("删除"),
        danger: true,
      });
      if (!ok) return;
      deleteLocalDoc(doc.id);
      setDocs(listLocalDocs());
      notifyDocsChanged(); // The trash list listens for this event too
      // A deleted doc shouldn't stay open: if it's being read, go back to the list
      if (nav.readingId === doc.id) nav.setReadingId(null);
      toast(vault ? t("已移入回收站") : t("已删除"), "success");
      return;
    }
    if (!online) {
      toast(t("离线时无法删除云端文章，联网后再试"), "error");
      return;
    }
    const ok = await askConfirm({
      title: t("删除文章"),
      message: t("把「{name}」移入回收站？可随时恢复。", { name: label }),
      confirmText: t("移入回收站"),
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      removeMirrorDoc(doc.id);
      setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      // A doc moved to the trash shouldn't stay open either
      if (nav.readingId === doc.id) nav.setReadingId(null);
      toast(t("已移入回收站"), "success");
    } else {
      toast(t("删除失败"), "error");
    }
  };

  const restoreDoc = async (doc: DocMeta) => {
    const vault = localMode ? getActiveVault() : null;
    if (vault) {
      // Check whether the restore succeeded before touching the list: on failure keep the row in the trash; otherwise the file would still be in .trash/
      // but gone from the list, and the user could never find it again (short of reloading the page)
      const back = vault.restoreFromTrash(doc.id);
      if (!back) {
        toast(t("恢复失败：回收站里找不到这个文件"), "error");
        return;
      }
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      setDocs(listLocalDocs());
      notifyDocsChanged();
      toast(t("已恢复"), "success");
      return;
    }
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (res.ok) {
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      // The sync engine pulls the restored doc back into the mirror and refreshes the list
      void syncNow();
      toast(t("已恢复"), "success");
    } else {
      toast(t("恢复失败"), "error");
    }
  };

  const hardDeleteDoc = async (doc: DocMeta) => {
    const vault = localMode ? getActiveVault() : null;
    const ok = await askConfirm({
      title: t("彻底删除"),
      message: vault
        ? t("彻底删除「{name}」？彻底删除后无法找回。", { name: doc.title || t(UNTITLED_DOC) })
        : t("彻底删除「{name}」？包括全部版本历史，无法找回。", {
            name: doc.title || t(UNTITLED_DOC),
          }),
      confirmText: t("彻底删除"),
      danger: true,
    });
    if (!ok) return;
    if (vault) {
      vault.purgeFromTrash(doc.id);
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      toast(t("已彻底删除"), "success");
      return;
    }
    const res = await fetch(`/api/documents/${doc.id}?hard=1`, { method: "DELETE" });
    if (res.ok) {
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      toast(t("已彻底删除"), "success");
    } else {
      toast(t("删除失败"), "error");
    }
  };

  /** Empty the trash: only available for disk libraries (deletes everything in .trash/) */
  const emptyVaultTrash = async () => {
    const vault = localMode ? getActiveVault() : null;
    if (!vault) return;
    const count = vault.listTrash().length;
    if (count === 0) {
      toast(t("回收站是空的"));
      return;
    }
    const ok = await askConfirm({
      title: t("清空回收站"),
      message: t("删除回收站里的 {n} 篇文章？彻底删除后无法找回。", { n: count }),
      confirmText: t("清空"),
      danger: true,
    });
    if (!ok) return;
    vault.emptyTrash();
    setTrashDocs([]);
    toast(t("回收站已清空"), "success");
  };

  const moveDoc = async (doc: DocMeta, category: string) => {
    const local = localMode || isLocalId(doc.id);
    // This is the doc being edited: the category in the editor store must change too,
    // otherwise the next autosave writes the whole thing back with the old category and the doc "jumps back" to its old folder
    const store = useStore.getState();
    if (store.docId === doc.id) store.setCategory(category);
    // Local-first: docs not yet in the cloud go to the local library; cloud docs go to the mirror first (works offline too), then get pushed
    if (local) updateLocalDoc(doc.id, { category });
    else saveMirrorLocal(doc.id, { category });
    setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, category } : d)) ?? null);
    toast(t("已移动到「{name}」", { name: displayCatPath(category, t) }), "success");
    if (!local) void syncNow();
  };

  const renameDoc = async (doc: DocMeta) => {
    const name = (
      await askInput({
        title: t("重命名文章"),
        placeholder: t("文章标题"),
        defaultValue: doc.title || t(UNTITLED_DOC),
      })
    )?.trim();
    if (!name || name === doc.title) return;
    const title = name.slice(0, 200);
    // This is the doc being edited: only change editor state and leave persistence and pushing to autosave,
    // so we don't write the library here only to have the editor overwrite it with the old title
    const store = useStore.getState();
    if (nav.readingId === doc.id && store.docId === doc.id) {
      store.setTitle(title);
    } else {
      const local = localMode || isLocalId(doc.id);
      if (local) updateLocalDoc(doc.id, { title });
      else saveMirrorLocal(doc.id, { title });
      if (!local) void syncNow();
    }
    setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, title } : d)) ?? null);
    toast(t("已重命名"), "success");
  };

  const moveToNewCategory = async (doc: DocMeta) => {
    const name = (
      await askInput({
        title: t("新建文件夹并移入"),
        placeholder: t("文件夹名称，可用 / 建子文件夹"),
      })
    )?.trim();
    if (!name) return;
    void moveDoc(doc, name.slice(0, 100));
  };

  /** Push/write back to Feishu: on conflict, force overwrite after confirmation; without write permission, guide the user to upgrade the authorization */
  const pushToFeishu = async (doc: DocMeta) => {
    if (localMode || isLocalId(doc.id)) {
      toast(t("本地文章还没上云，登录并同步后才能推送到飞书"), "error");
      return;
    }
    if (!online) {
      toast(t("离线时无法推送，联网后再试"), "error");
      return;
    }
    if (pushingFeishu) return;
    setPushingFeishu(true);
    try {
      await syncNow(); // Flush unsaved local changes to the cloud first so what gets pushed is the latest content
      toast(t("正在推送到飞书，篇幅长或图片多时需要一点时间…"), "info");
      const push = (force: boolean) =>
        fetch("/api/feishu/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documentId: doc.id, force }),
        });
      let res = await push(false);
      let data = await res.json().catch(() => ({}));
      if (res.status === 409 && data.conflict) {
        const ok = await askConfirm({
          title: t("飞书侧有更新"),
          message: t(
            "「{name}」在飞书里自上次同步后有改动，继续推送会用 xedit 的内容覆盖飞书侧。要覆盖吗？",
            { name: doc.title || t(UNTITLED_DOC) }
          ),
          confirmText: t("覆盖推送"),
          danger: true,
        });
        if (!ok) return;
        toast(t("正在覆盖推送…"), "info");
        res = await push(true);
        data = await res.json().catch(() => ({}));
      }
      if (res.status === 403 && data.needWriteAuth) {
        const ok = await askConfirm({
          title: t("需要开通写入权限"),
          message: t(
            "推送需在你的飞书应用「权限管理」里再开通 3 个免审权限：wiki:wiki、docx:document、docs:document.media:upload。开通后点「重新授权」完成升级，再推送一次即可。"
          ),
          confirmText: t("重新授权"),
        });
        if (ok) {
          window.open(
            "/api/feishu/authorize?write=1",
            "xedit-feishu-auth",
            "width=520,height=680,menubar=no,toolbar=no"
          );
        }
        return;
      }
      if (!res.ok) {
        toast(t(data.error ?? tk("推送失败")), "error");
        return;
      }
      const extra =
        data.imageFailed > 0 ? t("（{n} 张图片转存失败）", { n: data.imageFailed }) : "";
      toast(
        data.action === "created"
          ? t("已推送到飞书知识库{extra}", { extra })
          : t("已写回飞书原文档{extra}", { extra }),
        "success"
      );
    } catch {
      toast(t("推送失败：网络异常"), "error");
    } finally {
      setPushingFeishu(false);
    }
  };

  return {
    creating,
    refreshing,
    pushingFeishu,
    refreshDocs,
    createDoc,
    createDocQuietly,
    createFromTemplate,
    removeDoc,
    restoreDoc,
    hardDeleteDoc,
    emptyVaultTrash,
    moveDoc,
    renameDoc,
    moveToNewCategory,
    pushToFeishu,
  };
}

