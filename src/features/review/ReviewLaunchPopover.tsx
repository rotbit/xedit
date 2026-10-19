"use client";

/**
 * The small panel from the top bar's 「审核」 (Review) button: first settle what to review and with what, then start.
 *
 * Clicking used to start right away with the last (or default) settings; users only found out after seeing a column of comments
 * that it reviewed the wrong type, wasting tens of seconds and a run of quota. Now the choice comes before starting.
 *
 * When the site has no key configured for the provider, 「开始审核」 (Start review) is disabled: this path used to quietly return locally faked comments,
 * which is worse than nothing. Now it says plainly what's missing (keys are all configured server-side; here you can only pick another provider).
 */
import { useRef } from "react";
import { AiIcon } from "@/components/AiIcon";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { ReviewHistoryList } from "./ReviewHistory";
import { ReviewSettingsFields, reviewPanel, useReviewKeyReady } from "./ReviewSettings";
import { useT } from "@/i18n/useT";

export function ReviewLaunchPopover({
  docId,
  onClose,
  onStart,
  onOpenRecord,
}: {
  docId: string;
  onClose: () => void;
  onStart: () => void;
  /** Skip re-reviewing and open a past run from history */
  onOpenRecord: (id: string) => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  const { ready, hint } = useReviewKeyReady();
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("AI 审核")}
      className={`${reviewPanel} absolute right-0 top-[calc(100%+6px)] z-20 text-left`}
    >
      <div className="mb-2 flex items-center gap-1.5">
        <AiIcon size={14} className="shrink-0 text-[var(--accent)]" />
        <span className="text-[12px] font-medium text-[var(--ink)]">{t("AI 审核")}</span>
      </div>

      <ReviewSettingsFields />

      <button
        className="mt-2.5 flex w-full cursor-pointer items-center justify-center gap-1.5 rounded-md bg-[var(--accent)] px-2 py-1.5 text-[12px] text-white transition-opacity hover:opacity-90 disabled:cursor-default disabled:opacity-40"
        disabled={!ready}
        onClick={() => {
          onClose();
          onStart();
        }}
      >
        {t("开始审核")}
      </button>
      {!ready ? (
        <p className="mt-1.5 text-[11px] leading-snug text-[var(--ink-faint)]">{hint}</p>
      ) : null}

      {/* Already reviewed? Don't spend quota again: past comments are all here, just open one */}
      <div className="mt-3 border-t border-[var(--hairline-soft)] pt-2.5 empty:hidden">
        <ReviewHistoryList
          docId={docId}
          emptyHint={false}
          onOpen={(id) => {
            onClose();
            onOpenRecord(id);
          }}
        />
      </div>
    </div>
  );
}
