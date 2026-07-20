"use client";

import { useEffect } from "react";

/** Esc 键触发 onClose（用于弹窗/抽屉关闭）；enabled 为 false 时（如生成中）不响应 */
export function useEscape(onClose: () => void, enabled = true) {
  useEffect(() => {
    if (!enabled) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, enabled]);
}
