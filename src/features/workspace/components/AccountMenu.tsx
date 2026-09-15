"use client";

import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { BookDown, FolderSync, LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { clearMirror } from "@/lib/docStore";
import { resetVaultSyncSession } from "@/lib/vaultSync/engine";
import { useVaultSyncState } from "@/lib/vaultSync/state";
import { isVaultSupported, useVaultSession } from "@/lib/localBackend/vaultSession";
import { toggleDark } from "@/components/DarkToggle";
import { useEscape } from "@/hooks/useEscape";
import { menuItemCls, menuPanelCls, syncDotCls } from "../constants";
import type { AccountMenuAnchor } from "../hooks/useMenus";

/** 菜单最小宽度：触发行较窄时仍能容下「退出登录」 */
const MIN_WIDTH = 186;

/** 侧栏底部账户菜单：贴着触发行向上弹出 */
export function AccountMenu({
  anchor,
  user,
  onClose,
  onOpenFeishu,
  onOpenVaultSync,
}: {
  anchor: AccountMenuAnchor;
  user: Session["user"] | undefined;
  onClose: () => void;
  onOpenFeishu: () => void;
  onOpenVaultSync: () => void;
}) {
  useEscape(onClose);
  const vault = useVaultSession();
  const sync = useVaultSyncState();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
  };

  // 不支持打开本地文件夹的浏览器就别提这件事：它根本没得选。
  // 但库还开着（哪怕支持性判断失了准）就一定要留着入口，否则没地方关它
  const showVaultSync = isVaultSupported() || vault.status !== "none";

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
          {user?.email ?? user?.name}
        </p>
        <button className={menuItemCls} onClick={run(toggleDark)}>
          <Moon size={13} className="text-[var(--ink-faint)] dark:hidden" />
          <Sun size={13} className="hidden text-[var(--ink-faint)] dark:block" />
          <span className="dark:hidden">夜间模式</span>
          <span className="hidden dark:block">日间模式</span>
        </button>
        <button className={menuItemCls} onClick={run(onOpenFeishu)}>
          <BookDown size={13} className="text-[var(--ink-faint)]" />
          飞书知识库导入…
        </button>
        {showVaultSync ? (
          <button className={menuItemCls} onClick={run(onOpenVaultSync)}>
            <FolderSync size={13} className="text-[var(--ink-faint)]" />
            同步文件夹…
            {/* 同步不提问、不打断，所以在菜单里也只留这一颗点 */}
            {vault.status === "open" ? (
              <span className={`ml-auto h-1.5 w-1.5 shrink-0 rounded-full ${syncDotCls(sync)}`} />
            ) : null}
          </button>
        ) : null}
        {user?.isAdmin ? (
          <a className={menuItemCls} href="/admin">
            <ShieldCheck size={13} className="text-[var(--ink-faint)]" />
            管理后台
          </a>
        ) : null}
        <div className="my-1 border-t border-[var(--hairline)]" />
        <button
          className={menuItemCls}
          onClick={run(() => {
            // 登出即清空本地镜像，避免下一个账号看到上一个账号的文章
            clearMirror();
            // 同步索引/映射都是这个账号这个库的，换个账号登进来一概不能用
            resetVaultSyncSession();
            void signOut();
          })}
        >
          <LogOut size={13} className="text-[var(--ink-faint)]" />
          退出登录
        </button>
      </div>
    </>,
    document.body
  );
}
