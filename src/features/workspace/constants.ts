/** 侧栏里非分类的虚拟视图键，与真实分类路径共用 activeCat 一个字段 */
export const ALL = "__all__";
export const TRASH = "__trash__";
export const ASSETS = "__assets__";

/** 是否为虚拟视图键（而非真实分类路径） */
export function isVirtualCat(path: string): boolean {
  return path === ALL || path === TRASH || path === ASSETS;
}

/** 无分类文章的归属；同时是保留名，不允许用户新建同名分类 */
export const UNCATEGORIZED = "未分类";

/** 分类树最大层级：飞书镜像前缀（飞书知识库/空间/…）自身就占 3~4 层，
 *  再叠用户目录轻松过 8 层；真正的硬约束是分类字段 100 字符（拖拽前另行校验），
 *  这里只作防失控的宽松上限 */
export const MAX_DEPTH = 12;

/** 树缩进：每层 17px，与 Obsidian 文件树同宽，等距不压缩——引导线要落在箭头正下方、
 *  行高亮要从缩进处起，层距一压缩就互相压住。深层标题靠截断；仍设总上限防超深历史路径 */
export function treeIndent(depth: number): number {
  return Math.min(depth * 17, 102);
}

/** 树行的左外边距：悬停/选中底色从这里起，父级引导线（x = 16 + treeIndent(depth-1)）
 *  留在行左缘外侧不被盖住（Obsidian 同款）。根行铺满整宽 */
export function rowInset(depth: number): number {
  return depth === 0 ? 0 : 5 + treeIndent(depth);
}

/** 拖拽悬停时落点行的高亮样式（放入该分类） */
export const DROP_HL = "bg-[var(--accent-wash)] shadow-[inset_0_0_0_1.5px_var(--accent)]";
/** 拖拽排序的插入指示线：插到该行之前/之后。3px 才在浅色侧栏里一眼可见 */
export const DROP_LINE_TOP = "shadow-[0_-3px_0_0_var(--accent)]";
export const DROP_LINE_BOTTOM = "shadow-[0_3px_0_0_var(--accent)]";

/** 侧栏行的基础样式：选中态强调，未选中态 hover 提亮 */
export function rowCls(active: boolean): string {
  return active
    ? "bg-[var(--sidebar-active)] font-medium text-[var(--accent-deep)]"
    : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]";
}

/** 侧栏统计行右侧的小工具按钮（刷新、新建）。
 *  圆角另给：拼成 split button 时左右两半各自只圆一边 */
export const toolBtnBase =
  "flex h-6 cursor-pointer items-center justify-center text-[var(--ink-faint)] transition-colors hover:bg-[var(--sidebar-active)] disabled:opacity-60";
export const toolBtnCls = `${toolBtnBase} w-6 rounded-md`;

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

/** 侧栏底部「打开/同步文件夹」这排次要按钮：与工作台其他 ghost 按钮同款，
 *  压在深色侧栏上也够清楚。未登录的 VaultRow 与登录态的 VaultSyncRow 共用 */
export const vaultBtnCls =
  "flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--hairline)] px-2 text-[12.5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";

/** 弹出菜单浮层样式 */
export const menuPanelCls =
  "fixed z-40 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]";
