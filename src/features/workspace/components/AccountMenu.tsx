"use client";

import { createPortal } from "react-dom";
import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { LogOut, Moon, ShieldCheck, Sun } from "lucide-react";
import { stashAndDetachMirror } from "@/lib/orphanDrafts";
import { toast } from "@/components/Toast";
import { toggleDark } from "@/components/DarkToggle";
import { resetSettings } from "@/hooks/useSettings";
import { useEscape } from "@/hooks/useEscape";
import { menuItemCls, menuPanelCls } from "../constants";
import type { AccountMenuAnchor } from "../hooks/useMenus";

/** 菜单最小宽度：触发行较窄时仍能容下「退出登录」 */
const MIN_WIDTH = 186;

/** 侧栏底部账户菜单：贴着触发行向上弹出。
 *  只管账号本身（主题 / 后台 / 登出）——导入是文库操作，入口在文件树右键菜单与顶栏新建按钮上 */
export function AccountMenu({
  anchor,
  user,
  onClose,
}: {
  anchor: AccountMenuAnchor;
  user: Session["user"] | undefined;
  onClose: () => void;
}) {
  useEscape(onClose);
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
            // 登出即清空本地镜像，避免下一个账号看到上一个账号的文章；
            // 但没推上云的草稿要先挪进孤儿列表，原主人下次登录能自动领回去。
            // 存不下（配额满）就整份镜像留着不清——稿子比干净更重要。
            // 设置那份是模块级缓存（GET 只发一次），不一起清的话换账号后
            // 沿用的还是上一个账号的主题/自定义 CSS
            if (!stashAndDetachMirror()) toast("有未同步草稿，本次未清理本地缓存", "info");
            resetSettings();
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
