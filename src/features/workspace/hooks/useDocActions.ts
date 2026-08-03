"use client";

import { useState } from "react";
import {
  isLocalId,
  listLocalDocs,
  createLocalDoc,
  updateLocalDoc,
  deleteLocalDoc,
  listLocalCats,
} from "@/lib/localDocs";
import { saveMirrorLocal, removeMirrorDoc, applyServerDoc } from "@/lib/docStore";
import { syncNow } from "@/lib/sync";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";
import { askInput, askConfirm } from "@/components/PromptDialog";
import { UNCATEGORIZED, isVirtualCat } from "../constants";
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

/** 文章的增删改与列表刷新，按本地模式 / 离线 / 云端三条路径分派 */
export function useDocActions({ auth, library, nav }: Params) {
  const { localMode, online } = auth;
  const { setDocs, setCustomCats, setTrashDocs } = library;
  const [creating, setCreating] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [pushingFeishu, setPushingFeishu] = useState(false);

  /** 手动刷新：登录态跑一轮完整同步（拉取其他设备 / MCP 客户端的改动），本地模式重读本地库 */
  const refreshDocs = async () => {
    if (refreshing) return;
    setRefreshing(true);
    try {
      const work = async () => {
        if (localMode) {
          setDocs(listLocalDocs());
          setCustomCats(listLocalCats());
        } else if (nav.isTrash) {
          const list = await fetch("/api/documents?trash=1")
            .then((r) => (r.ok ? r.json() : []))
            .catch(() => []);
          setTrashDocs(list);
        } else {
          await syncNow(); // 完成后 SYNC_DONE_EVENT 会刷新列表，这里再兜底读一次
          setDocs(mergedCloudList());
        }
      };
      // 至少转 400ms，避免瞬间完成时图标闪一下看不出反馈
      await Promise.all([work(), new Promise((r) => setTimeout(r, 400))]);
      toast("已刷新", "success");
    } finally {
      setRefreshing(false);
    }
  };

  /** 本地建稿（未登录，或登录但离线——联网后由同步引擎自动上云） */
  const createDocLocally = (cat: string, relist: () => DocMeta[]) => {
    try {
      const doc = createLocalDoc({ category: cat });
      setDocs(relist());
      nav.openDoc(doc.id);
    } catch {
      toast("新建失败：浏览器存储空间不足", "error");
    }
  };

  const createDoc = async (category?: string) => {
    const cat = category ?? (isVirtualCat(nav.activeCat) ? UNCATEGORIZED : nav.activeCat);
    if (localMode) return createDocLocally(cat, listLocalDocs);
    if (!online) return createDocLocally(cat, mergedCloudList);

    setCreating(true);
    try {
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: "未命名文章", content: "", category: cat }),
      });
      if (!res.ok) throw new Error();
      const doc = await res.json();
      applyServerDoc(doc); // 新文档立即入镜像，编辑页/离线随时可用
      setDocs(mergedCloudList());
      nav.openDoc(doc.id);
      setCreating(false);
    } catch {
      toast("新建失败", "error");
      setCreating(false);
    }
  };

  const removeDoc = async (doc: DocMeta) => {
    const label = doc.title || "未命名文章";
    if (localMode) {
      const ok = await askConfirm({
        title: "删除文章",
        message: `删除「${label}」？本地文章删除后无法找回。`,
        confirmText: "删除",
        danger: true,
      });
      if (!ok) return;
      deleteLocalDoc(doc.id);
      setDocs(listLocalDocs());
      // 删的是正打开的文章：退回列表，避免残留空白阅读器
      if (nav.readingId === doc.id) nav.setReadingId(null);
      toast("已删除", "success");
      return;
    }
    if (!online) {
      toast("离线时无法删除云端文章，联网后再试", "error");
      return;
    }
    const ok = await askConfirm({
      title: "删除文章",
      message: `把「${label}」移入回收站？可随时恢复。`,
      confirmText: "移入回收站",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}`, { method: "DELETE" });
    if (res.ok) {
      removeMirrorDoc(doc.id);
      setDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      if (nav.readingId === doc.id) nav.setReadingId(null);
      toast("已移入回收站", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  const restoreDoc = async (doc: DocMeta) => {
    const res = await fetch(`/api/documents/${doc.id}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ restore: true }),
    });
    if (res.ok) {
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      // 恢复的文章由同步引擎拉回镜像并刷新列表
      void syncNow();
      toast("已恢复", "success");
    } else {
      toast("恢复失败", "error");
    }
  };

  const hardDeleteDoc = async (doc: DocMeta) => {
    const ok = await askConfirm({
      title: "彻底删除",
      message: `彻底删除「${doc.title || "未命名文章"}」？包括全部版本历史，无法找回。`,
      confirmText: "彻底删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/documents/${doc.id}?hard=1`, { method: "DELETE" });
    if (res.ok) {
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      toast("已彻底删除", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  const moveDoc = async (doc: DocMeta, category: string) => {
    const local = localMode || isLocalId(doc.id);
    // 本地优先：未上云的落本地库，已上云的先落镜像（离线同样生效）再推送
    if (local) updateLocalDoc(doc.id, { category });
    else saveMirrorLocal(doc.id, { category });
    setDocs((prev) => prev?.map((d) => (d.id === doc.id ? { ...d, category } : d)) ?? null);
    toast(`已移动到「${category}」`, "success");
    if (!local) void syncNow();
  };

  const renameDoc = async (doc: DocMeta) => {
    const name = (
      await askInput({
        title: "重命名文章",
        placeholder: "文章标题",
        defaultValue: doc.title || "未命名文章",
      })
    )?.trim();
    if (!name || name === doc.title) return;
    const title = name.slice(0, 200);
    // 正在编辑的就是这篇：只改编辑器状态，持久化与推送交给自动保存，
    // 免得这里先写库、编辑器又用旧标题回写覆盖
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
    toast("已重命名", "success");
  };

  const moveToNewCategory = async (doc: DocMeta) => {
    const name = (
      await askInput({ title: "新建分类并移入", placeholder: "分类名称，可用 / 建子分类" })
    )?.trim();
    if (!name) return;
    void moveDoc(doc, name.slice(0, 100));
  };

  /** 推送/写回飞书：冲突时确认后强制覆盖；未开写入权限时引导升级授权 */
  const pushToFeishu = async (doc: DocMeta) => {
    if (localMode || isLocalId(doc.id)) {
      toast("本地文章还没上云，登录并同步后才能推送到飞书", "error");
      return;
    }
    if (!online) {
      toast("离线时无法推送，联网后再试", "error");
      return;
    }
    if (pushingFeishu) return;
    setPushingFeishu(true);
    try {
      await syncNow(); // 先把手上未保存的改动冲上云，推的才是最新内容
      toast("正在推送到飞书，篇幅长或图片多时需要一点时间…", "info");
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
          title: "飞书侧有更新",
          message: `「${doc.title || "未命名文章"}」在飞书里自上次同步后有改动，继续推送会用 xedit 的内容覆盖飞书侧。要覆盖吗？`,
          confirmText: "覆盖推送",
          danger: true,
        });
        if (!ok) return;
        toast("正在覆盖推送…", "info");
        res = await push(true);
        data = await res.json().catch(() => ({}));
      }
      if (res.status === 403 && data.needWriteAuth) {
        const ok = await askConfirm({
          title: "需要开通写入权限",
          message:
            "推送需在你的飞书应用「权限管理」里再开通 3 个免审权限：wiki:wiki、docx:document、docs:document.media:upload。开通后点「重新授权」完成升级，再推送一次即可。",
          confirmText: "重新授权",
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
        toast(data.error ?? "推送失败", "error");
        return;
      }
      const extra = data.imageFailed > 0 ? `（${data.imageFailed} 张图片转存失败）` : "";
      toast(
        data.action === "created"
          ? `已推送到飞书知识库${extra}`
          : `已写回飞书原文档${extra}`,
        "success"
      );
    } catch {
      toast("推送失败：网络异常", "error");
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
    removeDoc,
    restoreDoc,
    hardDeleteDoc,
    moveDoc,
    renameDoc,
    moveToNewCategory,
    pushToFeishu,
  };
}

export type DocActions = ReturnType<typeof useDocActions>;
