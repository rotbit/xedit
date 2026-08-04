"use client";

// 飞书同步状态面板：从 FeishuDialog 搬出，展示扫描中/进度条/最近处理/失败列表/中断提示

import { Loader2 } from "lucide-react";
import type { FeishuSyncState } from "@/hooks/useFeishuSync";

/** 同步进行中或已有进度/错误时展示的状态卡片；无内容可展示时不渲染 */
export function FeishuSyncPanel({ sync }: { sync: FeishuSyncState }) {
  const syncing = sync.syncing;
  const progress = sync.progress;

  if (!(syncing || progress || sync.error)) return null;

  return (
    <section className="rounded-md border border-[var(--hairline)] bg-[var(--paper)] px-4 py-3 text-[12px] leading-5 text-[var(--ink-soft)]">
      {sync.scanning ? (
        <p className="flex items-center gap-2">
          <Loader2 size={13} className="shrink-0 animate-spin text-[var(--accent)]" />
          正在扫描知识库目录、同步第一批文档…
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
            新增 {progress.created} · 更新 {progress.updated} · 跳过 {progress.skipped}
            {syncing ? ` · 待处理 ${progress.pending}` : ""}
          </p>
          {syncing && sync.current.length > 0 ? (
            <p className="mt-1 flex items-center gap-1.5 text-[var(--ink)]">
              <Loader2 size={12} className="shrink-0 animate-spin text-[var(--accent)]" />
              <span className="truncate">
                正在同步：{sync.current[0]}
                {sync.current.length > 1 ? ` 等 ${sync.current.length} 篇` : ""}
              </span>
            </p>
          ) : null}
          {syncing && sync.retry ? (
            <p className="mt-1 flex items-center gap-1.5 text-amber-600/90">
              <Loader2 size={12} className="shrink-0 animate-spin" />
              <span className="truncate">
                连接失败，自动重试中（第 {sync.retry.attempt} 次）：{sync.retry.reason}
              </span>
            </p>
          ) : null}
          {sync.recent.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-[var(--ink-faint)]">
              {sync.recent.slice(0, 4).map((it, i) => (
                <li key={i} className="truncate">
                  {it.action === "created" ? "新增" : "更新"}：{it.title}
                </li>
              ))}
            </ul>
          ) : null}
          {progress.failed.length > 0 ? (
            <ul className="mt-1.5 space-y-0.5 text-red-600/90">
              {progress.failed.slice(0, 5).map((f, i) => (
                <li key={i} className="truncate">
                  失败：{f.title} — {f.reason}
                </li>
              ))}
              {progress.failed.length > 5 ? (
                <li>…另有 {progress.failed.length - 5} 篇失败</li>
              ) : null}
            </ul>
          ) : null}
        </>
      ) : null}
      {!syncing && sync.error ? (
        <p className={`text-red-600/90 ${progress ? "mt-1.5" : ""}`}>
          同步已中断：{sync.error}。已同步的内容都已保存，点「继续同步」从断点继续。
        </p>
      ) : null}
      {syncing ? (
        <p className="mt-2 border-t border-[var(--hairline)] pt-2 text-[11px] text-[var(--ink-faint)]">
          关闭本窗口不影响同步，网络波动会自动重试，完成后有提示；
          关闭或刷新页面会中断，下次同步自动续传
        </p>
      ) : null}
    </section>
  );
}
