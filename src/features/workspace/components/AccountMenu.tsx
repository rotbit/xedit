"use client";

import { createPortal } from "react-dom";
import type { Session } from "next-auth";
import { LogOut, Settings, ShieldCheck } from "lucide-react";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";
import { menuItemCls, menuPanelCls } from "../constants";
import { signOutAndClear } from "../lib/signOutAndClear";
import type { AccountMenuAnchor } from "../hooks/useMenus";

/** 菜单最小宽度：触发行较窄时仍能容下「退出登录」（英文 Sign out 更短，按中文留宽即可） */
const MIN_WIDTH = 186;

/** 侧栏底部账户菜单：贴着触发行向上弹出。
 *  只管账号本身（设置 / 后台 / 登出），语言、夜间模式都收进了设置页——导入是文库操作，入口在文件树右键菜单与顶栏新建按钮上 */
export function AccountMenu({
  anchor,
  user,
  onClose,
  onOpenSettings,
}: {
  anchor: AccountMenuAnchor;
  user: Session["user"] | undefined;
  onClose: () => void;
  /** 进入工作区里的「设置」虚拟视图 */
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
