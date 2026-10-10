"use client";

import { countCls, rowCls } from "../constants";

/** 侧栏行图标的颜色：未选中比文字浅半档，选中与文字同色 */
export function iconTone(active: boolean): string {
  return active ? "text-[var(--accent-deep)]" : "text-[var(--ink-soft)]";
}

/**
 * 侧栏的视图/工具入口行（今天、图片库、回收站）。
 * 与文件夹行共用一套网格：左内边距 8px + 14px 图标位 + 8px 间距 + 文字，
 * 整条侧栏的图标左缘、文字左缘因此落在同一条竖线上。
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
  /** 0 或不传就不画数字 */
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
