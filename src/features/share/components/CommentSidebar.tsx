"use client";

// 批注侧栏（桌面）：进行中/已解决线程列表（从 SharedArticle 搬出）

import { Check, RotateCcw } from "lucide-react";
import { fmtTime } from "../lib/format";
import type { Thread } from "../SharedArticle";
import { AnchorQuote } from "./AnchorQuote";

export function CommentSidebar({
  allowComment,
  openCount,
  sortedThreads,
  activeId,
  openThread,
  resolveThread,
}: {
  allowComment: boolean;
  openCount: number;
  sortedThreads: { open: Thread[]; resolved: Thread[] };
  activeId: string | null;
  openThread: (id: string, scrollTo?: boolean) => void;
  resolveThread: (id: string, resolved: boolean) => Promise<void>;
}) {
  return (
    <aside className="hidden w-[280px] shrink-0 lg:block">
      <div className="sticky top-0 pt-1">
        <p className="mb-3 text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">
          批注 {openCount > 0 ? `· ${openCount}` : ""}
        </p>
        {sortedThreads.open.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--hairline)] px-3 py-4 text-[12px] leading-relaxed text-[var(--ink-faint)]">
            {allowComment
              ? "还没有批注。选中正文文字，或把鼠标移到图片、视频上，点「批注」即可发表意见。"
              : "该分享未开放批注。"}
          </p>
        ) : (
          <div className="flex flex-col gap-2">
            {sortedThreads.open.map((t) => (
              <button
                key={t.root.id}
                className={`cursor-pointer rounded-lg border px-3 py-2.5 text-left transition-colors ${
                  activeId === t.root.id
                    ? "border-amber-400 bg-amber-50/60 dark:bg-amber-950/20"
                    : "border-[var(--hairline)] bg-[var(--panel)] hover:border-amber-300"
                }`}
                onClick={() => openThread(t.root.id, true)}
              >
                <div className="flex items-center gap-2">
                  <span className="text-[12px] font-medium text-[var(--ink)]">
                    {t.root.author}
                  </span>
                  <span className="text-[11px] text-[var(--ink-faint)]">
                    {fmtTime(t.root.createdAt)}
                  </span>
                  {!t.range ? (
                    <span className="rounded bg-[var(--paper)] px-1 text-[10px] text-[var(--ink-faint)]">
                      原文已修改
                    </span>
                  ) : null}
                </div>
                <div className="mt-1">
                  <AnchorQuote
                    anchorType={t.root.anchorType}
                    anchorText={t.root.anchorText}
                  />
                </div>
                <p className="mt-1 line-clamp-2 text-[12px] leading-relaxed text-[var(--ink-soft)]">
                  {t.root.body}
                </p>
                {t.replies.length > 0 ? (
                  <p className="mt-1 text-[11px] text-[var(--ink-faint)]">
                    {t.replies.length} 条回复
                  </p>
                ) : null}
              </button>
            ))}
          </div>
        )}

        {sortedThreads.resolved.length > 0 ? (
          <>
            <p className="mb-2 mt-5 text-[12px] tracking-[0.15em] text-[var(--ink-faint)]">
              已解决 · {sortedThreads.resolved.length}
            </p>
            <div className="flex flex-col gap-2">
              {sortedThreads.resolved.map((t) => (
                <div
                  key={t.root.id}
                  className="rounded-lg border border-[var(--hairline-soft)] px-3 py-2 opacity-70"
                >
                  <div className="flex items-center gap-2">
                    <Check size={12} className="text-emerald-600" />
                    <span className="text-[12px] text-[var(--ink-soft)]">{t.root.author}</span>
                    <span className="flex-1" />
                    {t.root.mine ? (
                      <button
                        className="flex cursor-pointer items-center gap-1 text-[11px] text-[var(--ink-faint)] hover:text-[var(--ink)]"
                        onClick={() => void resolveThread(t.root.id, false)}
                      >
                        <RotateCcw size={11} />
                        恢复
                      </button>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-1 text-[12px] text-[var(--ink-faint)]">
                    {t.root.body}
                  </p>
                </div>
              ))}
            </div>
          </>
        ) : null}
      </div>
    </aside>
  );
}
