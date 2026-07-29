"use client";

import { ChevronsUpDown, Footprints, Images, LogIn, Trash2 } from "lucide-react";
import { openAuth } from "@/components/AuthDialog";
import { DarkToggle } from "@/components/DarkToggle";
import { ASSETS, STATS, TRASH, countCls, rowCls } from "../constants";
import { AccountMenu } from "./AccountMenu";
import type { Workspace } from "../hooks/useWorkspace";

/** 足迹 / 图片库 / 回收站三个入口的行样式与分类行一致，但没有展开箭头与拖拽 */
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

/** 侧栏底部：登录态是工具入口 + 账户，离线态是提示，本地模式是登录引导 */
export function SidebarFooter({
  ws,
  onOpenSettings,
  onOpenFeishu,
}: {
  ws: Workspace;
  onOpenSettings: () => void;
  onOpenFeishu: () => void;
}) {
  const { auth, menus, library } = ws;

  return (
    <div className="shrink-0 border-t border-[var(--hairline)] px-2 pb-2 pt-1.5">
      {auth.loggedIn ? (
        <>
          <SimpleRow ws={ws} viewKey={STATS} label="写作足迹" count={null} icon={<Footprints size={14} />} />
          <SimpleRow ws={ws} viewKey={ASSETS} label="图片库" count={null} icon={<Images size={14} />} />
          <SimpleRow
            ws={ws}
            viewKey={TRASH}
            label="回收站"
            count={library.trashDocs?.length ? library.trashDocs.length : null}
            icon={<Trash2 size={14} />}
          />
          <div className="mt-1.5 border-t border-[var(--hairline)] pt-1.5">
            <button
              className="flex w-full cursor-pointer items-center gap-2 rounded-md px-1.5 py-1 hover:bg-[var(--sidebar-hover)]"
              title="账户"
              onClick={menus.toggleAccountMenu}
            >
              {auth.session?.user?.image ? (
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
                onOpenSettings={onOpenSettings}
                onOpenFeishu={onOpenFeishu}
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
          {/* 本地模式：文章保存在本设备，登录后自动同步上云 */}
          <button
            className="flex h-9 w-full cursor-pointer items-center justify-center gap-2 rounded-md bg-[var(--accent)] text-[12.5px] font-medium text-[var(--accent-fg)] transition-colors hover:bg-[var(--accent-deep)]"
            onClick={() => openAuth("login")}
          >
            <LogIn size={13} />
            登录同步到云端
          </button>
          <div className="mt-2 flex items-center justify-between border-t border-[var(--hairline)] px-1.5 pt-2">
            <span className="text-[11px] text-[var(--ink-faint)]">本地模式 · 数据保存在本设备</span>
            <DarkToggle />
          </div>
        </>
      )}
    </div>
  );
}
