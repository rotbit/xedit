"use client";

/**
 * Admin account detail drawer: fetches /api/admin/users/[id] once on open, showing account info, feature permissions, recent articles and assets.
 * Feature permissions (toggles and daily caps) are edited and saved in place; on success onChanged makes the list refetch;
 * actions like banning or changing quota still happen in AdminDashboard's dialogs.
 * The API returns truncated lists of articles and assets, so the subheadings say "latest N" rather than a total.
 */
import { useEffect, useState } from "react";
import { ExternalLink, FileText, Film, Image as ImageIcon, Loader2, ShieldCheck, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { formatBytes, formatDate, quotaLabel, usagePercent } from "./format";
import type { UserDetailResp } from "./types";
import { UserPermissionsCard } from "./UserPermissionsCard";

/** Account detail drawer: basic info + feature permissions + article list + assets sorted by size */
export function UserDetailDrawer({
  id,
  onClose,
  onChanged,
}: {
  id: string;
  onClose: () => void;
  /** Called after permissions or caps save successfully; usually the list's refresh function */
  onChanged?: () => void;
}) {
  const [detail, setDetail] = useState<UserDetailResp | null>(null);
  const [error, setError] = useState("");
  useEscape(onClose, true);

  // Callers mount with key={id}, so switching accounts remounts and no state clearing in an effect is needed
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
    // z-[105] sits between page content and admin confirm dialogs (dialogs.tsx uses z-[110]): a ban confirmation opened from the drawer must stack above it
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
            <X size={16} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* u and t are fields of detail; TS can't infer they're non-null from detail being non-null, so check them together so they can be used directly below */}
          {error ? (
            <p className="py-16 text-center text-[13px] text-red-600 dark:text-red-400">{error}</p>
          ) : !detail || !u || !t ? (
            <div className="flex items-center justify-center gap-2 py-16 text-[13px] text-[var(--ink-faint)]">
              <Loader2 size={16} className="animate-spin" /> 加载中…
            </div>
          ) : (
            <>
              {/* Basic info */}
              <div className="flex items-center gap-3">
                {u.image ? (
                  // Avatar URLs come from third-party sign-in on unpredictable domains that can't go in next/image's remote allowlist, so a native img it is
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={u.image}
                    alt=""
                    className="h-11 w-11 rounded-full ring-1 ring-[var(--hairline-strong)]"
                  />
                ) : (
                  <span className="flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[16px] text-[var(--accent)]">
                    {/* Without an avatar fall back to the nickname's or email's first letter; if both are empty show a question mark rather than an empty circle */}
                    {(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                  </span>
                )}
                <div className="min-w-0">
                  <p className="flex items-center gap-1.5 truncate text-[14px] font-medium">
                    {u.name ?? "（未设昵称）"}
                    {u.admin ? <ShieldCheck size={14} className="shrink-0 text-[var(--accent)]" /> : null}
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
                <InfoRow label="最近登录" value={u.lastLoginAt ? formatDate(u.lastLoginAt) : "—"} />
                <InfoRow label="最近活跃" value={u.lastActiveDate ?? "—"} />
                <InfoRow label="登录方式" value={u.logins.length ? u.logins.join(" / ") : "—"} />
                {u.bannedAt ? (
                  <InfoRow
                    label="封禁于"
                    value={`${formatDate(u.bannedAt)}${u.banReason ? `（${u.banReason}）` : ""}`}
                  />
                ) : null}
              </dl>

              {/* Usage */}
              <div className="mt-4 rounded-xl border border-[var(--hairline)] bg-[var(--paper)]/50 px-4 py-3">
                <p className="text-[12.5px] text-[var(--ink-soft)]">
                  已用 <span className="font-medium text-[var(--ink)]">{formatBytes(t.storageUsed)}</span>
                  <span className="text-[var(--ink-faint)]">
                    {" "}
                    / {quotaLabel(u.storageQuota, t.defaultQuota)}
                  </span>
                </p>
                {/* Quota 0 means unlimited by convention: no denominator, no percentage, so no progress bar (see quotaLabel in format.ts) */}
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

              <UserPermissionsCard user={u} totals={t} onChanged={onChanged} />

              {/* Articles */}
              <Section title={`文章（近 ${detail.docs.length} 篇）`}>
                {detail.docs.length === 0 ? (
                  <Empty text="还没有文章" />
                ) : (
                  detail.docs.map((d) => (
                    <div key={d.id} className="flex items-center gap-2 py-1.5">
                      <FileText size={14} className="shrink-0 text-[var(--ink-faint)]" />
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

              {/* Assets (largest first, to spot big files) */}
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
                        <Film size={14} className="shrink-0 text-[var(--ink-faint)]" />
                      ) : (
                        <ImageIcon size={14} className="shrink-0 text-[var(--ink-faint)]" />
                      )}
                      <p className="min-w-0 flex-1 truncate text-[12.5px] text-[var(--ink)] group-hover:text-[var(--accent-deep)]">
                        {/* The assets table only stores the url, not the original filename, so the last path segment is shown as the name */}
                        {a.url.split("/").pop()}
                      </p>
                      <span className="shrink-0 text-[11.5px] text-[var(--ink-faint)]">
                        {formatBytes(a.size)}
                      </span>
                      <ExternalLink
                        size={12}
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
