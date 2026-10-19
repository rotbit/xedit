/** Sidebar keys for virtual (non-category) views; they share the activeCat field with real category paths */
export const ALL = "__all__";
export const TRASH = "__trash__";
export const ASSETS = "__assets__";
/** "Today": todo aggregation + daily log, not a doc list */
export const TODAY = "__today__";
/** "Completed history": calendar review page entered from Today, showing what was done and how much was written by day / week */
export const HISTORY = "__history__";
/** "Settings": entered from the sidebar avatar menu; gathers account, appearance, reading/editing, AI review, authorized apps and other user settings */
export const SETTINGS = "__settings__";

/** Whether this is a virtual view key (rather than a real category path) */
export function isVirtualCat(path: string): boolean {
  return path === ALL || path === TRASH || path === ASSETS || path === TODAY || path === HISTORY || path === SETTINGS;
}

/** Where uncategorized docs belong; also a reserved name, so users can't create a category with it.
 *  Defined in lib/docDefaults (the server needs it too); re-exported here so old import paths keep working */
export { UNCATEGORIZED } from "@/lib/docDefaults";

/** Max category tree depth: Feishu mirror prefixes (飞书知识库/space/…) take 3–4 levels on their own,
 *  and stacking user folders easily goes past 8; the real hard limit is the 100-char category field (checked separately before drag),
 *  so this is only a loose cap against runaway nesting */
export const MAX_DEPTH = 12;

/** Tree indent: 17px per level, the same as Obsidian's file tree, evenly spaced without compression — guide lines must sit directly under the parent icon slot
 *  and row highlights start at the indent, so compressing levels makes them collide. Deep titles rely on truncation; a total cap still guards against very deep legacy paths */
export function treeIndent(depth: number): number {
  return Math.min(depth * 17, 102);
}

/** Left margin of tree rows: hover/selected backgrounds start here, so the parent guide line (x = 15 + treeIndent(depth-1))
 *  stays outside the row's left edge and isn't covered (same as Obsidian). Root rows span the full width */
export function rowInset(depth: number): number {
  return depth === 0 ? 0 : 2 + treeIndent(depth);
}

/**
 * Left padding of tree rows (folder rows, doc rows), placing the center of the 14px icon slot at 15 + treeIndent(depth):
 * - depth 0: no row margin, padding 8 → icon center 8 + 7 = 15, aligned with the icons of NavRow and the search box.
 * - depth > 0: margin rowInset(depth) = 2 + treeIndent(depth),
 *   padding p satisfies 2 + treeIndent(depth) + p + 7 = 15 + treeIndent(depth) → p = 6.
 *   The parent guide line at 15 + treeIndent(depth - 1) = row left edge - 4 still shows outside the row's left edge;
 *   the margin is 2 rather than more so there's a full 6px between the background edge and the icon, which doesn't feel cramped.
 * CategoryRow's TreeGuide draws guide lines at 15 + treeIndent(parent depth), right on the center of the parent row's icon slot.
 */
export function rowPadLeft(depth: number): number {
  return depth === 0 ? 8 : 6;
}

/** Highlight style for the target row while hovering a drag (drop into this category) */
export const DROP_HL = "bg-[var(--accent-wash)] shadow-[inset_0_0_0_1.5px_var(--accent)]";
/** Insertion indicator for drag reordering: insert before/after this row. 3px is what's visible at a glance in a light sidebar */
export const DROP_LINE_TOP = "shadow-[0_-3px_0_0_var(--accent)]";
export const DROP_LINE_BOTTOM = "shadow-[0_3px_0_0_var(--accent)]";

/** Base sidebar row style: emphasized when selected, brightened on hover when not */
export function rowCls(active: boolean): string {
  return active
    ? "bg-[var(--sidebar-active)] text-[var(--accent-deep)]"
    : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]";
}

/** Count on the right of sidebar rows: bare number, no pill; same gray whether selected or not — the number is just a side note */
export function countCls(): string {
  return "text-[11px] tabular-nums text-[var(--ink-faint)]";
}

/** Popup menu item style: defined in the components layer (dropdowns use the same one); only re-exported here */
export { menuItemCls } from "@/components/menuStyles";

/** Style for destructive items in popup menus */
export const menuDangerCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40";

/** Popup menu overlay style */
export const menuPanelCls =
  "fixed z-40 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]";
