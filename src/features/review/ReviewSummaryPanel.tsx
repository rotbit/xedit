"use client";

/**
 * 总评的阅读面板：从审核条底下垂下来的一张宽面板。
 *
 * 总评常常是一两百字的一段话。早先把它塞在一条 12px 的窄条里（意见栏里则是 260px 宽的小卡），
 * 读起来像在看免责声明。现在给它一块正经读东西的地方：正文字号、宽行距、够宽，太长就自己滚。
 * 两种版式（有意见栏 / 没意见栏）点「总评」开的都是这一张。
 */
import { useRef } from "react";
import { X } from "lucide-react";
import { AiIcon } from "@/components/AiIcon";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";

export function ReviewSummaryPanel({ text, onClose }: { text: string; onClose: () => void }) {
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="总评"
      className="review-pop absolute inset-x-0 top-[42px] z-30 mx-auto w-[min(600px,calc(100%-32px))] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_12px_40px_rgba(0,0,0,0.14)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--hairline-soft)] px-4 py-2.5">
        <AiIcon size={14} className="shrink-0 text-[var(--accent)]" />
        <span className="text-[13px] font-medium text-[var(--ink)]">总评</span>
        <button
          className="ml-auto cursor-pointer rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          title="收起"
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {/* 模型偶尔会分段写，换行照原样留着 */}
      <p className="max-h-[min(60vh,480px)] overflow-y-auto whitespace-pre-wrap px-4 py-3.5 text-[14px] leading-[1.85] text-[var(--ink)]">
        {text}
      </p>
    </div>
  );
}
