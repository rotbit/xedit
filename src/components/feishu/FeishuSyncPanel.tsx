"use client";

// Feishu sync status panel: moved out of FeishuDialog; shows scanning / progress bar / recently processed / failure list / interruption notice

/**
 * Feishu sync status card: scanning, progress bar, current document, auto-retry, failure list, interruption notice.
 * It only reads state exposed by useFeishuSync and makes no requests itself; the sync loop runs in the hook,
 * so closing the dialog (unmounting this component) doesn't affect sync progress.
 */
import { Loader2 } from "lucide-react";
import type { FeishuSyncState } from "@/hooks/useFeishuSync";
import { useT } from "@/i18n/useT";

/** Status card shown while syncing or when there's progress/errors; renders nothing when there's nothing to show */
export function FeishuSyncPanel({ sync }: { sync: FeishuSyncState }) {
  const t = useT();
  const syncing = sync.syncing;
  const progress = sync.progress;

  // None of the three means this account has never synced: render nothing rather than leave an empty card in the dialog
  if (!(syncing || progress || sync.error)) return null;

  return (
    <section className="rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-soft)]">
      {sync.scanning ? (
        <p className="flex items-center gap-2">
          <Loader2 size={14} className="shrink-0 animate-spin text-[var(--accent)]" />
          {t("正在扫描知识库目录、同步第一批文档…")}
        </p>
      ) : progress ? (
        <>
          {/* Progress = documents checked (unchanged skips count too); the denominator is every document in the library */}
          <div className="mb-2 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--hairline)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                style={{
                  width: `${
                    // When total is 0 (empty wiki) draw it full at 100%, otherwise this would compute 0/0
                    progress.total > 0
                      ? Math.round(
                          ((progress.total - progress.pending) / progress.total) * 100
                        )
                      : 100
                  }%`,
                }}
              />
            </div>
            <span className="shrink-0 text-[11px] text-[var(--ink-faint)] [font-family:var(--mono)]">
              {progress.total - progress.pending}/{progress.total}
            </span>
          </div>
          <p>
            {t("新增 {created} · 更新 {updated} · 跳过 {skipped}", {
              created: progress.created,
              updated: progress.updated,
              skipped: progress.skipped,
            })}
            {syncing ? ` · ${t("待处理 {n}", { n: progress.pending })}` : ""}
          </p>
          {syncing && sync.current.length > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-[var(--ink)]">
              <Loader2 size={12} className="shrink-0 animate-spin text-[var(--accent)]" />
              <span className="truncate">
                {sync.current.length > 1
                  ? t("正在同步：{title} 等 {n} 篇", { title: sync.current[0], n: sync.current.length })
                  : t("正在同步：{title}", { title: sync.current[0] })}
              </span>
            </p>
          ) : null}
          {syncing && sync.retry ? (
            <p className="mt-1 flex items-center gap-1.5 text-amber-600/90">
              <Loader2 size={12} className="shrink-0 animate-spin" />
              <span className="truncate">
                {t("连接失败，自动重试中（第 {n} 次）：{reason}", {
                  n: sync.retry.attempt,
                  reason: t(sync.retry.reason),
                })}
              </span>
            </p>
          ) : null}
          {sync.recent.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[var(--ink-faint)]">
              {/* Keep only 4 recent items and 5 failures: this sits inside the dialog, and anything longer pushes the bottom buttons out of view */}
              {sync.recent.slice(0, 4).map((it, i) => (
                <li key={i} className="truncate">
                  {it.action === "created"
                    ? t("新增：{title}", { title: it.title })
                    : t("更新：{title}", { title: it.title })}
                </li>
              ))}
            </ul>
          ) : null}
          {progress.failed.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-red-600/90">
              {progress.failed.slice(0, 5).map((f, i) => (
                <li key={i} className="truncate">
                  {t("失败：{title} — {reason}", { title: f.title, reason: t(f.reason) })}
                </li>
              ))}
              {progress.failed.length > 5 ? (
                <li>{t("…另有 {n} 篇失败", { n: progress.failed.length - 5 })}</li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : null}
      {/* Only show the interruption notice once stopped: network blips during sync are retried automatically, so reporting them then would only alarm people */}
      {!syncing && sync.error ? (
        <p className={`text-red-600/90 ${progress ? "mt-1.5" : ""}`}>
          {t("同步已中断：{error}。已同步的内容都已保存，点「继续同步」从断点继续。", {
            error: t(sync.error),
          })}
        </p>
      ) : null}
      {syncing ? (
        <p className="mt-2 border-t border-[var(--hairline)] pt-2 text-[11px] text-[var(--ink-faint)]">
          {t("关闭本窗口不影响同步，网络波动会自动重试，完成后有提示；")}{" "}
          {t("关闭或刷新页面会中断，下次同步自动续传")}
        </p>
      ) : null}
    </section>
  );
}
