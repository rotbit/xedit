"use client";

import { Moon, Sun } from "lucide-react";

/** 夜间模式开关：偏好存 localStorage，data-theme 挂在 <html> 上；图标显隐交给 CSS dark: 变体 */
export function DarkToggle() {
  const toggle = () => {
    const el = document.documentElement;
    const next = el.dataset.theme !== "dark";
    if (next) el.dataset.theme = "dark";
    else delete el.dataset.theme;
    try {
      localStorage.setItem("xedit-dark", next ? "1" : "0");
    } catch {
      // 忽略
    }
  };

  return (
    <button
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
      onClick={toggle}
      title="切换日间 / 夜间模式"
    >
      <Moon size={15} className="dark:hidden" />
      <Sun size={15} className="hidden dark:block" />
    </button>
  );
}
