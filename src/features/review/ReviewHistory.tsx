"use client";

/**
 * Review history: which runs this document has had; clicking one brings back its comments (no model call, no quota spent).
 *
 * There's only one list: embedded both in the launch panel from the top bar's 「审核」 (Review) button and in the panel from the review bar's 「历史」 (History) button.
 * Records are stored on the server (see lib/ai/reviewHistory), so they survive closing review or switching devices.
 */
import { useEffect, useRef, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { reviewKindsLabel } from "@/lib/ai/reviewKinds";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { deleteReviewRecord, formatRecordTime, listReviewHistory } from "./history";
import { reviewPanel } from "./ReviewSettings";
import type { ReviewRecordMeta } from "./types";
import { tk } from "@/i18n/t";
import { useT } from "@/i18n/useT";

export function ReviewHistoryList({
  docId,
  currentId,
  onOpen,
  emptyHint = true,
}: {
  docId: string;
  /** The run currently being viewed: highlighted, and no need to click it again */
  currentId?: string | null;
  onOpen: (id: string) => void;
  /** Whether to say something when there are none (not in the launch panel: first-time users don't need to know there's "no history yet") */
  emptyHint?: boolean;
}) {
  const t = useT();
  const [records, setRecords] = useState<ReviewRecordMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    listReviewHistory(docId, abort.signal)
      .then(setRecords)
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : tk("历史记录读不出来"));
      });
    return () => abort.abort();
  }, [docId]);

  const remove = (id: string) => {
    // Remove it from the list first: deleting history isn't worth making people wait; put it back if the delete actually fails
    const before = records;
    setRecords((rs) => rs?.filter((r) => r.id !== id) ?? null);
    deleteReviewRecord(id).catch(() => setRecords(before));
  };

  if (error) {
    return emptyHint ? <p className="text-[11.5px] text-[var(--ink-faint)]">{t(error)}</p> : null;
  }
  if (!records) {
    return emptyHint ? <p className="text-[11.5px] text-[var(--ink-faint)]">{t("正在读取…")}</p> : null;
  }
  if (records.length === 0) {
    return emptyHint ? (
      <p className="text-[11.5px] leading-snug text-[var(--ink-faint)]">
        {t("这篇文章还没有审核记录。每审完一趟会自动存在这里。")}
      </p>
    ) : null;
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] text-[var(--ink-faint)]">
        <History size={12} />
        {t("历史记录（点开回看，不重新审）")}
      </div>
      <ul className="-mx-1 max-h-[216px] overflow-y-auto">
        {records.map((r) => {
          const on = r.id === currentId;
          return (
            <li key={r.id} className="group flex items-center">
              <button
                className={`flex min-w-0 flex-1 cursor-pointer items-baseline gap-2 rounded-md px-1.5 py-1 text-left transition-colors hover:bg-[var(--accent-wash)] disabled:cursor-default ${
                  on ? "bg-[var(--accent-wash)]" : ""
                }`}
                disabled={on}
                title={r.model ? t("模型：{model}", { model: r.model }) : undefined}
                onClick={() => onOpen(r.id)}
              >
                <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink)]">
                  {formatRecordTime(r.createdAt)}
                </span>
                <span className="min-w-0 truncate text-[11px] text-[var(--ink-faint)]">
                  {reviewKindsLabel(r.kinds, t)} · {t("{n} 条", { n: r.total })}{on ? ` · ${t("正在看")}` : ""}
                </span>
              </button>
              {on ? null : (
                <button
                  className="ml-0.5 shrink-0 cursor-pointer rounded p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--ink)] focus:opacity-100 group-hover:opacity-100"
                  title={t("删掉这条记录")}
                  onClick={() => remove(r.id)}
                >
                  <Trash2 size={12} />
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Panel opened by the 「历史」 (History) button on the review bar */
export function ReviewHistoryPanel({
  docId,
  currentId,
  onOpen,
  onClose,
}: {
  docId: string;
  currentId: string | null;
  onOpen: (id: string) => void;
  onClose: () => void;
}) {
  const t = useT();
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label={t("审核历史")}
      className={`${reviewPanel} review-pop absolute right-4 top-[42px] z-30 text-left`}
    >
      <ReviewHistoryList
        docId={docId}
        currentId={currentId}
        onOpen={(id) => {
          onClose();
          onOpen(id);
        }}
      />
    </div>
  );
}
