/**
 * 弹出菜单条目的通用样式。放在 components 层：下拉菜单（Dropdown）与侧栏右键菜单
 * （features/workspace）都用它，而 components 不该反向 import features。
 * 需要点击后保持展开的条目自行 stopPropagation。
 */
export const menuItemCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";
