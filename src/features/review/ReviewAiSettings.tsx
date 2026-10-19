"use client";

/**
 * Panel opened by the pill on the review bar: just the review-type setting,
 * the same form as the launch panel (see ReviewSettings.tsx).
 *
 * Changes don't auto-rerun. It used to "rerun on panel close", so merely opening it to look
 * burned one run of quota as soon as it closed. Now there's an explicit button,
 * and the user decides when to press it.
 */
import { useRef } from "react";
import { RefreshCw, X } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { ReviewSettingsFields, reviewPanel } from "./ReviewSettings";
import { useT } from "@/i18n/useT";

export function ReviewAiSettings({ onClose, onRerun }: { onClose: () => void; onRerun: () => void }) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);

  return (
    <div ref={panelRef} className={`${reviewPanel} absolute right-4 top-9 z-30`}>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[12px] font-medium text-[var(--ink)]">{t("审核设置")}</span>
        <button
          className="cursor-pointer rounded p-0.5 text-[var(--ink-faint)] transition-colors hover:text-[var(--ink)]"
          title={t("收起")}
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
        {t("按此设置重新审核")}
      </button>
    </div>
  );
}
