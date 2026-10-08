/** 侧栏里非分类的虚拟视图键，与真实分类路径共用 activeCat 一个字段 */
export const ALL = "__all__";
export const TRASH = "__trash__";
export const ASSETS = "__assets__";
/** 「今天」：待办汇总 + 当日记录，不是文章列表 */
export const TODAY = "__today__";

/** 是否为虚拟视图键（而非真实分类路径） */
export function isVirtualCat(path: string): boolean {
  return path === ALL || path === TRASH || path === ASSETS || path === TODAY;
}

/** 无分类文章的归属；同时是保留名，不允许用户新建同名分类。
 *  定义在 lib/docDefaults 里（服务端也要用），这里只转出去，老的 import 路径照旧能用 */
export { UNCATEGORIZED } from "@/lib/docDefaults";

/** 分类树最大层级：飞书镜像前缀（飞书知识库/空间/…）自身就占 3~4 层，
 *  再叠用户目录轻松过 8 层；真正的硬约束是分类字段 100 字符（拖拽前另行校验），
 *  这里只作防失控的宽松上限 */
export const MAX_DEPTH = 12;

/** 树缩进：每层 17px，与 Obsidian 文件树同宽，等距不压缩——引导线要落在父级图标位正下方、
 *  行高亮要从缩进处起，层距一压缩就互相压住。深层标题靠截断；仍设总上限防超深历史路径 */
export function treeIndent(depth: number): number {
  return Math.min(depth * 17, 102);
}

/** 树行的左外边距：悬停/选中底色从这里起，父级引导线（x = 15 + treeIndent(depth-1)）
 *  留在行左缘外侧不被盖住（Obsidian 同款）。根行铺满整宽 */
export function rowInset(depth: number): number {
  return depth === 0 ? 0 : 2 + treeIndent(depth);
}

/**
 * 树行（文件夹行、文章行）的左内边距，让 14px 图标位的中心落在 15 + treeIndent(depth)：
 * - depth 0：行无外边距，内边距 8 → 图标中心 8 + 7 = 15，与 NavRow、搜索框的图标同一条线。
 * - depth > 0：外边距 rowInset(depth) = 2 + treeIndent(depth)，
 *   内边距 p 满足 2 + treeIndent(depth) + p + 7 = 15 + treeIndent(depth) → p = 6。
 *   父级引导线在 15 + treeIndent(depth - 1) = 行左缘 - 4，仍露在行左缘外侧；
 *   外边距取 2 而不是更大，是为了让底色到图标之间留足 6px，不显得挤。
 * 引导线由 CategoryRow 的 TreeGuide 画在 15 + treeIndent(父 depth)，正好对准父行图标位中心。
 */
export function rowPadLeft(depth: number): number {
  return depth === 0 ? 8 : 6;
}

/** 拖拽悬停时落点行的高亮样式（放入该分类） */
export const DROP_HL = "bg-[var(--accent-wash)] shadow-[inset_0_0_0_1.5px_var(--accent)]";
/** 拖拽排序的插入指示线：插到该行之前/之后。3px 才在浅色侧栏里一眼可见 */
export const DROP_LINE_TOP = "shadow-[0_-3px_0_0_var(--accent)]";
export const DROP_LINE_BOTTOM = "shadow-[0_3px_0_0_var(--accent)]";

/** 侧栏行的基础样式：选中态强调，未选中态 hover 提亮 */
export function rowCls(active: boolean): string {
  return active
    ? "bg-[var(--sidebar-active)] text-[var(--accent-deep)]"
    : "text-[var(--ink-soft)] hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]";
}

/** 侧栏行右侧计数：裸数字，不加胶囊底；选中与否同一灰度，数字只是旁注 */
export function countCls(): string {
  return "text-[11px] tabular-nums text-[var(--ink-faint)]";
}

/** 弹出菜单条目样式：定义在 components 层（下拉菜单也用同一份），这里只做转出 */
export { menuItemCls } from "@/components/menuStyles";

/** 弹出菜单里的危险操作条目样式 */
export const menuDangerCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-left text-[13px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40";

/** 弹出菜单浮层样式 */
export const menuPanelCls =
  "fixed z-40 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] py-1.5 shadow-[0_10px_36px_rgba(0,0,0,0.16)]";
