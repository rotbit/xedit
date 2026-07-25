"use client";

import { useState } from "react";
import { readLocal, writeLocal } from "../lib/storage";

export type DocView = "card" | "list";

const K_SIDEBAR = "xedit-sidebar-open";
const K_EXPANDED = "xedit-cat-expanded";
const K_ROOT = "xedit-root-open";
const K_VIEW = "xedit-doc-view";

/**
 * 侧栏与列表的展示偏好，全部本地记忆：
 * 折叠状态、分类展开集合、根节点开合、卡片/列表视图。
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

  // 「全部文章」根节点默认展开
  const [rootOpen, setRootOpen] = useState(() => {
    if (typeof window === "undefined") return true;
    return readLocal(K_ROOT) !== "0";
  });

  const [docView, setDocView] = useState<DocView>(() => {
    if (typeof window === "undefined") return "card";
    return readLocal(K_VIEW) === "list" ? "list" : "card";
  });

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

  /** 展开路径上的所有节点（打开某个深层分类时使用） */
  const expandPath = (path: string) => {
    const next = new Set(expanded);
    const parts = path.split("/");
    for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join("/"));
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

  const toggleRoot = () => {
    setRootOpen((v) => {
      writeLocal(K_ROOT, v ? "0" : "1");
      return !v;
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
    expandPath,
    expandOne,
    rootOpen,
    toggleRoot,
    docView,
    switchDocView,
  };
}

export type SidebarPrefs = ReturnType<typeof useSidebarPrefs>;
