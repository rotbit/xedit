"use client";

/**
 * Reading panel for the summary: a wide panel that drops down below the review bar.
 *
 * The summary is often a paragraph of a hundred or two characters. It used to be squeezed into a 12px strip (and a 260px card in the comment column),
 * which read like a disclaimer. Now it gets a proper place to read: body font size, generous line height, wide enough, and it scrolls if too long.
 * Both layouts (with / without comment column) open this same panel from 「总评」 (Summary).
 */
import { useRef } from "react";
import { X } from "lucide-react";
import { AiIcon } from "@/components/AiIcon";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";

export function ReviewSummaryPanel({ text, onClose }: { text: string; onClose: () => void }) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("总评")}
      className="review-pop absolute inset-x-0 top-[42px] z-30 mx-auto w-[min(600px,calc(100%-32px))] rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_12px_40px_rgba(0,0,0,0.14)] dark:shadow-[0_12px_40px_rgba(0,0,0,0.55)]"
    >
      <div className="flex items-center gap-1.5 border-b border-[var(--hairline-soft)] px-4 py-2.5">
        <AiIcon size={14} className="shrink-0 text-[var(--accent)]" />
        <span className="text-[13px] font-medium text-[var(--ink)]">{t("总评")}</span>
        <button
          className="ml-auto cursor-pointer rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          title={t("收起")}
          onClick={onClose}
        >
          <X size={14} />
        </button>
      </div>
      {/* Models sometimes write in paragraphs; keep line breaks as-is */}
      <p className="max-h-[min(60vh,480px)] overflow-y-auto whitespace-pre-wrap px-4 py-3.5 text-[14px] leading-[1.85] text-[var(--ink)]">
        {text}
      </p>
    </div>
  );
}
