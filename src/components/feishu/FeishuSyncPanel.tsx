"use client";

// 飞书同步状态面板：从 FeishuDialog 搬出，展示扫描中/进度条/最近处理/失败列表/中断提示

/**
 * 飞书同步的状态卡片：扫描中、进度条、当前文档、自动重试、失败列表、中断提示。
 * 只读 useFeishuSync 暴露的状态，自己不发任何请求；同步循环跑在 hook 里，
 * 所以关掉对话框（本组件卸载）不会影响同步进度。
 */
import { Loader2 } from "lucide-react";
import type { FeishuSyncState } from "@/hooks/useFeishuSync";
import { useT } from "@/i18n/useT";

/** 同步进行中或已有进度/错误时展示的状态卡片；无内容可展示时不渲染 */
export function FeishuSyncPanel({ sync }: { sync: FeishuSyncState }) {
  const t = useT();
  const syncing = sync.syncing;
  const progress = sync.progress;

  // 三者都没有说明这个账号从没同步过：整块不渲染，别在对话框里留一张空卡片
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
          {/* 进度 = 已核对的文档（未变动的跳过也算），分母是库里全部文档 */}
          <div className="mb-2 flex items-center gap-2.5">
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--hairline)]">
              <div
                className="h-full rounded-full bg-[var(--accent)] transition-[width] duration-300"
                style={{
                  width: `${
                    // total 为 0（空知识库）时直接按 100% 画满，否则这里会算出 0/0
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
              {/* 最近处理只留 4 条、失败只留 5 条：这块嵌在对话框里，再长会把底部按钮挤出可视区 */}
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
      {/* 中断提示只在停下来之后显示：同步中的网络抖动会自动重试，那时候报错只会吓人 */}
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
