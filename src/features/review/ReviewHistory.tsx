"use client";

/**
 * 审核历史：这篇文章审过哪几趟，点一趟就把当时的意见翻出来（不调模型、不花额度）。
 *
 * 列表只有一份：顶栏「审核」按钮弹出的启动面板里嵌它，审核条上那颗「历史」按钮点开的面板也嵌它。
 * 记录存在服务端（见 lib/ai/reviewHistory），关掉审核、换台设备都还在。
 */
import { useEffect, useRef, useState } from "react";
import { History, Trash2 } from "lucide-react";
import { reviewKindsLabel } from "@/lib/ai/reviewKinds";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { deleteReviewRecord, formatRecordTime, listReviewHistory } from "./history";
import { reviewPanel } from "./ReviewSettings";
import type { ReviewRecordMeta } from "./types";

export function ReviewHistoryList({
  docId,
  currentId,
  onOpen,
  emptyHint = true,
}: {
  docId: string;
  /** 眼下正看着的那一趟：标出来，也不必再点 */
  currentId?: string | null;
  onOpen: (id: string) => void;
  /** 一条都没有时要不要说一声（启动面板里不说：第一次用的人不需要知道「还没有历史」） */
  emptyHint?: boolean;
}) {
  const [records, setRecords] = useState<ReviewRecordMeta[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const abort = new AbortController();
    listReviewHistory(docId, abort.signal)
      .then(setRecords)
      .catch((e: unknown) => {
        if (abort.signal.aborted) return;
        setError(e instanceof Error ? e.message : "历史记录读不出来");
      });
    return () => abort.abort();
  }, [docId]);

  const remove = (id: string) => {
    // 先从列表里拿掉：删一条历史不值得让人等，真没删掉再放回来
    const before = records;
    setRecords((rs) => rs?.filter((r) => r.id !== id) ?? null);
    deleteReviewRecord(id).catch(() => setRecords(before));
  };

  if (error) {
    return emptyHint ? <p className="text-[11.5px] text-[var(--ink-faint)]">{error}</p> : null;
  }
  if (!records) {
    return emptyHint ? <p className="text-[11.5px] text-[var(--ink-faint)]">正在读取…</p> : null;
  }
  if (records.length === 0) {
    return emptyHint ? (
      <p className="text-[11.5px] leading-snug text-[var(--ink-faint)]">
        这篇文章还没有审核记录。每审完一趟会自动存在这里。
      </p>
    ) : null;
  }

  return (
    <div>
      <div className="mb-1 flex items-center gap-1 text-[11px] text-[var(--ink-faint)]">
        <History size={11} />
        历史记录（点开回看，不重新审）
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
                title={r.model ? `模型：${r.model}` : undefined}
                onClick={() => onOpen(r.id)}
              >
                <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink)]">
                  {formatRecordTime(r.createdAt)}
                </span>
                <span className="min-w-0 truncate text-[11px] text-[var(--ink-faint)]">
                  {reviewKindsLabel(r.kinds)} · {r.total} 条{on ? " · 正在看" : ""}
                </span>
              </button>
              {on ? null : (
                <button
                  className="ml-0.5 shrink-0 cursor-pointer rounded p-1 text-[var(--ink-faint)] opacity-0 transition-opacity hover:text-[var(--ink)] focus:opacity-100 group-hover:opacity-100"
                  title="删掉这条记录"
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

/** 审核条上「历史」按钮点开的面板 */
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
  const panelRef = useRef<HTMLDivElement>(null);
  useDismissMenu(panelRef, onClose, true);
  useEscape(onClose);
  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-label="审核历史"
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
