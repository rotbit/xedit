"use client";

import { useEffect, useState } from "react";
import { ExternalLink, FileText, Film, Image as ImageIcon, Loader2, ShieldCheck, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { formatBytes, formatDate, quotaLabel, usagePercent } from "./format";
import type { UserDetailResp } from "./types";

/** 账号明细抽屉：基本信息 + 文章列表 + 按体积排序的素材清单 */
export function UserDetailDrawer({ id, onClose }: { id: string; onClose: () => void }) {
  const [detail, setDetail] = useState<UserDetailResp | null>(null);
  const [error, setError] = useState("");
  useEscape(onClose, true);

  // 使用方以 key={id} 挂载，换账号即重挂载，无需在 effect 里清状态
  useEffect(() => {
    let cancelled = false;
    void fetch(`/api/admin/users/${id}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "加载失败");
        if (!cancelled) setDetail(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "加载失败");
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  const u = detail?.user;
  const t = detail?.totals;

  return (
    <div className="fixed inset-0 z-[105]" onClick={onClose}>
      <div className="absolute inset-0 bg-black/25 backdrop-blur-[2px]" />
      <div
        className="toast-in absolute right-0 top-0 flex h-full w-[440px] max-w-[94vw] flex-col border-l border-[var(--hairline)] bg-[var(--panel)] shadow-[-16px_0_50px_-20px_rgba(0,0,0,0.3)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-[var(--hairline)] px-5 py-3.5">
          <h3 className="text-[15px] font-semibold [font-family:var(--serif)]">账号明细</h3>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]"
            onClick={onClose}
          >
            <X size={15} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {error ? (
            <p className="py-16 text-center text-[13px] text-red-600 dark:text-red-400">{error}</p>
          ) : !detail || !u || !t ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--ink-faint)]">
              <Loader2 size={15} className="animate-spin" /> 加载中…
            </div>
          ) : (
            <>
              {/* 基本信息 */}
              <div className="flex items-center gap-3">
                {u.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.image}
                    alt=""
                    className="h-11 w-11 rounded-full ring-1 ring-[var(--hairline-strong)]"
                  />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[16px] text-[var(--accent)]">
                    {(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                    {u.name ?? "（未设昵称）"}
                    {u.admin ? <ShieldCheck size={13} className="shrink-0 text-[var(--accent)]" /> : null}
                    {u.bannedAt ? (
                      <span className="shrink-0 rounded-full bg-red-50 px-2 py-0.5 text-[11px] text-red-600 dark:bg-red-950/40 dark:text-red-400">
                        只读封禁
                      </span>
                    ) : null}
                  </p>
                  <p className="truncate text-[12px] text-[var(--ink-faint)]">{u.email ?? "—"}</p>
                </div>
              </div>

              <dl className="mt-4 space-y-1.5 text-[12.5px]">
                <InfoRow label="注册时间" value={formatDate(u.createdAt)} />
                <InfoRow label="登录方式" value={u.logins.length ? u.logins.join(" / ") : "—"} />
                {u.bannedAt ? (
                  <InfoRow
                    label="封禁于"
                    value={`${formatDate(u.bannedAt)}${u.banReason ? `（${u.banReason}）` : ""}`}
                  />
                ) : null}
              </dl>

              {/* 用量 */}
              <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--paper)]/50 px-4 py-3">
                <p className="text-[12.5px] text-[var(--ink-soft)]">
                  已用 <span className="font-medium text-[var(--ink)]">{formatBytes(t.storageUsed)}</span>
                  <span className="text-[var(--ink-faint)]">
                    {" "}
                    / {quotaLabel(u.storageQuota, t.defaultQuota)}
                  </span>
                </p>
                {u.storageQuota !== 0 ? (
                  <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--panel)]">
                    <div
                      className={`h-full rounded-full ${
                        usagePercent(t.storageUsed, u.storageQuota, t.defaultQuota) >= 90
                          ? "bg-red-500"
                          : "bg-[var(--accent)]"
                      }`}
                      style={{ width: `${usagePercent(t.storageUsed, u.storageQuota, t.defaultQuota)}%` }}
                    />
                  </div>
                ) : null}
                <p className="mt-2 text-[12px] text-[var(--ink-faint)]">
                  文章 {t.docCount} · 回收站 {t.trashCount} · 素材 {t.assetCount}
                </p>
              </div>

              {/* 文章 */}
              <Section title={`文章（近 ${detail.docs.length} 篇）`}>
                {detail.docs.length === 0 ? (
                  <Empty text="还没有文章" />
                ) : (
                  detail.docs.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 py-1.5">
                      <FileText size={13} className="shrink-0 text-[var(--ink-faint)]" />
                      <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)]">
                        {d.title}
                        {d.deletedAt ? (
                          <span className="ml-1.5 text-[11px] text-[var(--ink-faint)]">回收站</span>
                        ) : null}
                      </p>
                      <span className="shrink-0 text-[11.5px] text-[var(--ink-faint)]">
                        {formatDate(d.updatedAt)}
                      </span>
                    </div>
                  ))
                )}
              </Section>

              {/* 素材（按体积倒序，便于揪出大文件） */}
              <Section title={`素材（按体积，近 ${detail.assets.length} 个）`}>
                {detail.assets.length === 0 ? (
                  <Empty text="还没有素材" />
                ) : (
                  detail.assets.map((a) => (
                    <a
                      key={a.id}
                      href={a.url}
                      target="_blank"
                      rel="noreferrer"
                      className="group flex items-center gap-2 py-1.5"
                    >
                      {a.mime.startsWith("video/") ? (
                        <Film size={13} className="shrink-0 text-[var(--ink-faint)]" />
                      ) : (
                        <ImageIcon size={13} className="shrink-0 text-[var(--ink-faint)]" />
                      )}
                      <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)] group-hover:text-[var(--accent-deep)]">
                        {a.url.split("/").pop()}
                      </p>
                      <span className="shrink-0 text-[11.5px] text-[var(--ink-faint)]">
                        {formatBytes(a.size)}
                      </span>
                      <ExternalLink
                        size={11}
                        className="shrink-0 text-transparent group-hover:text-[var(--ink-faint)]"
                      />
                    </a>
                  ))
                )}
              </Section>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex gap-3">
      <dt className="w-14 shrink-0 text-[var(--ink-faint)]">{label}</dt>
      <dd className="min-w-0 flex-1 text-[var(--ink-soft)]">{value}</dd>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mt-5">
      <p className="mb-1 text-[12px] font-medium text-[var(--ink-faint)]">{title}</p>
      <div className="divide-y divide-[var(--hairline)]">{children}</div>
    </div>
  );
}

function Empty({ text }: { text: string }) {
  return <p className="py-3 text-[12.5px] text-[var(--ink-faint)]">{text}</p>;
}
