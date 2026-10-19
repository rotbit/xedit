"use client";

import { countCls, rowCls } from "../constants";

/** Sidebar row icon color: half a step lighter than text when unselected, same as text when selected */
export function iconTone(active: boolean): string {
  return active ? "text-[var(--accent-deep)]" : "text-[var(--ink-soft)]";
}

/**
 * Sidebar view/tool entry rows (Today, image library, trash).
 * Shares a grid with folder rows: 8px left padding + 14px icon slot + 8px gap + text,
 * so icon and text left edges line up on the same vertical line across the whole sidebar.
 */
export function NavRow({
  icon,
  label,
  active,
  count = 0,
  disabled,
  onClick,
  onContextMenu,
}: {
  icon: React.ReactNode;
  label: string;
  active: boolean;
  /** 0 or omitted draws no number */
  count?: number | null;
  disabled?: boolean;
  onClick: () => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  return (
    <button
      className={`flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-left text-[13px] transition-colors disabled:cursor-default ${rowCls(active)}`}
      disabled={disabled}
      onClick={onClick}
      onContextMenu={onContextMenu}
    >
      <span className={`flex w-[14px] shrink-0 justify-center ${iconTone(active)}`}>{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {count ? <span className={countCls()}>{count}</span> : null}
    </button>
  );
}
