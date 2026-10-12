"use client";

import { Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/useT";

/**
 * 夜间偏好的 localStorage key。同一个 key 还写在两处首屏脚本里：
 * src/app/layout.tsx 的 THEME_INIT_SCRIPT 与 public/theme-init.js——它们是要在 React
 * 之前同步执行的裸 JS 字符串，没法 import 这个常量，改 key 时记得一起改。
 */
const DARK_KEY = "xedit-dark";

/** 当前是否夜间：以 <html data-theme> 为准（首屏脚本已按偏好挂好） */
export function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

/** 设定日间 / 夜间：偏好存 localStorage，data-theme 挂在 <html> 上 */
export function setDark(on: boolean) {
  const el = document.documentElement;
  if (on) el.dataset.theme = "dark";
  else delete el.dataset.theme;
  try {
    localStorage.setItem(DARK_KEY, on ? "1" : "0");
  } catch {
    // 隐私模式下 localStorage 会抛，主题当次生效即可
  }
}

/** 切换日间 / 夜间 */
export function toggleDark() {
  setDark(!isDark());
}

/** 夜间模式开关按钮；图标显隐交给 CSS dark: 变体 */
export function DarkToggle() {
  const t = useT();
  return (
    <button
      className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
      onClick={toggleDark}
      title={t("切换日间 / 夜间模式")}
    >
      <Moon size={16} className="dark:hidden" />
      <Sun size={16} className="hidden dark:block" />
    </button>
  );
}
