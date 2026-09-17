"use client";

/**
 * 工作台侧栏最底下那一排。三种形态互斥：已登录给图片库/回收站/账户菜单，
 * 离线态只留一行提示，未登录（本地模式）给登录引导和「打开文件夹作为文库」。
 * 状态都来自 useWorkspace 聚合出的 ws，本文件不发请求、不自己存状态。
 */
import { ChevronsUpDown, FolderOpen, Images, Loader2, LogIn, Trash2 } from "lucide-react";
import { openAuth } from "@/components/AuthDialog";
import { DarkToggle } from "@/components/DarkToggle";
import { askConfirm } from "@/components/PromptDialog";
import { toast } from "@/components/Toast";
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
import { ASSETS, TRASH, countCls, rowCls } from "../constants";
import { AccountMenu } from "./AccountMenu";
import type { Workspace } from "../hooks/useWorkspace";

/** 底部这排次要按钮：与工作台其他 ghost 按钮同款，压在深色侧栏上也够清楚 */
const vaultBtnCls =
  "flex h-8 w-full cursor-pointer items-center justify-center gap-1.5 rounded-md border border-[var(--hairline)] px-2 text-[12.5px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]";

/** 图片库 / 回收站两个入口的行样式与分类行一致，但没有展开箭头与拖拽 */
function SimpleRow({
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
  const active = ws.nav.activeCat === viewKey && !ws.nav.readingId;
  return (
    <button
      className={`flex w-full cursor-pointer items-center gap-1 rounded-md py-1.5 pr-2 text-left text-[13px] transition-colors ${rowCls(active)}`}
      style={{ paddingLeft: "6px" }}
      onClick={() => ws.nav.openCategory(viewKey)}
    >
      <span className="h-5 w-5 shrink-0" />
      <span className={active ? "text-[var(--accent)]" : "text-[var(--ink-faint)]"}>{icon}</span>
      <span className="ml-1 min-w-0 flex-1 truncate">{label}</span>
      {count !== null ? (
        <span className={`rounded-full px-1.5 text-[11px] ${countCls(active)}`}>{count}</span>
      ) : null}
    </button>
  );
}

/** 本地模式的文库来源：开着磁盘文件夹就显示库名，否则给个入口去开一个 */
function VaultRow({ vault, onOpen }: { vault: VaultState; onOpen: () => void }) {
  if (vault.status === "open") {
    return (
      <div className="flex min-w-0 items-center gap-1 text-[11px] text-[var(--ink-faint)]">
        <FolderOpen size={13} className="shrink-0" />
        <span className="min-w-0 flex-1 truncate" title={vault.name ?? ""}>
          {vault.name}
        </span>
        <button
          className="shrink-0 cursor-pointer rounded px-1 py-0.5 transition-colors hover:bg-[var(--sidebar-hover)] hover:text-[var(--ink)]"
          title="关闭文件夹，回到浏览器存储"
          onClick={() => {
            void closeVault().then(() => toast("已关闭文件夹，回到浏览器存储", "info"));
          }}
        >
          关闭
        </button>
      </div>
    );
  }

  if (vault.status === "opening") {
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-[11px] text-[var(--ink-faint)]">
        <Loader2 size={13} className="shrink-0 animate-spin" />
        <span className="min-w-0 truncate">正在打开…</span>
      </div>
    );
  }

  // 刷新后权限掉回 prompt：重新授权必须发生在点击里
  if (vault.status === "pending") {
    return (
      <button className={vaultBtnCls} onClick={() => void resumeVault()}>
        <FolderOpen size={13} className="shrink-0" />
        <span className="min-w-0 truncate">恢复访问「{vault.name}」</span>
      </button>
    );
  }

  // Safari、Firefox 没有 File System Access，给不出入口，就只说明数据存在本机，别让人点了没反应
  if (!isVaultSupported()) {
    return (
      <span
        className="block truncate text-[11px] text-[var(--ink-faint)]"
        title="打开文件夹需要 Chrome / Edge 等 Chromium 浏览器"
      >
        本地模式 · 数据保存在本设备
      </span>
    );
  }

  return (
    <button className={vaultBtnCls} onClick={onOpen}>
      <FolderOpen size={13} className="shrink-0" />
      <span className="min-w-0 truncate">打开文件夹作为文库</span>
    </button>
  );
}

