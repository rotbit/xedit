"use client";

import { useState } from "react";
import { FolderSync, FolderX, Loader2, RefreshCw, X } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import {
  closeVault,
  getVaultState,
  isVaultSupported,
  openVaultFromPicker,
  resumeVault,
  useVaultSession,
} from "@/lib/localBackend/vaultSession";
import { requestVaultSync, resetVaultSyncSession } from "@/lib/vaultSync/engine";
import {
  isVaultAutoSyncEnabled,
  setVaultAutoSyncEnabled,
  useVaultSyncState,
  type VaultSyncState,
} from "@/lib/vaultSync/state";
import { syncDotCls as dotCls } from "@/features/workspace/constants";
import { askConfirm } from "./PromptDialog";
import { toast } from "./Toast";

/** 主按钮：与 McpDialog 的「去登录」同款 */
const btnPrimary =
  "cursor-pointer self-start rounded-md bg-[var(--accent)] px-4 py-1.5 text-[13px] font-medium text-[var(--accent-fg)] hover:bg-[var(--accent-deep)]";

/** 次要按钮：McpDialog 复制按钮那圈描边，但带文字 */
const btnGhost =
  "flex h-9 shrink-0 cursor-pointer items-center gap-1.5 rounded-md border border-[var(--hairline-strong)] px-3 text-[12.5px] text-[var(--ink-soft)] hover:bg-[var(--paper)] disabled:cursor-default disabled:opacity-45";

/** 状态点旁的小字：先说清「为什么没同步」，再说还差几篇，最后才是时间 */
function noteOf(s: VaultSyncState): string {
  if (s.phase === "off") return "已暂停";
  if (s.phase === "error") return "同步出错";
  if (s.phase === "offline") return "离线";
  if (s.pending > 0) return `${s.pending} 篇待同步`;
  if (s.phase === "idle" && !s.lastSyncAt) return "等待同步";
  return s.lastSyncAt ? `上次同步 ${hhmm(s.lastSyncAt)}` : "已同步";
}

function hhmm(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });
}

/** 选一个磁盘文件夹当同步目标；浏览器里攒的那几篇由引擎自己上云，不必问用户 */
async function pickSyncFolder(): Promise<void> {
  const r = await openVaultFromPicker();
  if (r === "cancelled") return;
  if (r === "unsupported") {
    toast("当前浏览器不支持打开本地文件夹，请用 Chrome / Edge", "error");
    return;
  }
  if (r === "failed") return; // vaultSession 已经弹过失败原因
  toast(`已打开文件夹「${getVaultState().name}」，云端文章会自动同步到这里`, "success");
}

/**
 * 本地同步设置。登录后 Vault 从界面上脱钩（列表/编辑器/回收站/图床全走云端），
 * 它只剩「一个自动同步的文件夹」这个身份，所以整件事收进这一个弹窗：
 * 没开就说清它是什么、给个入口；开着就是状态 + 开关 + 几个数字 + 停用。
 */
