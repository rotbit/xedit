"use client";

/**
 * The bottom row of the workspace sidebar. Three mutually exclusive forms: logged in shows image library/trash/account menu,
 * offline still shows the account (the menu just can't open, since everything there needs the network),
 * logged out (local mode) shows a login prompt and 「打开文件夹作为文库」 (Open folder as library).
 * All state comes from the ws aggregated by useWorkspace; this file sends no requests and stores no state of its own.
 */
import { useState } from "react";
import { ChevronsUpDown, FolderOpen, Images, Loader2, LogIn, Trash2 } from "lucide-react";
import { openAuth } from "@/components/AuthDialog";
import { DarkToggle } from "@/components/DarkToggle";
import { LangToggle } from "@/components/LangToggle";
import { askConfirm } from "@/components/PromptDialog";
import { toast } from "@/components/Toast";
import { useT } from "@/i18n/useT";
import { listLocalCats, notifyDocsChanged } from "@/lib/localDocs";
import {
  closeVault,
  countBrowserDocs,
  getVaultState,
  isVaultSupported,
  migrateBrowserDocsToVault,
  openVaultFromPicker,
  resumeVault,
  type VaultState,
} from "@/lib/localBackend/vaultSession";
import { ASSETS, SETTINGS, TRASH } from "../constants";
import { AccountMenu } from "./AccountMenu";
import { NavRow } from "./NavRow";
import type { AuthUser } from "../hooks/useAuthMode";
import type { Workspace } from "../hooks/useWorkspace";

/** Account avatar. Third-party avatars always fail to load offline, so fall back to the initial instead of leaving a broken image box */
function Avatar({ user }: { user: AuthUser | undefined }) {
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null);
  const src = user?.image;
  if (src && brokenSrc !== src) {
    return (
      // Avatar URLs come from third-party login with no fixed domain, so they can't be added to next/image's remote allowlist
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt="avatar"
        onError={() => setBrokenSrc(src)}
        className="h-6 w-6 shrink-0 rounded-full ring-1 ring-[var(--hairline-strong)]"
      />
    );
  }
  return (
    <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-active)] text-[11px] text-[var(--ink)]">
      {(user?.name ?? user?.email ?? "U").slice(0, 1)}
    </span>
  );
}

/** Secondary buttons in this bottom row: same as the other ghost buttons in the workspace, clear enough on the dark sidebar */
const vaultBtnCls =
  "flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--hairline)] px-2 text-[12.5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";

/** Image library / trash entry: just a NavRow, selected state based on the current view */
function ViewRow({
  ws,
  viewKey,
  label,
  count,
  icon,
}: {
  ws: Workspace;
  viewKey: string;
  label: string;
  count: number | null;
  icon: React.ReactNode;
}) {
  return (
    <NavRow
      icon={icon}
      label={label}
      active={ws.nav.activeCat === viewKey && !ws.nav.readingId}
      count={count}
      onClick={() => ws.nav.openCategory(viewKey)}
    />
  );
}

/** Library source in local mode: shows the library name if a disk folder is open, otherwise an entry to open one */
function VaultRow({ vault, onOpen }: { vault: VaultState; onOpen: () => void }) {
  const t = useT();
  if (vault.status === "open") {
    return (
      <div className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--ink-faint)]">
        <FolderOpen size={14} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={vault.name ?? ""}>
          {vault.name}
        </span>
        <button
          className="shrink-0 cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
          title={t("关闭文件夹，回到浏览器存储")}
          onClick={() => {
            void closeVault().then(() => toast(t("已关闭文件夹，回到浏览器存储"), "info"));
          }}
        >
          {t("关闭")}
        </button>
      </div>
    );
  }

  if (vault.status === "opening") {
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--ink-faint)]">
        <Loader2 size={14} className="shrink-0 animate-spin" />
        <span className="min-w-0 truncate">{t("正在打开…")}</span>
      </div>
    );
  }

  // After a refresh the permission falls back to prompt: re-granting must happen inside a click
  if (vault.status === "pending") {
    return (
      <button className={vaultBtnCls} onClick={() => void resumeVault()}>
        <FolderOpen size={14} className="shrink-0" />
        <span className="min-w-0 truncate">{t("恢复访问「{name}」", { name: vault.name ?? "" })}</span>
      </button>
    );
  }

  // Safari and Firefox lack File System Access, so no entry can be offered; just say data is stored locally so nobody clicks something that does nothing
  if (!isVaultSupported()) {
    return (
      <span
        className="block truncate text-[11px] text-[var(--ink-faint)]"
        title={t("打开文件夹需要 Chrome / Edge 等 Chromium 浏览器")}
      >
        {t("本地模式 · 数据保存在本设备")}
      </span>
    );
  }

  return (
    <button className={vaultBtnCls} onClick={onOpen}>
      <FolderOpen size={14} className="shrink-0" />
      <span className="min-w-0 truncate">{t("打开文件夹作为文库")}</span>
    </button>
  );
}