/** 侧栏底部：登录态是工具入口 + 账户，离线态是提示，本地模式是登录引导 */
export function SidebarFooter({ ws }: { ws: Workspace }) {
  const { auth, menus, library, vault } = ws;

  /** 选一个磁盘文件夹当文库；浏览器里还攒着文章就问一句要不要一起搬进去 */
  const openVaultAsLibrary = async () => {
    // 选文件夹必须发生在用户手势的调用栈里，picker 之前不能有 await，所以先同步数一遍浏览器里的篇数
    const n = countBrowserDocs();
    const r = await openVaultFromPicker();
    if (r === "cancelled") return;
    if (r === "unsupported") {
      toast("当前浏览器不支持打开本地文件夹，请用 Chrome / Edge", "error");
      return;
    }
    if (r === "failed") return; // vaultSession 已经弹过失败原因
    toast(`已打开文件夹「${getVaultState().name}」`, "success");
    if (n === 0) return; // 空库就空着，让用户自己新建
    const ok = await askConfirm({
      title: "迁移浏览器里的文章",
      message: `浏览器里还有 ${n} 篇本地文章，要搬进这个文件夹吗？搬完后浏览器里的副本会删除。`,
      confirmText: "迁移",
    });
    if (!ok) return;
    const moved = await migrateBrowserDocsToVault();
    notifyDocsChanged();
    library.setCustomCats(listLocalCats()); // 空分类只在分类表里，得单独再读一次
    toast(`已迁入 ${moved} 篇文章`, "success");
  };

  // 0 转成 null：SimpleRow 拿到 null 就不画计数气泡，空回收站不该顶着一个「0」
  const trashCount = library.trashDocs?.length ? library.trashDocs.length : null;
  const trashRow = (
    <SimpleRow
      ws={ws}
      viewKey={TRASH}
      label="回收站"
      count={trashCount}
      icon={<Trash2 size={14} />}
    />
  );

  return (
    <div className="shrink-0 border-t border-[var(--hairline)] px-2 pb-2 pt-1.5">
      {auth.loggedIn ? (
        <>
          <SimpleRow ws={ws} viewKey={ASSETS} label="图片库" count={null} icon={<Images size={14} />} />
          {trashRow}
          <div className="mt-1.5 border-t border-[var(--hairline)] pt-1.5">
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--sidebar-hover)]"
              title="账户"
              onClick={menus.toggleAccountMenu}
            >
              {auth.session?.user?.image ? (
                // 头像地址来自第三方登录，域名不固定，配不进 next/image 的远端白名单
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={auth.session.user.image}
                  alt="avatar"
                  className="h-6 w-6 shrink-0 rounded-full ring-1 ring-[var(--hairline-strong)]"
                />
              ) : (
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--sidebar-active)] text-[11px] text-[var(--ink)]">
                  {(auth.session?.user?.name ?? "U").slice(0, 1)}
                </span>
              )}
              <span className="min-w-0 flex-1 truncate text-left text-[12px] text-[var(--ink-soft)]">
                {auth.session?.user?.name ?? auth.session?.user?.email}
              </span>
              <ChevronsUpDown size={13} className="shrink-0 text-[var(--ink-faint)]" />
            </button>
            {menus.accountMenu ? (
              <AccountMenu
                anchor={menus.accountMenu}
                user={auth.session?.user}
                onClose={menus.closeAccountMenu}
              />
            ) : null}
          </div>
        </>
      ) : auth.offlineAuthed ? (
        <div className="mt-1.5 flex items-center justify-between px-1.5 pt-1">
          <span className="text-[11px] text-[var(--ink-faint)]">离线中 · 联网后自动同步</span>
          <DarkToggle />
        </div>
      ) : (
        <>
          {/* 磁盘文库的删除是移进 .trash/，所以只有开着库时才有回收站可看 */}
          {vault.status === "open" ? trashRow : null}
          {/* 本地模式：文章保存在本设备，登录后自动同步上云 */}
          <button
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--accent)] text-[12.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
            onClick={() => openAuth("login")}
          >
            <LogIn size={13} />
            登录同步到云端
          </button>
          <div className="mt-2 flex items-center gap-2 border-t border-[var(--hairline)] px-1.5 pt-2">
            <div className="min-w-0 flex-1">
              <VaultRow vault={vault} onOpen={() => void openVaultAsLibrary()} />
            </div>
            <DarkToggle />
          </div>
        </>
      )}
    </div>
  );
}
