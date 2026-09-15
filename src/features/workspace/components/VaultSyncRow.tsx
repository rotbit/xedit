"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import { FolderSync, FolderX, Loader2, RefreshCw } from "lucide-react";
import { askConfirm } from "@/components/PromptDialog";
import { toast } from "@/components/Toast";
import { useEscape } from "@/hooks/useEscape";
import {
  closeVault,
  getVaultState,
  isVaultSupported,
  openVaultFromPicker,
  resumeVault,
  type VaultState,
} from "@/lib/localBackend/vaultSession";
import { requestVaultSync, resetVaultSyncSession } from "@/lib/vaultSync/engine";
import {
  isVaultAutoSyncEnabled,
  setVaultAutoSyncEnabled,
  useVaultSyncState,
  type VaultSyncState,
} from "@/lib/vaultSync/state";
import { menuDangerCls, menuItemCls, menuPanelCls, vaultBtnCls } from "../constants";

/** 面板最小宽度：信息行比触发行长，太窄会折行 */
const MIN_WIDTH = 236;

/** 面板贴着触发行向上弹，坐标同 AccountMenu */
interface Anchor {
  bottom: number;
  left: number;
  width: number;
}

/**
 * 状态点：同步不提问、不打断，它的全部表达就是这一个点。
 * 空心灰=已暂停，红=出错，灰=离线/还没开跑，黄=在跑或还有没上云的，绿=已同步。
 */
function dotCls(s: VaultSyncState): string {
  if (s.phase === "off") return "border border-[var(--ink-faint)]";
  if (s.phase === "error") return "bg-red-500";
  if (s.phase === "offline") return "bg-[var(--ink-faint)]";
  if (s.phase === "syncing" || s.pending > 0) return "bg-amber-400";
  if (s.phase === "synced") return "bg-emerald-500";
  return "bg-[var(--ink-faint)]"; // idle：引擎刚挂上，还等第一次对账
}

