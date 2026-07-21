/** 切换深/浅色：偏好存 localStorage，data-theme 挂在 <html> 上（Obsidian 深色优先） */
export function toggleDarkMode() {
  const el = document.documentElement;
  const next = el.dataset.theme !== "dark";
  if (next) el.dataset.theme = "dark";
  else delete el.dataset.theme;
  try {
    localStorage.setItem("xedit-dark", next ? "1" : "0");
  } catch {
    // 忽略
  }
}

export function isDarkMode(): boolean {
  if (typeof document === "undefined") return true;
  return document.documentElement.dataset.theme === "dark";
}
