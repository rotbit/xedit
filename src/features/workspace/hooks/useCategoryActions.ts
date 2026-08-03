"use client";

import { listLocalDocs, updateLocalDoc, saveLocalCats } from "@/lib/localDocs";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";
import { askInput, askConfirm } from "@/components/PromptDialog";
import { ALL, MAX_DEPTH, UNCATEGORIZED } from "../constants";
import type { AuthMode } from "./useAuthMode";
import type { DocLibrary } from "./useDocLibrary";
import type { WorkspaceNav } from "./useWorkspaceNav";

interface Params {
  auth: AuthMode;
  library: DocLibrary;
  nav: WorkspaceNav;
}

const parentOf = (path: string) =>
  path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "";

const nameOf = (path: string) =>
  path.includes("/") ? path.slice(path.lastIndexOf("/") + 1) : path;

/** 分类的增删改。分类迁移会连带子孙分类与其中文章整体随迁 */
export function useCategoryActions({ auth, library, nav }: Params) {
  const { localMode, online } = auth;
  const { customCats, setCustomCats, setDocs } = library;

  const persistCustomCats = (next: string[]) => {
    setCustomCats(next);
    if (localMode) {
      saveLocalCats(next);
      return;
    }
    void fetch("/api/settings", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ categories: next }),
    });
  };

  /** 云端分类操作需要联网；本地模式不受限 */
  const requireOnline = (): boolean => {
    if (!localMode && !online) {
      toast("离线时分类操作暂不可用，联网后再试", "error");
      return false;
    }
    return true;
  };

  const validNewPath = (path: string): boolean => {
    const parts = path.split("/").map((p) => p.trim());
    if (parts.some((p) => !p)) {
      toast("分类名不能为空", "error");
      return false;
    }
    if (parts.length > MAX_DEPTH) {
      toast(`最多支持 ${MAX_DEPTH} 级分类`, "error");
      return false;
    }
    return true;
  };

  const createCategory = async (parentPath?: string) => {
    const name = (
      await askInput({
        title: parentPath ? `在「${parentPath}」下新建子分类` : "新建分类",
        placeholder: parentPath ? "子分类名称" : "分类名称，可用 / 建子分类",
      })
    )?.trim();
    if (!name) return;
    const path = parentPath ? `${parentPath}/${name.replace(/\//g, "")}` : name;
    if (!validNewPath(path)) return;
    if (path === UNCATEGORIZED || customCats.includes(path)) {
      toast("分类已存在", "error");
      return;
    }
    persistCustomCats([...customCats, path]);
    nav.openCategory(path);
  };

  /** 把分类 path（含子孙分类与其中文章）整体迁移为 to：重命名与拖拽移动共用 */
  const relocateCategory = async (path: string, to: string): Promise<boolean> => {
    const remap = (c: string) =>
      c === path ? to : c.startsWith(`${path}/`) ? to + c.slice(path.length) : c;
    if (localMode) {
      for (const d of listLocalDocs()) {
        const cat = d.category || UNCATEGORIZED;
        if (remap(cat) !== cat) updateLocalDoc(d.id, { category: remap(cat) });
      }
      saveLocalCats(Array.from(new Set([...customCats.map(remap), to])));
    } else {
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "rename", from: path, to }),
      });
      if (!res.ok) return false;
    }
    setDocs(
      (prev) => prev?.map((d) => ({ ...d, category: remap(d.category || UNCATEGORIZED) })) ?? null
    );
    setCustomCats((prev) => Array.from(new Set([...prev.map(remap), to])));
    if (nav.activeCat === path || nav.activeCat.startsWith(`${path}/`)) {
      nav.setActiveCat(remap(nav.activeCat));
    }
    // 正打开的文章在被迁移的子树里：编辑器 store 的分类同步改掉，
    // 否则下次自动保存会带旧路径回写，把已改名/移动的文件夹又「复活」
    const store = useStore.getState();
    if (store.docId) {
      const cur = store.category || UNCATEGORIZED;
      if (remap(cur) !== cur) store.setCategory(remap(cur));
    }
    return true;
  };

  const renameCategory = async (path: string) => {
    const oldName = nameOf(path);
    const name = (
      await askInput({
        title: `重命名「${oldName}」`,
        defaultValue: oldName,
        confirmText: "重命名",
      })
    )
      ?.trim()
      .replace(/\//g, "");
    if (!name || name === oldName) return;
    const parent = parentOf(path);
    const to = parent ? `${parent}/${name}` : name;
    if (to === UNCATEGORIZED) {
      toast("分类已存在", "error");
      return;
    }
    if (!requireOnline()) return;
    if (await relocateCategory(path, to)) toast("已重命名", "success");
    else toast("重命名失败", "error");
  };

  /** 拖拽把分类挂到新父级下（parent 空串 = 提升为顶级分类） */
  const moveCategory = async (path: string, parent: string) => {
    const to = parent ? `${parent}/${nameOf(path)}` : nameOf(path);
    if (to === path) return;
    if (to === UNCATEGORIZED) {
      toast("不能与「未分类」同名", "error");
      return;
    }
    if (!requireOnline()) return;
    if (await relocateCategory(path, to)) {
      toast(parent ? `已移动到「${parent}」` : "已设为顶级分类", "success");
    } else {
      toast("移动失败", "error");
    }
  };

  const removeCategory = async (path: string) => {
    const ok = await askConfirm({
      title: "删除分类",
      message: `删除分类「${path}」及其子分类？其中的文章会移入「未分类」。`,
      confirmText: "删除",
      danger: true,
    });
    if (!ok) return;
    const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
    if (localMode) {
      for (const d of listLocalDocs()) {
        if (inSub(d.category || UNCATEGORIZED)) updateLocalDoc(d.id, { category: UNCATEGORIZED });
      }
      saveLocalCats(customCats.filter((c) => !inSub(c)));
    } else {
      if (!online) {
        toast("离线时分类操作暂不可用，联网后再试", "error");
        return;
      }
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", from: path }),
      });
      if (!res.ok) {
        toast("删除失败", "error");
        return;
      }
    }
    setDocs(
      (prev) =>
        prev?.map((d) =>
          inSub(d.category || UNCATEGORIZED) ? { ...d, category: UNCATEGORIZED } : d
        ) ?? null
    );
    setCustomCats((prev) => prev.filter((c) => !inSub(c)));
    if (inSub(nav.activeCat)) nav.setActiveCat(ALL);
    // 同 relocateCategory：别让编辑器的旧分类把删掉的文件夹写回来
    const store = useStore.getState();
    if (store.docId && inSub(store.category || UNCATEGORIZED)) {
      store.setCategory(UNCATEGORIZED);
    }
    toast("已删除分类", "success");
  };

  return { createCategory, renameCategory, moveCategory, removeCategory };
}

export type CategoryActions = ReturnType<typeof useCategoryActions>;
