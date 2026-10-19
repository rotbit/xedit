/**
 * Shared styles for popup menu items. They live in the components layer: both the Dropdown and the sidebar context menu
 * (features/workspace) use them, and components shouldn't import from features.
 * Items that should stay open after a click call stopPropagation themselves.
 */
export const menuItemCls =
  "flex w-full cursor-pointer items-center gap-2 px-3.5 py-1.5 text-[13px] text-[var(--ink)] hover:bg-[var(--paper)]";
