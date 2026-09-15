"use client";

import { FolderOpen, Loader2 } from "lucide-react";
import { closeVault, resumeVault, type VaultState } from "@/lib/localBackend/vaultSession";

/**
 * 刷新后浏览器会把文件夹权限降回 prompt，重新授权必须发生在用户手势里——
 * 所以这一屏挡在工作台前面，等用户点一下「恢复访问」，或者干脆改用浏览器存储。
 */
export function VaultGate({ vault }: { vault: VaultState }) {
  const opening = vault.status === "opening";

  return (
    <div className="flex h-full items-center justify-center bg-[var(--paper)] px-6">
      <div className="w-[360px] max-w-full rounded-xl border border-[var(--hairline)] bg-[var(--panel)] px-6 py-6 text-center shadow-sm">
        <span className="mx-auto flex h-11 w-11 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[var(--accent)]">
          {opening ? <Loader2 size={20} className="animate-spin" /> : <FolderOpen size={20} />}
        </span>
        <h2 className="mt-3.5 break-all text-[15px] font-semibold text-[var(--ink)] [font-family:var(--serif)]">
          上次打开的文件夹「{vault.name}」
        </h2>
        <p className="mt-2 text-[13px] leading-6 text-[var(--ink-soft)]">
          {opening ? "正在打开…" : "浏览器需要你再次授权才能读写这个文件夹"}
        </p>
        {vault.error ? (
          <p className="mt-1.5 text-[12px] leading-5 text-red-600 dark:text-red-400">
            {vault.error}
          </p>
        ) : null}
        <button
          className="mt-4 h-9 w-full cursor-pointer rounded-lg bg-[var(--accent)] text-[13px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)] disabled:cursor-default disabled:opacity-60"
          disabled={opening}
          onClick={() => void resumeVault()}
        >
          恢复访问
        </button>
        <button
          className="mt-1.5 h-8 w-full cursor-pointer rounded-lg text-[12.5px] text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
          onClick={() => void closeVault()}
        >
          改用浏览器存储
        </button>
      </div>
    </div>
  );
}
