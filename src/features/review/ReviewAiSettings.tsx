"use client";

/**
 * 审核条上那颗胶囊点开的面板：只有审核类型一项，
 * 跟启动面板是同一张表（见 ReviewSettings.tsx）。
 *
 * 改完不自动重跑。早先是「关掉面板顺手重跑一趟」，结果只是点开看一眼，
 * 面板一关就先烧掉一次额度。现在给一颗明摆着的按钮，
 * 什么时候按由用户说了算。
 */
import { useRef } from "react";
import { RefreshCw, X } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { ReviewSettingsFields, reviewPanel } from "./ReviewSettings";

export function ReviewAiSettings({ onClose, onRerun }: { onClose: () => void; onRerun: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);

  return (
    <div ref={panelRef} className={`${reviewPanel} absolute right-4 top-9 z-30`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--ink)]">审核设置</span>
        <button
          className="cursor-pointer rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          title="收起"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>

      <ReviewSettingsFields />

      <button
        className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-1.5 text-[12px] text-white transition-opacity hover:opacity-90"
        onClick={() => {
          onClose();
          onRerun();
        }}
      >
        <RefreshCw size={12} />
        按此设置重新审核
      </button>
    </div>
  );
}
