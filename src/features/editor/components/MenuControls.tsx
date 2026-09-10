"use client";

import { menuItemCls } from "@/components/Dropdown";

/** 菜单里的开关行：点击不关闭菜单，便于连续切换 */
export function ToggleRow({
  label,
  value,
  onChange,
}: {
  label: string;
  value: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      className={menuItemCls}
      onClick={(e) => {
        e.stopPropagation();
        onChange(!value);
      }}
    >
      <span className="flex-1 text-left">{label}</span>
      <span
        className={`relative h-4 w-7 rounded-full transition-colors ${value ? "bg-[var(--accent)]" : "bg-[var(--hairline-strong)]"}`}
      >
        <span
          className={`absolute top-0.5 h-3 w-3 rounded-full bg-white transition-all ${value ? "left-3.5" : "left-0.5"}`}
        />
      </span>
    </button>
  );
}
