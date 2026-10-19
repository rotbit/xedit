"use client";

import { createPortal } from "react-dom";
import type { Session } from "next-auth";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";
import { menuItemCls, menuPanelCls } from "../constants";
import { signOutAndClear } from "../lib/signOutAndClear";
import type { AccountMenuAnchor } from "../hooks/useMenus";

/** Minimum menu width: still fits 「退出登录」 (Sign out) when the trigger row is narrow (English "Sign out" is shorter, so sizing for Chinese is enough) */
const MIN_WIDTH = 186;

/** Account menu at the bottom of the sidebar: pops up just above the trigger row.
 *  Only handles the account itself (settings / admin / sign out); language and dark mode moved into the settings page. Import is a library action, found in the file tree context menu and the top bar's new button */
export function AccountMenu({
  anchor,
  user,
  onClose,
  onOpenSettings,
}: {
  anchor: AccountMenuAnchor;
  user: Session["user"] | undefined;
  onClose: () => void;
  /** Open the 「设置」 (Settings) virtual view in the workspace */
  onOpenSettings: () => void;
}) {
  useEscape(onClose);
  const t = useT();
  const run = (fn: () => void) => () => {
    onClose();
    fn();
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
          {user?.email ?? user?.name}
        </p>
        <button className={menuItemCls} onClick={run(onOpenSettings)}>
          <Settings size={14} className="text-[var(--ink-faint)]" />
          {t("设置")}
        </button>
        {user?.isAdmin ? (
          <a className={menuItemCls} href="/admin">
            <ShieldCheck size={14} className="text-[var(--ink-faint)]" />
            {t("管理后台")}
          </a>
        ) : null}
        <div className="my-1 border-t border-[var(--hairline)]" />
        <button
          className={menuItemCls}
          onClick={run(() => signOutAndClear(t))}
        >
          <LogOut size={14} className="text-[var(--ink-faint)]" />
          {t("退出登录")}
        </button>
      </div>
    </>,
    document.body
  );
}