/** Sidebar bottom: logged in shows tool entries + account, offline shows a notice, local mode shows a login prompt */
export function SidebarFooter({ ws }: { ws: Workspace }) {
  const { auth, menus, library, vault } = ws;
  const t = useT();

  /** Pick a disk folder as the library; if the browser still holds documents, ask whether to move them in too */
  const openVaultAsLibrary = async () => {
    // Picking a folder must happen within the user gesture's call stack with no await before the picker, so count the browser's documents synchronously first
    const n = countBrowserDocs();
    const r = await openVaultFromPicker();
    if (r === "cancelled") return;
    if (r === "unsupported") {
      toast(t("当前浏览器不支持打开本地文件夹，请用 Chrome / Edge"), "error");
      return;
    }
    if (r === "failed") return; // vaultSession has already shown the failure reason
    toast(t("已打开文件夹「{name}」", { name: getVaultState().name ?? "" }), "success");
    if (n === 0) return; // Leave an empty library empty and let the user create documents
    const ok = await askConfirm({
      title: t("迁移浏览器里的文章"),
      message: t("浏览器里还有 {n} 篇本地文章，要搬进这个文件夹吗？搬完后浏览器里的副本会删除。", { n }),
      confirmText: t("迁移"),
    });
    if (!ok) return;
    const moved = await migrateBrowserDocsToVault();
    notifyDocsChanged();
    library.setCustomCats(listLocalCats()); // Empty categories exist only in the category table, so read it separately again
    toast(t("已迁入 {n} 篇文章", { n: moved }), "success");
  };

  // Turn 0 into null: NavRow draws no count for null, and an empty trash shouldn't wear a 「0」
  const trashCount = library.trashDocs?.length ? library.trashDocs.length : null;
  const trashRow = (
    <ViewRow
      ws={ws}
      viewKey={TRASH}
      label={t("回收站")}
      count={trashCount}
      icon={<Trash2 size={14} />}
    />
  );

  return (
    <div className="shrink-0 border-t border-[var(--hairline)] px-2 pb-2 pt-1.5">
      {auth.loggedIn ? (
        <>
          <ViewRow ws={ws} viewKey={ASSETS} label={t("图片库")} count={null} icon={<Images size={14} />} />
          {trashRow}
          <div className="mt-1.5 border-t border-[var(--hairline)] pt-1.5">
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-2 py-1 hover:bg-[var(--sidebar-hover)]"
              title={t("账户")}
              onClick={menus.toggleAccountMenu}
            >
              <Avatar user={auth.session?.user} />
              <span className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--ink-soft)]">
                {auth.session?.user?.name ?? auth.session?.user?.email}
              </span>
              <ChevronsUpDown size={14} className="shrink-0 text-[var(--ink-faint)]" />
            </button>
            {menus.accountMenu ? (
              <AccountMenu
                anchor={menus.accountMenu}
                user={auth.session?.user}
                onClose={menus.closeAccountMenu}
                onOpenSettings={() => ws.nav.openCategory(SETTINGS)}
              />
            ) : null}
          </div>
        </>
      ) : auth.offlineAuthed ? (
        // The server is unreachable, but this device still knows who you are: the account shows as usual with a restrained 「离线」 (Offline) badge on the right.
        // No account menu: sign out, admin and the rest need the network; image library/trash likewise stay hidden for now
        <div className="mt-1.5 border-t border-[var(--hairline)] pt-1.5">
          <div
            className="flex w-full items-center gap-2 rounded-md px-2 py-1"
            title={t("离线中 · 联网后自动同步")}
          >
            <Avatar user={auth.user} />
            <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-soft)]">
              {auth.user?.name ?? auth.user?.email}
            </span>
            <span className="flex shrink-0 items-center gap-1 text-[11px] text-[var(--ink-faint)]">
              <span className="h-1.5 w-1.5 rounded-full bg-[var(--ink-faint)]" />
              {t("离线")}
            </span>
            {/* The two square buttons sit snug together as a group, not taking the outer gap */}
            <div className="flex shrink-0 items-center">
              <LangToggle />
              <DarkToggle />
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Deleting from a disk library moves files into .trash/, so there's a trash to view only while a library is open */}
          {vault.status === "open" ? trashRow : null}
          {/* Local mode: documents are saved on this device and synced to the cloud after login */}
          <button
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--accent)] text-[12.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
            onClick={() => openAuth("login")}
          >
            <LogIn size={14} />
            {t("登录同步到云端")}
          </button>
          <div className="mt-2 flex items-center gap-2 border-t border-[var(--hairline)] px-2 pt-2">
            <div className="min-w-0 flex-1">
              <VaultRow vault={vault} onOpen={() => void openVaultAsLibrary()} />
            </div>
            {/* The two square buttons sit snug together as a group, not taking the outer gap */}
            <div className="flex shrink-0 items-center">
              <LangToggle />
              <DarkToggle />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
