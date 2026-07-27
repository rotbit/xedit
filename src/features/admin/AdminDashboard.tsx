"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Ban,
  ChevronLeft,
  ChevronRight,
  FileText,
  Gauge,
  HardDrive,
  Loader2,
  MoreHorizontal,
  Search,
  ShieldCheck,
  Trash2,
  UserRound,
  Users,
} from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { Toaster, toast } from "@/components/Toast";
import { askConfirm } from "@/components/PromptDialog";
import { menuDangerCls } from "@/features/workspace/constants";
import { formatBytes, formatDate, quotaLabel, usagePercent } from "./format";
import type { AdminUser, Overview, UserListResp } from "./types";
import { BanDialog, QuotaDialog } from "./dialogs";
import { DauChart } from "./DauChart";
import { UserDetailDrawer } from "./UserDetailDrawer";

/** 超级管理员后台：全站概览 + 账号列表（封禁 / 配额 / 删号 / 明细） */
export function AdminDashboard() {
  const [overview, setOverview] = useState<Overview | null>(null);
  const [list, setList] = useState<UserListResp | null>(null);
  const [q, setQ] = useState("");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [banTarget, setBanTarget] = useState<AdminUser | null>(null);
  const [quotaTarget, setQuotaTarget] = useState<AdminUser | null>(null);
  const [detailId, setDetailId] = useState<string | null>(null);

  // 操作成功后 +1，触发概览与列表重新拉取
  const [tick, setTick] = useState(0);
  const refreshAll = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    void fetch("/api/admin/overview")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && data) setOverview(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [tick]);

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ page: String(page) });
    if (query) params.set("q", query);
    void fetch(`/api/admin/users?${params}`)
      .then(async (r) => {
        const data = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(data.error ?? "加载失败");
        if (!cancelled) setList(data);
      })
      .catch((e) => {
        if (!cancelled) toast(e instanceof Error ? e.message : "加载失败", "error");
      });
    return () => {
      cancelled = true;
    };
  }, [page, query, tick]);

  /** PATCH 单个账号；成功后刷新列表与概览 */
  const patchUser = async (id: string, body: Record<string, unknown>): Promise<boolean> => {
    const res = await fetch(`/api/admin/users/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? "操作失败", "error");
      return false;
    }
    refreshAll();
    return true;
  };

  const unban = async (u: AdminUser) => {
    const ok = await askConfirm({
      title: "解除封禁",
      message: `恢复 ${u.email ?? u.name ?? u.id} 的写入权限？`,
      confirmText: "解封",
    });
    if (!ok) return;
    if (await patchUser(u.id, { banned: false })) toast("已解封", "success");
  };

  const removeUser = async (u: AdminUser) => {
    const ok = await askConfirm({
      title: "删除账号",
      message:
        `将永久删除 ${u.email ?? u.name ?? u.id} 及其全部数据：\n` +
        `${u.docCount} 篇文章（含回收站与历史版本）、${u.assetCount} 个素材文件（OSS 一并清理）、` +
        `全部设置与授权记录。此操作不可恢复。`,
      confirmText: "永久删除",
      danger: true,
    });
    if (!ok) return;
    const res = await fetch(`/api/admin/users/${u.id}`, { method: "DELETE" });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      toast(data.error ?? "删除失败", "error");
      return;
    }
    toast("账号已删除", "success");
    refreshAll();
  };

  const totalPages = list ? Math.max(1, Math.ceil(list.total / list.pageSize)) : 1;

  return (
    <div className="mx-auto max-w-6xl px-5 py-8 md:px-8">
      {/* 顶栏 */}
      <div className="mb-8 flex items-center gap-3">
        <Link
          href="/"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--ink-soft)] transition-colors hover:bg-[var(--panel)] hover:text-[var(--ink)]"
          title="返回工作台"
        >
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="text-[19px] font-semibold [font-family:var(--serif)]">管理后台</h1>
          <p className="mt-0.5 text-[12px] text-[var(--ink-faint)]">
            账号管理 · 只读封禁 · 存储配额
          </p>
        </div>
      </div>

      {/* 全站概览 */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard
          icon={<Users size={15} />}
          label="用户"
          value={overview ? String(overview.users.total) : "—"}
          hint={overview ? `本周新增 ${overview.users.newThisWeek}` : ""}
        />
        <StatCard
          icon={<Ban size={15} />}
          label="封禁中"
          value={overview ? String(overview.users.banned) : "—"}
          hint={overview && overview.users.banned > 0 ? "只读，不能写入上传" : ""}
        />
        <StatCard
          icon={<FileText size={15} />}
          label="文章"
          value={overview ? String(overview.docs.total) : "—"}
          hint="不含回收站"
        />
        <StatCard
          icon={<HardDrive size={15} />}
          label="素材存储"
          value={overview ? formatBytes(overview.assets.bytes) : "—"}
          hint={overview ? `${overview.assets.count} 个文件` : ""}
        />
      </div>

      {/* 活跃用户曲线 */}
      <DauChart />

      {/* 搜索 */}
      <div className="mt-8 flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search
            size={14}
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[var(--ink-faint)]"
          />
          <input
            className="h-9 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] pl-9 pr-3 text-[13px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]"
            placeholder="按邮箱或昵称搜索…"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                setPage(1);
                setQuery(q.trim());
              }
            }}
          />
        </div>
        <span className="flex-1" />
        <p className="text-[12px] text-[var(--ink-faint)]">
          {list ? `共 ${list.total} 个账号` : ""}
        </p>
      </div>

      {/* 账号列表 */}
      <div className="mt-3 overflow-x-auto rounded-xl border border-[var(--hairline)] bg-[var(--panel)]">
        <table className="w-full min-w-[820px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-[var(--hairline)] text-left text-[12px] text-[var(--ink-faint)]">
              <th className="px-4 py-2.5 font-normal">用户</th>
              <th className="px-3 py-2.5 font-normal">注册时间</th>
              <th className="px-3 py-2.5 text-right font-normal">文章</th>
              <th className="px-3 py-2.5 text-right font-normal">素材</th>
              <th className="px-3 py-2.5 font-normal">存储用量</th>
              <th className="px-3 py-2.5 font-normal">状态</th>
              <th className="w-12 px-3 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {list?.users.map((u) => (
              <tr
                key={u.id}
                className="cursor-pointer border-b border-[var(--hairline)] last:border-b-0 hover:bg-[var(--paper)]/60"
                onClick={() => setDetailId(u.id)}
              >
                <td className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    {u.image ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={u.image}
                        alt=""
                        className="h-7 w-7 shrink-0 rounded-full ring-1 ring-[var(--hairline-strong)]"
                      />
                    ) : (
                      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[12px] text-[var(--accent)]">
                        {(u.name ?? u.email ?? "?").slice(0, 1).toUpperCase()}
                      </span>
                    )}
                    <div className="min-w-0">
                      <p className="flex items-center gap-1.5 truncate font-medium text-[var(--ink)]">
                        {u.name ?? "（未设昵称）"}
                        {u.admin ? (
                          <span title="ADMIN_EMAILS 白名单管理员">
                            <ShieldCheck size={13} className="shrink-0 text-[var(--accent)]" />
                          </span>
                        ) : null}
                      </p>
                      <p className="truncate text-[12px] text-[var(--ink-faint)]">{u.email ?? "—"}</p>
                    </div>
                  </div>
                </td>
                <td className="whitespace-nowrap px-3 py-2.5 text-[var(--ink-soft)]">
                  {formatDate(u.createdAt)}
                </td>
                <td className="px-3 py-2.5 text-right text-[var(--ink-soft)]">{u.docCount}</td>
                <td className="px-3 py-2.5 text-right text-[var(--ink-soft)]">{u.assetCount}</td>
                <td className="px-3 py-2.5">
                  <StorageCell u={u} defaultQuota={list.defaultQuota} />
                </td>
                <td className="px-3 py-2.5">
                  {u.bannedAt ? (
                    <span
                      className="inline-flex rounded-full bg-red-50 px-2 py-0.5 text-[11.5px] text-red-600 dark:bg-red-950/40 dark:text-red-400"
                      title={u.banReason ?? undefined}
                    >
                      只读封禁
                    </span>
                  ) : (
                    <span className="inline-flex rounded-full bg-[var(--paper)] px-2 py-0.5 text-[11.5px] text-[var(--ink-faint)]">
                      正常
                    </span>
                  )}
                </td>
                <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                  <Dropdown
                    width={168}
                    trigger={
                      <button className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)]">
                        <MoreHorizontal size={15} />
                      </button>
                    }
                  >
                    <button className={menuItemCls} onClick={() => setDetailId(u.id)}>
                      <UserRound size={13} />
                      查看明细
                    </button>
                    <button className={menuItemCls} onClick={() => setQuotaTarget(u)}>
                      <Gauge size={13} />
                      调整配额…
                    </button>
                    {u.bannedAt ? (
                      <button className={menuItemCls} onClick={() => void unban(u)}>
                        <Ban size={13} />
                        解除封禁
                      </button>
                    ) : u.admin ? null : (
                      <button className={menuDangerCls} onClick={() => setBanTarget(u)}>
                        <Ban size={13} />
                        只读封禁…
                      </button>
                    )}
                    {u.admin ? null : (
                      <>
                        <div className="my-1 border-t border-[var(--hairline)]" />
                        <button className={menuDangerCls} onClick={() => void removeUser(u)}>
                          <Trash2 size={13} />
                          删除账号…
                        </button>
                      </>
                    )}
                  </Dropdown>
                </td>
              </tr>
            ))}
            {list === null ? (
              <tr>
                <td colSpan={7} className="px-4 py-14">
                  <span className="flex items-center justify-center gap-2 text-[var(--ink-faint)]">
                    <Loader2 size={15} className="animate-spin" /> 加载中…
                  </span>
                </td>
              </tr>
            ) : list.users.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-14 text-center text-[var(--ink-faint)]">
                  没有匹配的账号
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {/* 分页 */}
      {totalPages > 1 ? (
        <div className="mt-4 flex items-center justify-center gap-3 text-[13px] text-[var(--ink-soft)]">
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] disabled:cursor-default disabled:opacity-40"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            <ChevronLeft size={15} />
          </button>
          <span>
            第 {page} / {totalPages} 页
          </span>
          <button
            className="flex h-8 w-8 cursor-pointer items-center justify-center rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] disabled:cursor-default disabled:opacity-40"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            <ChevronRight size={15} />
          </button>
        </div>
      ) : null}

      {banTarget ? (
        <BanDialog
          user={banTarget}
          onClose={() => setBanTarget(null)}
          onSubmit={async (reason) => {
            const ok = await patchUser(banTarget.id, { banned: true, banReason: reason });
            if (ok) {
              toast("已封禁为只读", "success");
              setBanTarget(null);
            }
          }}
        />
      ) : null}
      {quotaTarget && list ? (
        <QuotaDialog
          user={quotaTarget}
          defaultQuota={list.defaultQuota}
          onClose={() => setQuotaTarget(null)}
          onSubmit={async (quota) => {
            const ok = await patchUser(quotaTarget.id, { storageQuota: quota });
            if (ok) {
              toast("配额已更新", "success");
              setQuotaTarget(null);
            }
          }}
        />
      ) : null}
      {detailId ? (
        // key 让切换账号时整体重挂载，抽屉内部不用手动清状态
        <UserDetailDrawer key={detailId} id={detailId} onClose={() => setDetailId(null)} />
      ) : null}
      <Toaster />
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--hairline)] bg-[var(--panel)] px-4 py-3.5">
      <p className="flex items-center gap-1.5 text-[12px] text-[var(--ink-faint)]">
        {icon}
        {label}
      </p>
      <p className="mt-1.5 text-[22px] font-semibold leading-none text-[var(--ink)] [font-family:var(--serif)]">
        {value}
      </p>
      <p className="mt-1.5 h-4 text-[11.5px] text-[var(--ink-faint)]">{hint}</p>
    </div>
  );
}

/** 用量条：已用 / 生效配额，逼近上限时染红 */
function StorageCell({ u, defaultQuota }: { u: AdminUser; defaultQuota: number }) {
  const percent = usagePercent(u.storageUsed, u.storageQuota, defaultQuota);
  const nearLimit = percent >= 90;
  return (
    <div className="min-w-[140px]">
      <p className="whitespace-nowrap text-[12px] text-[var(--ink-soft)]">
        {formatBytes(u.storageUsed)}
        <span className="text-[var(--ink-faint)]"> / {quotaLabel(u.storageQuota, defaultQuota)}</span>
      </p>
      {u.storageQuota !== 0 ? (
        <div className="mt-1 h-1 w-full overflow-hidden rounded-full bg-[var(--paper)]">
          <div
            className={`h-full rounded-full ${nearLimit ? "bg-red-500" : "bg-[var(--accent)]"}`}
            style={{ width: `${percent}%` }}
          />
        </div>
      ) : null}
    </div>
  );
}
