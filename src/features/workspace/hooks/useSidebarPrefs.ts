"use client";

import { useState } from "react";
import { readLocal, writeLocal } from "../lib/storage";

export type DocView = "card" | "list";

const K_SIDEBAR = "xedit-sidebar-open";
const K_EXPANDED = "xedit-cat-expanded";
const K_VIEW = "xedit-doc-view";
const K_WIDTH = "xedit-sidebar-width";

export const SIDEBAR_DEFAULT_W = 248;
const SIDEBAR_MIN_W = 200;
const SIDEBAR_MAX_W = 420;

/**
 * 侧栏与列表的展示偏好，全部本地记忆：
 * 折叠状态、分类展开集合、卡片/列表视图。
 * 窄屏侧栏为抽屉模式，默认收起且不写回记忆。
 */
export function useSidebarPrefs() {
  const [sidebarOpen, setSidebarOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    if (window.innerWidth < 768) return false;
    return readLocal(K_SIDEBAR) !== "0";
  });

  const [expanded, setExpanded] = useState<Set<string>>(() => {
    if (typeof window === "undefined") return new Set();
    try {
      const raw = readLocal(K_EXPANDED);
      return new Set(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set();
    }
  });

  const [docView, setDocView] = useState<DocView>(() => {
    if (typeof window === "undefined") return "card";
    return readLocal(K_VIEW) === "list" ? "list" : "card";
  });

  const [sidebarWidth, setSidebarWidthState] = useState(() => {
    if (typeof window === "undefined") return SIDEBAR_DEFAULT_W;
    const n = Number(readLocal(K_WIDTH));
    return Number.isFinite(n) ? clampSidebarWidth(n) : SIDEBAR_DEFAULT_W;
  });

  /** 设定侧栏宽度并落盘。拖动过程中不走这里：实时宽度由 useDragDivider 的本地状态出，
   *  松手才调一次（同一个夹取区间靠 clampSidebarWidth 共用） */
  const setSidebarWidth = (px: number) => {
    const w = clampSidebarWidth(px);
    setSidebarWidthState(w);
    writeLocal(K_WIDTH, String(w));
  };

  const resetSidebarWidth = () => setSidebarWidth(SIDEBAR_DEFAULT_W);

  const persistExpanded = (next: Set<string>) => {
    setExpanded(next);
    writeLocal(K_EXPANDED, JSON.stringify(Array.from(next)));
  };

  const toggleExpand = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) next.delete(path);
    else next.add(path);
    persistExpanded(next);
  };

  /** 只展开祖先节点，让这一行在树里可见；它自己的展开态不动（点分类不自动铺开内容） */
  const expandAncestors = (path: string) => {
    const parts = path.split("/");
    if (parts.length < 2) return;
    const next = new Set(expanded);
    for (let i = 1; i < parts.length; i++) next.add(parts.slice(0, i).join("/"));
    persistExpanded(next);
  };

  /** 只展开单个节点，基于最新状态合并（拖拽悬停自动展开时使用） */
  const expandOne = (path: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.add(path);
      writeLocal(K_EXPANDED, JSON.stringify(Array.from(next)));
      return next;
    });
  };

  const toggleSidebar = () => {
    setSidebarOpen((v) => {
      writeLocal(K_SIDEBAR, v ? "0" : "1");
      return !v;
    });
  };

  const switchDocView = (v: DocView) => {
    setDocView(v);
    writeLocal(K_VIEW, v);
  };

  /** 窄屏抽屉：选定分类/文章后自动收起（桌面侧栏常驻，不受影响） */
  const closeDrawerOnMobile = () => {
    if (window.innerWidth < 768) setSidebarOpen(false);
  };

  return {
    sidebarOpen,
    setSidebarOpen,
    toggleSidebar,
    closeDrawerOnMobile,
    expanded,
    toggleExpand,
    expandAncestors,
    expandOne,
    docView,
    switchDocView,
    sidebarWidth,
    setSidebarWidth,
    resetSidebarWidth,
  };
}

/** 侧栏宽度的合法区间。导出给拖动手柄用：拖动中显示的值必须和最终落盘的值同一套夹取 */
export function clampSidebarWidth(px: number): number {
  return Math.round(Math.min(Math.max(px, SIDEBAR_MIN_W), SIDEBAR_MAX_W));
}

export type SidebarPrefs = ReturnType<typeof useSidebarPrefs>;
