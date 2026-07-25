/** 侧栏里非分类的虚拟视图键，与真实分类路径共用 activeCat 一个字段 */
export const ALL = "__all__";
export const TRASH = "__trash__";
export const ASSETS = "__assets__";
export const STATS = "__stats__";

/** 是否为虚拟视图键（而非真实分类路径） */
export function isVirtualCat(path: string): boolean {
  return path === ALL || path === TRASH || path === ASSETS || path === STATS;
}

/** 无分类文章的归属；同时是保留名，不允许用户新建同名分类 */
export const UNCATEGORIZED = "未分类";

/** 分类树最大层级 */
export const MAX_DEPTH = 3;

/** 拖拽悬停时落点行的高亮样式 */
export const DROP_HL = "bg-[var(--accent-wash)] shadow-[inset_0_0_0_1.5px_var(--accent)]";

/** 侧栏行的基础样式：选中态强调，未选中态 hover 提亮 */
export function rowCls(active: boolean): string {
  return active
    ? "bg-[var(--sidebar-active)] font-medium text-[var(--accent-deep)]"
    : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]";
}

/** 侧栏行右侧计数气泡样式 */
export function countCls(active: boolean): string {
  return active ? "bg-[var(--panel)]/70 text-[var(--accent-deep)]" : "text-[var(--ink-faint)]";
}

/** 弹出菜单条目样式 */
export const menuItemCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";

/** 弹出菜单里的危险操作条目样式 */
export const menuDangerCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40";

/** 弹出菜单浮层样式 */
export const menuPanelCls =
  "fixed z-40 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]";
