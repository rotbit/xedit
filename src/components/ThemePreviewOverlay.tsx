"use client";

import { X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { useStore } from "@/store/useStore";
import { getTheme } from "@/lib/themes";
import { Preview } from "./Preview";

/**
 * 真实主题预览浮层：全屏呈现「复制到公众号」的成品排版（复用 Preview 渲染管线，
 * 100% 还原所选主题）。即时渲染编辑器里一键唤起，Esc 或点关闭退出。
 */
export function ThemePreviewOverlay({ open, onClose }: { open: boolean; onClose: () => void }) {
  const themeId = useStore((s) => s.themeId);
  useEscape(onClose, open);
  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex flex-col bg-[var(--paper)]">
      <div className="flex h-12 shrink-0 items-center gap-3 border-b border-[var(--hairline)] bg-[var(--panel)] px-4">
        <span className="text-[13px] font-medium text-[var(--ink)]">真实主题预览</span>
        <span className="rounded-md bg-[var(--accent-wash)] px-2 py-0.5 text-[11.5px] text-[var(--ink-soft)]">
          {getTheme(themeId).name}
        </span>
        <span className="text-[11.5px] text-[var(--ink-faint)]">复制到公众号后就是这个效果</span>
        <span className="flex-1" />
        <button
          className="flex h-8 cursor-pointer items-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[12.5px] text-[var(--ink)] transition-colors hover:bg-[var(--paper)]"
          onClick={onClose}
        >
          <X size={13} />
          关闭 (Esc)
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <Preview />
      </div>
    </div>
  );
}
