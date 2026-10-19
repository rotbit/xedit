"use client";

import { Moon, Sun } from "lucide-react";
import { useT } from "@/i18n/useT";

/**
 * localStorage key for the dark-mode preference. The same key is also hard-coded in two first-paint scripts:
 * THEME_INIT_SCRIPT in src/app/layout.tsx and public/theme-init.js — they're raw JS strings that must run synchronously before React
 * and can't import this constant, so update them together if the key changes.
 */
const DARK_KEY = "xedit-dark";

/** Whether dark mode is on: <html data-theme> is the source of truth (already set from the preference by the first-paint script) */
export function isDark(): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset.theme === "dark";
}

/** Set light / dark: the preference goes to localStorage, data-theme goes on <html> */
export function setDark(on: boolean) {
  const el = document.documentElement;
  if (on) el.dataset.theme = "dark";
  else delete el.dataset.theme;
  try {
    localStorage.setItem(DARK_KEY, on ? "1" : "0");
  } catch {
    // localStorage throws in private mode; applying the theme for this session is enough
  }
}

/** Toggle light / dark */
export function toggleDark() {
  setDark(!isDark());
}

/** Dark mode toggle button; icon visibility is handled by the CSS dark: variant */
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
