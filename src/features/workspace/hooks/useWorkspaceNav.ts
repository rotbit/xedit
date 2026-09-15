"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isDocumentSaved, persistEditorDocument } from "@/lib/editorPersistence";
import { useStore } from "@/store/useStore";
import { ALL, ASSETS, TRASH, isVirtualCat } from "../constants";
import { removeLocal } from "../lib/storage";
import type { SidebarPrefs } from "./useSidebarPrefs";

/** 多标签时代留下的本地记忆，见到就清掉，免得一直占着 localStorage */
const K_LEGACY_TABS = "xedit:open-tabs";

/**
 * 切走当前文章前先落盘。编辑器的输入回调按 ~120ms 节流、自动保存又压着 800ms 防抖，
 * 直接换 docId 会被新文章的装载覆盖掉这两段还没落盘的编辑（useEditorDoc 里没有 flush）。
 * 先派事件让编辑器把压着的那一次同步吐进 store，再就地写盘——落盘由这里发起，
 * 所以事件带 flushOnly 标记，useEditorSave 不会再跑一遍手动保存（弹提示 + 归档版本）。
 */
function flushEditorBeforeSwitch(nextId: string | null) {
  if (typeof window === "undefined") return;
  const before = useStore.getState();
  if (!before.docId || before.docId === nextId) return;
  window.dispatchEvent(new CustomEvent("xedit:save-now", { detail: { flushOnly: true } }));
  const doc = useStore.getState();
  // 没有未落盘的改动就别白写一遍镜像（会平白标脏、多推一次云端）
  if (doc.docId !== before.docId || isDocumentSaved(doc)) return;
  // 状态行归新文章所有，这里不改 saveState；推送失败仍由镜像 dirty + 同步引擎兜底
  void persistEditorDocument(doc, () => {});
}

interface Params {
  prefs: SidebarPrefs;
  /** 打开文章时顺手收掉可能还开着的文档菜单 */
  closeDocMenu: () => void;
}

/**
 * 工作台导航：当前分类 / 正在阅读的文章 / 搜索词。
 * 同一时刻只开一篇，readingId 为 null 即停在列表视图。
 * 编辑器返回时带 ?doc=<id>，直接落到该文章的阅读视图。
 */
export function useWorkspaceNav({ prefs, closeDocMenu }: Params) {
  const searchParams = useSearchParams();
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  // 在读哪篇不落本地：刷新后回到列表是有意的，省得每次进来都被上次那篇挡住
  const [readingId, setReading] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("doc");
  });

  // 客户端导航下 window.location 有时序竞态，从 useSearchParams 读取；
  // 渲染期间带守卫地调整状态（React 推荐模式），地址栏清理放 effect
  const urlDoc = searchParams.get("doc");
  const [consumedUrlDoc, setConsumedUrlDoc] = useState<string | null>(null);
  if (urlDoc && urlDoc !== consumedUrlDoc) {
    setConsumedUrlDoc(urlDoc);
    setReading(urlDoc);
  }
  useEffect(() => {
    if (urlDoc) window.history.replaceState(null, "", "/");
  }, [urlDoc]);

  // 标签栏已下线，把老版本留在本地的那份记忆清一次
  useEffect(() => {
    removeLocal(K_LEGACY_TABS);
  }, []);

  /** 侧栏全局搜索：在阅读/图片库视图里输入时先切回文章列表 */
  const onSearch = (v: string) => {
    setSearch(v);
    if (!v) return;
    setReading(null);
    if (activeCat === ASSETS) setActiveCat(ALL);
  };

  const openCategory = (path: string) => {
    setActiveCat(path);
    setReading(null);
    setSearch("");
    prefs.closeDrawerOnMobile();
    if (!isVirtualCat(path)) prefs.expandAncestors(path);
  };

  const openDoc = (id: string) => {
    // 回收站视图渲染不了阅读器，切回常规视图再打开
    if (activeCat === TRASH) setActiveCat(ALL);
    flushEditorBeforeSwitch(id);
    setReading(id);
    closeDocMenu();
    prefs.closeDrawerOnMobile();
  };

  /** 打开某篇；null = 退回列表视图 */
  const setReadingId = (id: string | null) => {
    // 退回列表不 flush：删除文章后也走这条路，把已删文档再写回镜像会把它「救活」
    if (id === null) setReading(null);
    else openDoc(id);
  };

  return {
    activeCat,
    setActiveCat,
    readingId,
    setReadingId,
    search,
    onSearch,
    isTrash: activeCat === TRASH,
    openCategory,
    openDoc,
  };
}

export type WorkspaceNav = ReturnType<typeof useWorkspaceNav>;
