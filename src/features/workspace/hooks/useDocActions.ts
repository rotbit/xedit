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
          if (nav.isTrash) setTrashDocs(getActiveVault()?.listTrash() ?? []);
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
  const createDocLocally = (
    cat: string,
    relist: () => DocMeta[],
    title?: string,
    content?: string
  ) => {
    try {
      const doc = createLocalDoc({ category: cat, title, content });
      setDocs(relist());
      nav.openDoc(doc.id);
    } catch {
      toast("新建失败：浏览器存储空间不足", "error");
    }
  };

  /** @param init 预填字段：标题（`[[双向链接]]` 指向不存在的文章时按目标标题建稿）与正文（套模板） */
  const createDoc = async (category?: string, init?: { title?: string; content?: string }) => {
    const cat = category ?? (isVirtualCat(nav.activeCat) ? UNCATEGORIZED : nav.activeCat);
    const title = init?.title?.trim() || "未命名文章";
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
      applyServerDoc(doc); // 新文档立即入镜像，编辑页/离线随时可用
      setDocs(mergedCloudList());
      nav.openDoc(doc.id);
      setCreating(false);
    } catch {
      toast("新建失败", "error");
      setCreating(false);
    }
  };

  /**
   * 按模板建稿：复制模板正文（含 frontmatter），替换 `{{date}}` 之类的变量。
   * 先问标题，因为 `{{title}}` 要用它，写完才能落库。
   */
  const createFromTemplate = async (template: DocMeta, category?: string) => {
    const name = (
      await askInput({
        title: "用模板新建",
        placeholder: "文章标题",
        defaultValue: defaultTitleFromTemplate(template.title),
      })
    )?.trim();
    if (!name) return; // 取消
    const title = name.slice(0, 200);
    // 从模板建出来的是正经文章，不该落回模板分类（当前正停在「模板」目录里时尤其）
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
    const label = doc.title || "未命名文章";
    if (localMode) {
      // 磁盘文库的删除是移进 .trash/（后端 deleteDoc 已如此），浏览器存储则是真删
      const vault = getActiveVault();
      const ok = await askConfirm({
        title: "删除文章",
        message: vault
          ? `删除「${label}」？移入回收站，可在回收站恢复。`
          : `删除「${label}」？本地文章删除后无法找回。`,
        confirmText: vault ? "移入回收站" : "删除",
        danger: true,
      });
      if (!ok) return;
      deleteLocalDoc(doc.id);
      setDocs(listLocalDocs());
      notifyDocsChanged(); // 回收站列表也听这个事件
      // 删掉的文章不该还开着：正读着它就退回列表
      if (nav.readingId === doc.id) nav.setReadingId(null);
      toast(vault ? "已移入回收站" : "已删除", "success");
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
      // 移进回收站的文章同样不该还开着
      if (nav.readingId === doc.id) nav.setReadingId(null);
      toast("已移入回收站", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  const restoreDoc = async (doc: DocMeta) => {
    const vault = localMode ? getActiveVault() : null;
    if (vault) {
      // 先看恢复成不成，再动列表：失败时把行留在回收站里，否则文件还在 .trash/
      // 却已从列表消失，用户再也找不到它（只能刷新页面）
      const back = vault.restoreFromTrash(doc.id);
      if (!back) {
        toast("恢复失败：回收站里找不到这个文件", "error");
        return;
      }
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      setDocs(listLocalDocs());
      notifyDocsChanged();
      toast("已恢复", "success");
      return;
    }
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
    const vault = localMode ? getActiveVault() : null;
    const ok = await askConfirm({
      title: "彻底删除",
      message: vault
        ? `彻底删除「${doc.title || "未命名文章"}」？彻底删除后无法找回。`
        : `彻底删除「${doc.title || "未命名文章"}」？包括全部版本历史，无法找回。`,
      confirmText: "彻底删除",
      danger: true,
    });
    if (!ok) return;
    if (vault) {
      vault.purgeFromTrash(doc.id);
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      toast("已彻底删除", "success");
      return;
    }
    const res = await fetch(`/api/documents/${doc.id}?hard=1`, { method: "DELETE" });
    if (res.ok) {
      setTrashDocs((prev) => prev?.filter((d) => d.id !== doc.id) ?? null);
      toast("已彻底删除", "success");
    } else {
      toast("删除失败", "error");
    }
  };

  /** 清空回收站：只在磁盘文库下可用（.trash/ 里的文件全删） */
  const emptyVaultTrash = async () => {
    const vault = localMode ? getActiveVault() : null;
    if (!vault) return;
    const count = vault.listTrash().length;
    if (count === 0) {
      toast("回收站是空的");
      return;
    }
    const ok = await askConfirm({
      title: "清空回收站",
      message: `删除回收站里的 ${count} 篇文章？彻底删除后无法找回。`,
      confirmText: "清空",
      danger: true,
    });
    if (!ok) return;
    vault.emptyTrash();
    setTrashDocs([]);
    toast("回收站已清空", "success");
  };

  const moveDoc = async (doc: DocMeta, category: string) => {
    const local = localMode || isLocalId(doc.id);
    // 正在编辑的就是这篇：编辑器 store 里的分类必须同步换掉，
    // 否则下一次自动保存会带着旧分类整包回写，文章又「跳回」原文件夹
    const store = useStore.getState();
    if (store.docId === doc.id) store.setCategory(category);
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
      await askInput({ title: "新建文件夹并移入", placeholder: "文件夹名称，可用 / 建子文件夹" })
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

