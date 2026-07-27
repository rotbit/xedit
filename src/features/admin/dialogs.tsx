"use client";

import { useState } from "react";
import { useEscape } from "@/hooks/useEscape";
import { formatBytes, quotaLabel } from "./format";
import type { AdminUser } from "./types";

/** 后台弹窗的公共外壳（视觉与 PromptDialog 一致） */
function Modal({
  title,
  children,
  onClose,
}: {
  title: string;
  children: React.ReactNode;
  onClose: () => void;
}) {
  useEscape(onClose, true);
  return (
    <div
      className="fixed inset-0 z-[110] flex items-center justify-center bg-black/25 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="toast-in w-[440px] max-w-[92vw] overflow-hidden rounded-2xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_24px_70px_-16px_rgba(40,25,5,0.4)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pb-2 pt-5">
          <h3 className="text-[15px] font-semibold [font-family:var(--serif)]">{title}</h3>
        </div>
        {children}
      </div>
    </div>
  );
}

const footerCls =
  "flex items-center justify-end gap-2 border-t border-[var(--hairline)] bg-[var(--paper)]/50 px-5 py-3";
const cancelBtnCls =
  "h-9 cursor-pointer rounded-lg px-4 text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]";
const inputCls =
  "h-10 w-full rounded-lg border border-[var(--hairline-strong)] bg-[var(--panel)] px-3 text-[14px] text-[var(--ink)] outline-none transition-colors placeholder:text-[var(--ink-faint)] focus:border-[var(--accent)]";

/** 只读封禁：可附一句原因，会随 403 提示展示给被封用户 */
export function BanDialog({
  user,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      await onSubmit(reason.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="只读封禁" onClose={onClose}>
      <div className="px-6 pb-5">
        <p className="mb-3 text-[13px] leading-6 text-[var(--ink-soft)]">
          {user.email ?? user.name ?? user.id} 将只能登录查看与导出，
          不能新建、修改、上传；随时可解封，数据不受影响。
        </p>
        <input
          className={inputCls}
          value={reason}
          maxLength={200}
          placeholder="封禁原因（可留空，会展示给该用户）"
          onChange={(e) => setReason(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
        />
      </div>
      <div className={footerCls}>
        <button className={cancelBtnCls} onClick={onClose}>
          取消
        </button>
        <button
          className="h-9 cursor-pointer rounded-lg bg-red-600 px-5 text-[13px] font-medium text-white shadow-[0_1px_4px_rgba(0,0,0,0.15)] transition-colors hover:bg-red-700 disabled:opacity-50"
          onClick={() => void submit()}
          disabled={busy}
        >
          封禁
        </button>
      </div>
    </Modal>
  );
}

/** 调整存储配额：自定义 MB 数，或恢复默认 / 设为不限制 */
export function QuotaDialog({
  user,
  defaultQuota,
  onClose,
  onSubmit,
}: {
  user: AdminUser;
  defaultQuota: number;
  onClose: () => void;
  /** quota 为字节；null=恢复默认，0=不限制 */
  onSubmit: (quota: number | null) => Promise<void>;
}) {
  const currentMb =
    user.storageQuota != null && user.storageQuota > 0
      ? Math.round(user.storageQuota / 1024 / 1024)
      : Math.round(defaultQuota / 1024 / 1024);
  const [mb, setMb] = useState(String(currentMb));
  const [busy, setBusy] = useState(false);

  const run = async (quota: number | null) => {
    setBusy(true);
    try {
      await onSubmit(quota);
    } finally {
      setBusy(false);
    }
  };

  const submitCustom = () => {
    const n = Number(mb);
    if (!Number.isFinite(n) || n < 0) return;
    void run(Math.round(n) * 1024 * 1024);
  };

  return (
    <Modal title="调整存储配额" onClose={onClose}>
      <div className="px-6 pb-5">
        <p className="mb-3 text-[13px] leading-6 text-[var(--ink-soft)]">
          {user.email ?? user.name ?? user.id} 已用 {formatBytes(user.storageUsed)}，
          当前配额 {quotaLabel(user.storageQuota, defaultQuota)}。超出后禁止新上传，已有文件不受影响。
        </p>
        <div className="flex items-center gap-2">
          <input
            className={inputCls}
            value={mb}
            inputMode="numeric"
            placeholder="配额（MB）"
            onChange={(e) => setMb(e.target.value.replace(/[^\d]/g, ""))}
            onKeyDown={(e) => {
              if (e.key === "Enter") submitCustom();
            }}
          />
          <span className="shrink-0 text-[13px] text-[var(--ink-faint)]">MB</span>
        </div>
      </div>
      <div className={footerCls}>
        <button
          className={cancelBtnCls}
          onClick={() => void run(null)}
          disabled={busy}
          title={`跟随全局默认（${formatBytes(defaultQuota)}）`}
        >
          恢复默认
        </button>
        <button className={cancelBtnCls} onClick={() => void run(0)} disabled={busy}>
          不限制
        </button>
        <span className="flex-1" />
        <button className={cancelBtnCls} onClick={onClose}>
          取消
        </button>
        <button
          className="h-9 cursor-pointer rounded-lg bg-[var(--accent)] px-5 text-[13px] font-medium text-[var(--accent-fg)] shadow-[0_1px_4px_rgba(0,0,0,0.18)] transition-colors hover:bg-[var(--accent-deep)] disabled:opacity-50"
          onClick={submitCustom}
          disabled={busy || !mb}
        >
          保存
        </button>
      </div>
    </Modal>
  );
}
