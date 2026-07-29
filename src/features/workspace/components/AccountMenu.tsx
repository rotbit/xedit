"use client";

import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { BookDown, LogOut, Moon, Settings2, ShieldCheck, Sun } from "lucide-react";
import { clearMirror } from "@/lib/docStore";
import { toggleDark } from "@/components/DarkToggle";
import { menuItemCls, menuPanelCls } from "../constants";
import type { AccountMenuAnchor } from "../hooks/useMenus";

/** 菜单最小宽度：触发行较窄时仍能容下「退出登录」 */
const MIN_WIDTH = 186;

/** 侧栏底部账户菜单：贴着触发行向上弹出 */
export function AccountMenu({
  anchor,
  user,
  onClose,
  onOpenSettings,
  onOpenFeishu,
}: {
  anchor: AccountMenuAnchor;
  user: Session["user"] | undefined;
  onClose: () => void;
  onOpenSettings: () => void;
  onOpenFeishu: () => void;
}) {
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
        <button className={menuItemCls} onClick={run(toggleDark)}>
          <Moon size={13} className="text-[var(--ink-faint)] dark:hidden" />
          <Sun size={13} className="hidden text-[var(--ink-faint)] dark:block" />
          <span className="dark:hidden">夜间模式</span>
          <span className="hidden dark:block">日间模式</span>
        </button>
        <button className={menuItemCls} onClick={run(onOpenSettings)}>
          <Settings2 size={13} className="text-[var(--ink-faint)]" />
          设置…
        </button>
        <button className={menuItemCls} onClick={run(onOpenFeishu)}>
          <BookDown size={13} className="text-[var(--ink-faint)]" />
          飞书知识库导入…
        </button>
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
