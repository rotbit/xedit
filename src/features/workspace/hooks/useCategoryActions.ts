"use client";

import { notifyDocsChanged, saveLocalCats } from "@/lib/localDocs";
import { getLocalBackend } from "@/lib/localBackend";
import { useStore } from "@/store/useStore";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";
import { askInput, askConfirm } from "@/components/PromptDialog";
import { ALL, MAX_DEPTH, UNCATEGORIZED } from "../constants";
import { displayCatPath, nameOf, parentOf } from "../lib/catPath";
import type { AuthMode } from "./useAuthMode";
import type { DocLibrary } from "./useDocLibrary";
import type { WorkspaceNav } from "./useWorkspaceNav";

interface Params {
  auth: AuthMode;
  library: DocLibrary;
  nav: WorkspaceNav;
}

/** Category create/rename/delete. Moving a category carries its descendant categories and their docs along */
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

  /** Cloud category operations need a connection; local mode is unaffected */
  const requireOnline = (): boolean => {
    if (!localMode && !online) {
      toast(t("离线时文件夹操作暂不可用，联网后再试"), "error");
      return false;
    }
    return true;
  };

  /**
   * Validate a category name and build the full path: empty name, depth limit and sibling duplicates checked in one go.
   * Create and rename used to each check half of this (rename didn't even check duplicates, so two sibling folders could get the same name
   * and then neither could be clicked reliably), so it's shared here. Returning null means a toast was shown and the caller should just return.
   */
  const assertCatName = (parent: string, name: string): string | null => {
    const path = parent ? `${parent}/${name}` : name;
    const parts = path.split("/").map((p) => p.trim());
    if (parts.some((p) => !p)) {
      toast(t("文件夹名不能为空"), "error");
      return null;
    }
    if (parts.length > MAX_DEPTH) {
      toast(t("最多支持 {n} 级文件夹", { n: MAX_DEPTH }), "error");
      return null;
    }
    if (path === UNCATEGORIZED || customCats.includes(path)) {
      toast(t("文件夹已存在"), "error");
      return null;
    }
    return path;
  };

  const createCategory = async (parentPath?: string) => {
    const name = (
      await askInput({
        title: parentPath
          ? t("在「{name}」下新建子文件夹", { name: displayCatPath(parentPath, t) })
          : t("新建文件夹"),
        placeholder: parentPath ? t("子文件夹名称") : t("文件夹名称，可用 / 建子文件夹"),
      })
    )?.trim();
    if (!name) return;
    // With a parent, strip / from the name (otherwise it spans two levels at once); top-level create keeps / so users can type a/b directly
    const path = assertCatName(parentPath ?? "", parentPath ? name.replace(/\//g, "") : name);
    if (!path) return;
    persistCustomCats([...customCats, path]);
    nav.openCategory(path);
  };

  /** Move category path (including descendant categories and their docs) to `to` as a whole: shared by rename and drag-move */
  const relocateCategory = async (path: string, to: string): Promise<boolean> => {
    const remap = (c: string) =>
      c === path ? to : c.startsWith(`${path}/`) ? to + c.slice(path.length) : c;
    if (localMode) {
      getLocalBackend().relocateCategory(path, to);
      notifyDocsChanged();
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
    // The open doc is inside the moved subtree: update the editor store's category too,
    // otherwise the next autosave writes back the old path and "resurrects" the renamed/moved folder
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
        title: t("重命名「{name}」", { name: oldName }),
        defaultValue: oldName,
        confirmText: t("重命名"),
      })
    )
      ?.trim()
      .replace(/\//g, "");
    if (!name || name === oldName) return;
    const to = assertCatName(parentOf(path), name);
    if (!to) return;
    if (!requireOnline()) return;
    if (await relocateCategory(path, to)) toast(t("已重命名"), "success");
    else toast(t("重命名失败"), "error");
  };

  /** Drag a category under a new parent (empty parent = promote to top level) */
  const moveCategory = async (path: string, parent: string) => {
    const to = parent ? `${parent}/${nameOf(path)}` : nameOf(path);
    if (to === path) return;
    if (to === UNCATEGORIZED) {
      toast(t("不能与「{name}」同名", { name: t(UNCATEGORIZED) }), "error");
      return;
    }
    if (!requireOnline()) return;
    if (await relocateCategory(path, to)) {
      toast(
        parent
          ? t("已移动到「{name}」", { name: displayCatPath(parent, t) })
          : t("已设为顶级文件夹"),
        "success"
      );
    } else {
      toast(t("移动失败"), "error");
    }
  };

  const removeCategory = async (path: string) => {
    const ok = await askConfirm({
      title: t("删除文件夹"),
      message: t("删除文件夹「{name}」及其子文件夹？其中的文章会移入「{target}」。", {
        name: displayCatPath(path, t),
        target: t(UNCATEGORIZED),
      }),
      confirmText: t("删除"),
      danger: true,
    });
    if (!ok) return;
    const inSub = (c: string) => c === path || c.startsWith(`${path}/`);
    if (localMode) {
      getLocalBackend().removeCategory(path);
      notifyDocsChanged();
    } else {
      // Reaching else means we're not in local mode, equivalent to requireOnline's check; don't duplicate the copy
      if (!requireOnline()) return;
      const res = await fetch("/api/categories", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "remove", from: path }),
      });
      if (!res.ok) {
        toast(t("删除失败"), "error");
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
    // Same as relocateCategory: don't let the editor's stale category write the deleted folder back
    const store = useStore.getState();
    if (store.docId && inSub(store.category || UNCATEGORIZED)) {
      store.setCategory(UNCATEGORIZED);
    }
    toast(t("已删除文件夹"), "success");
  };

  return { createCategory, renameCategory, moveCategory, removeCategory };
}