export function VaultSyncDialog({ onClose }: { onClose: () => void }) {
  const vault = useVaultSession();
  const sync = useVaultSyncState();
  // 开关只在这里改，读一次即可；引擎听 VAULT_SYNC_SETTING_EVENT 自己改状态点
  const [auto, setAuto] = useState(() => isVaultAutoSyncEnabled());
  useEscape(onClose, true);

  /** 停用后弹窗留着：状态自动切回 none 分支，用户能立刻再选一个 */
  const closeFolder = async () => {
    const ok = await askConfirm({
      title: `停用同步文件夹「${vault.name ?? ""}」`,
      message: "停用后云端文章不再同步到这个文件夹，文件不会删除。",
      confirmText: "停用",
      danger: true,
    });
    if (!ok) return;
    await closeVault();
    resetVaultSyncSession(); // 这个库的映射与索引缓存都作废了
    toast("已停用同步文件夹，磁盘上的文件都还在", "success");
  };

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-black/30 backdrop-blur-[2px]"
      onClick={onClose}
    >
      <div
        className="flex max-h-[92vh] w-[520px] max-w-[94vw] flex-col overflow-hidden rounded-xl border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_20px_60px_rgba(0,0,0,0.2)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex h-12 shrink-0 items-center justify-between border-b border-[var(--hairline)] px-4">
          <span className="flex items-center gap-2 text-[14px] font-medium [font-family:var(--serif)]">
            <FolderSync size={15} className="text-[var(--accent)]" />
            同步文件夹
          </span>
          <button
            className="flex h-7 w-7 cursor-pointer items-center justify-center rounded-md text-[var(--ink-soft)] hover:bg-[var(--paper)]"
            onClick={onClose}
          >
            <X size={16} />
          </button>
        </div>

        {vault.status === "opening" ? (
          <div className="flex h-56 items-center justify-center text-[var(--ink-faint)]">
            <Loader2 size={20} className="animate-spin text-[var(--accent)]" />
          </div>
        ) : (
          <div className="flex flex-col gap-5 overflow-y-auto px-5 py-5">
            {vault.status === "open" ? (
              <OpenBody
                name={vault.name}
                sync={sync}
                auto={auto}
                onAutoChange={(on) => {
                  setAuto(on);
                  setVaultAutoSyncEnabled(on);
                }}
                onCloseFolder={() => void closeFolder()}
              />
            ) : vault.status === "pending" ? (
              // 刷新后权限掉回 prompt：重新授权必须发生在点击里
              <>
                <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
                  需要重新授权访问「{vault.name}」
                </p>
                <button className={btnPrimary} onClick={() => void resumeVault()}>
                  恢复访问
                </button>
              </>
            ) : (
              <NoneBody />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/** 还没选文件夹：先说清这件事是什么，再给入口。不支持的浏览器只说结论 */
function NoneBody() {
  if (!isVaultSupported()) {
    return (
      <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
        当前浏览器不支持打开本地文件夹，请用 Chrome / Edge
      </p>
    );
  }
  return (
    <>
      <p className="text-[13px] leading-6 text-[var(--ink-soft)]">
        选一个电脑上的文件夹，云端文章会自动同步成里面的 Markdown
        文件；在这个文件夹里用 Obsidian 等工具改的内容也会自动推回云端。冲突时云端版本另存为「(云端副本)」，删除只进回收站，不会丢内容。
      </p>
      <button className={btnPrimary} onClick={() => void pickSyncFolder()}>
        选择同步文件夹
      </button>
    </>
  );
}

/** 开着文件夹：状态 / 开关 / 本次会话的几个数字 / 停用 */
function OpenBody({
  name,
  sync,
  auto,
  onAutoChange,
  onCloseFolder,
}: {
  name: string | null;
  sync: VaultSyncState;
  auto: boolean;
  onAutoChange: (on: boolean) => void;
  onCloseFolder: () => void;
}) {
  const hasInfo = sync.conflicts > 0 || sync.mediaFailed > 0 || Boolean(sync.error);

  return (
    <>
      <section className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-[14px] text-[var(--ink)]" title={name ?? ""}>
            {name}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-[12px] text-[var(--ink-faint)]">
            <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls(sync)}`} />
            {noteOf(sync)}
          </p>
        </div>
        <button
          className={btnGhost}
          disabled={!auto}
          title={auto ? "" : "自动同步已关闭"}
          onClick={() => requestVaultSync()}
        >
          <RefreshCw size={13} />
          立即同步
        </button>
      </section>

      <section>
        <label className="flex cursor-pointer items-center justify-between text-[13px] text-[var(--ink)]">
          <span>自动同步到云端</span>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
            checked={auto}
            onChange={(e) => onAutoChange(e.target.checked)}
          />
        </label>
        <p className="mt-1.5 text-[12px] leading-5 text-[var(--ink-faint)]">
          打开文档、保存后、回到窗口时自动同步；关闭后本地与云端各改各的
        </p>
      </section>

      {hasInfo ? (
        <section className="flex flex-col gap-1.5 text-[12px] leading-5 text-[var(--ink-faint)]">
          {sync.conflicts > 0 ? (
            <span>
              本次会话生成 {sync.conflicts} 个「(云端副本)」—— 两端都改过的文章，云端版本另存了一份
            </span>
          ) : null}
          {sync.mediaFailed > 0 ? <span>附件上传失败 {sync.mediaFailed} 个</span> : null}
          {sync.error ? (
            <span className="break-all text-red-600 dark:text-red-400">{sync.error}</span>
          ) : null}
        </section>
      ) : null}

      <section>
        <div className="mb-3 border-t border-[var(--hairline)]" />
        <button
          className="flex cursor-pointer items-center gap-1.5 text-[12.5px] text-red-600 hover:underline dark:text-red-400"
          onClick={onCloseFolder}
        >
          <FolderX size={13} />
          停用同步文件夹
        </button>
      </section>
    </>
  );
}
