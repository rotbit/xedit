"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ALL, ASSETS, STATS, TRASH, isVirtualCat } from "../constants";
import type { SidebarPrefs } from "./useSidebarPrefs";

interface Params {
  prefs: SidebarPrefs;
  /** 打开文章时顺手收掉可能还开着的文档菜单 */
  closeDocMenu: () => void;
}

/**
 * 工作台导航：当前分类 / 正在阅读的文章 / 搜索词。
 * 编辑器返回时带 ?doc=<id>，直接落到该文章的阅读视图。
 */
export function useWorkspaceNav({ prefs, closeDocMenu }: Params) {
  const searchParams = useSearchParams();
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [readingId, setReadingId] = useState<string | null>(() => {
    if (typeof window === "undefined") return null;
    return new URLSearchParams(window.location.search).get("doc");
  });

  // 客户端导航下 window.location 有时序竞态，从 useSearchParams 读取；
  // 渲染期间带守卫地调整状态（React 推荐模式），地址栏清理放 effect
  const urlDoc = searchParams.get("doc");
  const [consumedUrlDoc, setConsumedUrlDoc] = useState<string | null>(null);
  if (urlDoc && urlDoc !== consumedUrlDoc) {
    setConsumedUrlDoc(urlDoc);
    setReadingId(urlDoc);
  }
  useEffect(() => {
    if (urlDoc) window.history.replaceState(null, "", "/");
  }, [urlDoc]);

  /** 侧栏全局搜索：在阅读/足迹/图片库视图里输入时先切回文章列表 */
  const onSearch = (v: string) => {
    setSearch(v);
    if (!v) return;
    if (readingId) setReadingId(null);
    if (activeCat === STATS || activeCat === ASSETS) setActiveCat(ALL);
  };

  const openCategory = (path: string) => {
    setActiveCat(path);
    setReadingId(null);
    setSearch("");
    prefs.closeDrawerOnMobile();
    if (!isVirtualCat(path)) prefs.expandPath(path);
  };

  const openDoc = (id: string) => {
    // 回收站视图渲染不了阅读器，切回常规视图再打开
    if (activeCat === TRASH) setActiveCat(ALL);
    setReadingId(id);
    closeDocMenu();
    prefs.closeDrawerOnMobile();
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
