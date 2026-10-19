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
 * Display preferences for the sidebar and list, all remembered locally:
 * collapsed state, expanded category set, card/list view.
 * On narrow screens the sidebar is a drawer, collapsed by default and not written back to memory.
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

  /** Set the sidebar width and persist it. Not used while dragging: the live width comes from useDragDivider's local state,
   *  and this is called once on release (both share the same clamp range via clampSidebarWidth) */
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

  /** Expanding only opens this level; collapsing also collapses any expanded subfolders inside, so reopening shows only the current level */
  const toggleExpand = (path: string) => {
    const next = new Set(expanded);
    if (next.has(path)) {
      for (const p of next) if (p === path || p.startsWith(`${path}/`)) next.delete(p);
    } else next.add(path);
    persistExpanded(next);
  };

  /**
   * Expand to this node: open its ancestors along with itself. Entering a folder should reveal what's inside —
   * the sidebar has no persistent disclosure arrows, so clicking the name is the most natural way to expand; collapsing uses the icon or the "···" menu
   */
  const expandPath = (path: string) => {
    const parts = path.split("/");
    const next = new Set(expanded);
    for (let i = 1; i <= parts.length; i++) next.add(parts.slice(0, i).join("/"));
    persistExpanded(next);
  };

  /** Expand a single node only, merging into the latest state (used for auto-expand while hovering a drag) */
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

  /** Narrow-screen drawer: auto-collapse after picking a category/doc (the desktop sidebar stays put and is unaffected) */
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
    docView,
    switchDocView,
    sidebarWidth,
    setSidebarWidth,
    resetSidebarWidth,
  };
}

/** Valid sidebar width range. Exported for the drag handle: the value shown while dragging must use the same clamp as the persisted one */
export function clampSidebarWidth(px: number): number {
  return Math.round(Math.min(Math.max(px, SIDEBAR_MIN_W), SIDEBAR_MAX_W));
}

export type SidebarPrefs = ReturnType<typeof useSidebarPrefs>;