/** 右侧那行小字：先说清「为什么没同步」，再说还差几篇，最后才是时间 */
function noteOf(s: VaultSyncState): string {
  if (s.phase === "off") return "已暂停";
  if (s.phase === "error") return "同步出错";
  if (s.phase === "offline") return "离线";
  if (s.pending > 0) return `${s.pending} 篇待同步`;
  if (s.phase === "idle" && !s.lastSyncAt) return "等待同步";
  return s.lastSyncAt ? hhmm(s.lastSyncAt) : "已同步";
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
 * 登录态的同步文件夹入口。登录后 Vault 从界面上脱钩（列表/编辑器/回收站/图床全走云端），
 * 它只剩「一个自动同步的文件夹」这个身份，所以整个交互就压在这一行上：
 * 没开就给个入口，开着就一个状态点 + 库名，点开才是细节与开关。
 */
export function VaultSyncRow({ vault }: { vault: VaultState }) {
  const sync = useVaultSyncState();
  const [anchor, setAnchor] = useState<Anchor | null>(null);

  if (vault.status === "opening") {
    return (
      <div className="flex min-w-0 items-center gap-1.5 px-1.5 py-1.5 text-[12px] text-[var(--ink-faint)]">
        <Loader2 size={13} className="shrink-0 animate-spin" />
        <span className="min-w-0 truncate">正在打开…</span>
      </div>
    );
  }

  // 刷新后权限掉回 prompt：重新授权必须发生在点击里
  if (vault.status === "pending") {
    return (
      <div className="px-0.5 py-1">
        <button className={vaultBtnCls} onClick={() => void resumeVault()}>
          <FolderSync size={13} className="shrink-0" />
          <span className="min-w-0 truncate">恢复访问「{vault.name}」</span>
        </button>
      </div>
    );
  }

  if (vault.status === "none") {
    // 不支持的浏览器就别提这件事：它根本没得选
    if (!isVaultSupported()) return null;
    return (
      <div className="px-0.5 py-1">
        <button className={vaultBtnCls} onClick={() => void pickSyncFolder()}>
          <FolderSync size={13} className="shrink-0" />
          <span className="min-w-0 truncate">同步到本地文件夹</span>
        </button>
      </div>
    );
  }

  const toggle = (e: React.MouseEvent<HTMLElement>) => {
    if (anchor) {
      setAnchor(null);
      return;
    }
    const r = e.currentTarget.getBoundingClientRect();
    setAnchor({ bottom: window.innerHeight - r.top + 6, left: r.left, width: r.width });
  };

  return (
    <>
      <button
        className="flex w-full cursor-pointer items-center gap-2 rounded-md py-1.5 pl-2 pr-2 text-left text-[13px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
        title={`同步文件夹「${vault.name}」`}
        onClick={toggle}
      >
        <span className={`h-2 w-2 shrink-0 rounded-full ${dotCls(sync)}`} />
        <span className="min-w-0 flex-1 truncate">{vault.name}</span>
        <span className="shrink-0 text-[11px] text-[var(--ink-faint)]">{noteOf(sync)}</span>
      </button>
      {anchor ? (
        <VaultSyncPanel
          anchor={anchor}
          name={vault.name}
          sync={sync}
          onClose={() => setAnchor(null)}
        />
      ) : null}
    </>
  );
}

/** 细节面板：一个开关、一个手动触发、几个数字，再加关闭文件夹 */
function VaultSyncPanel({
  anchor,
  name,
  sync,
  onClose,
}: {
  anchor: Anchor;
  name: string | null;
  sync: VaultSyncState;
  onClose: () => void;
}) {
  useEscape(onClose);
  // 开关只在这里改，读一次即可；引擎听 VAULT_SYNC_SETTING_EVENT 自己改状态点
  const [auto, setAuto] = useState(() => isVaultAutoSyncEnabled());

  const closeFolder = async () => {
    onClose();
    const ok = await askConfirm({
      title: `关闭文件夹「${name ?? ""}」`,
      message: "关闭后云端文章不再同步到这个文件夹，文件不会删除。",
      confirmText: "关闭",
      danger: true,
    });
    if (!ok) return;
    await closeVault();
    resetVaultSyncSession(); // 这个库的映射与索引缓存都作废了
    toast("已关闭同步文件夹，磁盘上的文件都还在", "success");
  };

  return createPortal(
    <>
      <div className="fixed inset-0 z-30" onClick={onClose} onWheel={onClose} />
      <div
        className={menuPanelCls}
        style={{
          bottom: anchor.bottom,
          left: anchor.left,
          width: Math.max(anchor.width, MIN_WIDTH),
        }}
      >
        <p className="truncate px-3.5 pb-1 pt-0.5 text-[11px] text-[var(--ink-faint)]">
          同步文件夹 · {name}
        </p>
        <label className={`${menuItemCls} justify-between`}>
          <span>自动同步到云端</span>
          <input
            type="checkbox"
            className="h-3.5 w-3.5 cursor-pointer accent-[var(--accent)]"
            checked={auto}
            onChange={(e) => {
              setAuto(e.target.checked);
              setVaultAutoSyncEnabled(e.target.checked);
            }}
          />
        </label>
        <button
          className={`${menuItemCls} disabled:cursor-default disabled:opacity-45`}
          disabled={!auto}
          title={auto ? "" : "自动同步已关闭"}
          onClick={() => {
            requestVaultSync();
            onClose();
          }}
        >
          <RefreshCw size={13} className="text-[var(--ink-faint)]" />
          立即同步
        </button>
        <div className="my-1 border-t border-[var(--hairline)]" />
        <div className="flex flex-col gap-1 px-3.5 py-1 text-[11.5px] leading-relaxed text-[var(--ink-faint)]">
          <span>待同步 {sync.pending} 篇</span>
          {sync.conflicts > 0 ? (
            <span>
              本次会话生成 {sync.conflicts} 个「(云端副本)」
              <br />
              两端都改过的文章，云端版本另存了一份
            </span>
          ) : null}
          {sync.mediaFailed > 0 ? <span>附件上传失败 {sync.mediaFailed} 个</span> : null}
          <span>{sync.lastSyncAt ? `上次同步 ${hhmm(sync.lastSyncAt)}` : "还没同步过"}</span>
          {sync.error ? (
            <span className="break-all text-red-600 dark:text-red-400">{sync.error}</span>
          ) : null}
        </div>
        <div className="my-1 border-t border-[var(--hairline)]" />
        <button className={menuDangerCls} onClick={() => void closeFolder()}>
          <FolderX size={13} />
          关闭文件夹
        </button>
      </div>
    </>,
    document.body
  );
}
