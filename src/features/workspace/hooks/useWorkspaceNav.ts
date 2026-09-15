"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { isDocumentSaved, persistEditorDocument } from "@/lib/editorPersistence";
import { useStore } from "@/store/useStore";
import { ALL, ASSETS, TRASH, isVirtualCat } from "../constants";
import { readLocal, writeLocal } from "../lib/storage";
import type { SidebarPrefs } from "./useSidebarPrefs";

/** 打开中的标签页本地记忆：刷新/重开后原样回来 */
const K_TABS = "xedit:open-tabs";

interface TabsState {
  /** 打开的文章 id，顺序即标签栏顺序 */
  tabs: string[];
  /** 当前激活的标签；null = 标签还开着，但停在列表视图 */
  active: string | null;
}

const NO_TABS: TabsState = { tabs: [], active: null };

function readTabs(): TabsState {
  try {
    const raw = readLocal(K_TABS);
    if (!raw) return NO_TABS;
    const parsed: unknown = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return NO_TABS;
    const { tabs, active } = parsed as Partial<TabsState>;
    // 回读的 id 可能已经不存在（别的设备删了）：这里不过滤——本 hook 拿不到文库，
    // 由标签栏渲染时按 library.docs 过滤，nav 内部一律用原值计算
    const list = Array.isArray(tabs) ? tabs.filter((id) => typeof id === "string") : [];
    const cur = typeof active === "string" && list.includes(active) ? active : null;
    return { tabs: list, active: cur };
  } catch {
    return NO_TABS;
  }
}

/** 打开某篇：已开着只激活；否则按 Obsidian 的规矩决定新开还是顶掉当前标签 */
function withTab(prev: TabsState, id: string, newTab: boolean): TabsState {
  if (prev.tabs.includes(id)) return prev.active === id ? prev : { ...prev, active: id };
  // ⌘点击、一个标签都没有、或当前没激活标签（停在列表视图）→ 追加新标签
  if (newTab || prev.tabs.length === 0 || prev.active === null)
    return { tabs: [...prev.tabs, id], active: id };
  // 默认单击：在当前标签里打开（替换）
  return { tabs: prev.tabs.map((t) => (t === prev.active ? id : t)), active: id };
}

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
 * 工作台导航：当前分类 / 打开中的标签页 / 正在阅读的文章 / 搜索词。
 * 文章可以同时开着多篇（Obsidian 式标签栏），readingId 是其中激活的那一篇。
 * 编辑器返回时带 ?doc=<id>，直接落到该文章的阅读视图并并入标签。
 */
export function useWorkspaceNav({ prefs, closeDocMenu }: Params) {
  const searchParams = useSearchParams();
  const [activeCat, setActiveCat] = useState<string>(ALL);
  const [search, setSearch] = useState("");
  const [state, setState] = useState<TabsState>(() => {
    if (typeof window === "undefined") return NO_TABS;
    const stored = readTabs();
    const doc = new URLSearchParams(window.location.search).get("doc");
    return doc ? withTab(stored, doc, true) : stored;
  });
  const { tabs, active: readingId } = state;

  // 客户端导航下 window.location 有时序竞态，从 useSearchParams 读取；
  // 渲染期间带守卫地调整状态（React 推荐模式），地址栏清理放 effect
  const urlDoc = searchParams.get("doc");
  const [consumedUrlDoc, setConsumedUrlDoc] = useState<string | null>(null);
  if (urlDoc && urlDoc !== consumedUrlDoc) {
    setConsumedUrlDoc(urlDoc);
    // 初始化时已并过同一个 id 的话 withTab 原样返回，React 直接跳过这次更新
    setState((prev) => withTab(prev, urlDoc, true));
  }
  useEffect(() => {
    if (urlDoc) window.history.replaceState(null, "", "/");
  }, [urlDoc]);

  useEffect(() => {
    writeLocal(K_TABS, JSON.stringify(state));
  }, [state]);

  /** 只是离开阅读视图（标签继续开着），与「关闭标签」区分开 */
  const deactivate = () =>
    setState((prev) => (prev.active === null ? prev : { ...prev, active: null }));

  /** 侧栏全局搜索：在阅读/图片库视图里输入时先切回文章列表 */
  const onSearch = (v: string) => {
    setSearch(v);
    if (!v) return;
    deactivate();
    if (activeCat === ASSETS) setActiveCat(ALL);
  };

  const openCategory = (path: string) => {
    setActiveCat(path);
    deactivate();
    setSearch("");
    prefs.closeDrawerOnMobile();
    if (!isVirtualCat(path)) prefs.expandPath(path);
  };

  /** @param opts.newTab ⌘/Ctrl 点击：另开一个标签，而不是顶掉当前这个 */
  const openDoc = (id: string, opts?: { newTab?: boolean }) => {
    // 回收站视图渲染不了阅读器，切回常规视图再打开
    if (activeCat === TRASH) setActiveCat(ALL);
    flushEditorBeforeSwitch(id);
    setState((prev) => withTab(prev, id, opts?.newTab === true));
    closeDocMenu();
    prefs.closeDrawerOnMobile();
  };

  const activateTab = (id: string) => {
    if (activeCat === TRASH) setActiveCat(ALL);
    flushEditorBeforeSwitch(id);
    setState((prev) => (prev.tabs.includes(id) ? withTab(prev, id, false) : prev));
  };

  /**
   * 关闭标签：关的若是激活的那个，接替顺序为右邻 → 左邻 → 无（退回列表视图）。
   * 这里不 flush 落盘：删除文章后也走这条路，把已删文档再写回镜像会把它「救活」。
   */
  const closeTab = (id: string) => {
    setState((prev) => {
      const i = prev.tabs.indexOf(id);
      if (i === -1) return prev;
      const next = prev.tabs.filter((t) => t !== id);
      if (prev.active !== id) return { ...prev, tabs: next };
      return { tabs: next, active: next[i] ?? next[i - 1] ?? null };
    });
  };

  /**
   * 循环切换标签。
   * @param pool 限定可切换的 id（调用方按文库过滤后传入），缺省用全部标签
   */
  const nextTab = (delta: 1 | -1, pool?: readonly string[]) => {
    const list = pool && pool.length > 0 ? pool : tabs;
    if (list.length < 2) return;
    const cur = readingId ? list.indexOf(readingId) : -1;
    const from = cur === -1 ? (delta === 1 ? -1 : 0) : cur;
    const id = list[(from + delta + list.length) % list.length];
    if (id) activateTab(id);
  };

  /** 兼容既有调用：null = 关闭当前激活的标签，非 null = 打开该文章 */
  const setReadingId = (id: string | null) => {
    if (id === null) {
      if (readingId) closeTab(readingId);
      return;
    }
    openDoc(id);
  };

  return {
    activeCat,
    setActiveCat,
    tabs,
    readingId,
    setReadingId,
    search,
    onSearch,
    isTrash: activeCat === TRASH,
    openCategory,
    openDoc,
    activateTab,
    closeTab,
    nextTab,
  };
}

export type WorkspaceNav = ReturnType<typeof useWorkspaceNav>;
