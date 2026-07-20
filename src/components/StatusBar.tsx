"use client";

import { useMemo } from "react";
import { useStore, type SaveState } from "@/store/useStore";

const SAVE_LABEL: Record<SaveState, { text: string; cls: string }> = {
  local: { text: "仅保存在本地", cls: "text-[var(--ink-faint)]" },
  saving: { text: "同步中…", cls: "text-amber-600" },
  saved: { text: "已同步云端", cls: "text-emerald-600" },
  pending: { text: "已存本地，联网后同步", cls: "text-amber-600" },
  error: { text: "同步失败", cls: "text-red-600 dark:text-red-400" },
};

export function StatusBar() {
  const content = useStore((s) => s.content);
  const saveState = useStore((s) => s.saveState);

  const stats = useMemo(() => {
    const chars = content.replace(/\s/g, "").length;
    const lines = content.split("\n").length;
    const minutes = Math.max(1, Math.round(chars / 400));
    return { chars, lines, minutes };
  }, [content]);

  const save = SAVE_LABEL[saveState];

  return (
    <footer className="flex h-7 shrink-0 items-center gap-4 border-t border-[var(--hairline)] bg-[var(--panel)] px-4 text-[11px] text-[var(--ink-faint)]">
      <span>字数 {stats.chars}</span>
      <span>行数 {stats.lines}</span>
      <span>约 {stats.minutes} 分钟读完</span>
      <span className="flex-1" />
      <span className={`flex items-center gap-1.5 ${save.cls}`}>
        <span className="h-1.5 w-1.5 rounded-full bg-current" />
        {save.text}
      </span>
    </footer>
  );
}
