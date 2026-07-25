"use client";

import { signOut } from "next-auth/react";
import type { Session } from "next-auth";
import { Settings2, LogOut, Moon, Sun } from "lucide-react";
import { Dropdown, menuItemCls } from "@/components/Dropdown";
import { clearMirror } from "@/lib/docStore";
import { toggleDark } from "@/components/DarkToggle";

/** 顶栏账户菜单：夜间模式、设置入口、退出登录 */
export function AccountMenu({
  user,
  onOpenSettings,
}: {
  user: NonNullable<Session["user"]>;
  onOpenSettings: () => void;
}) {
  return (
    <Dropdown
      width={180}
      trigger={
        <button className="flex h-8 cursor-pointer items-center gap-2 rounded-md px-1.5 hover:bg-[var(--paper)]">
          {user.image ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={user.image}
              alt={user.name ?? "avatar"}
              className="h-6 w-6 rounded-full ring-1 ring-[var(--hairline-strong)]"
            />
          ) : (
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-[var(--accent-wash)] text-[11px] text-[var(--accent)]">
              {(user.name ?? "U").slice(0, 1)}
            </span>
          )}
        </button>
      }
    >
      <p className="truncate px-3.5 py-1.5 text-[12px] text-[var(--ink-faint)]">
        {user.name ?? user.email}
      </p>
      <button className={menuItemCls} onClick={toggleDark}>
        <Moon size={14} className="dark:hidden" />
        <Sun size={14} className="hidden dark:block" />
        <span className="dark:hidden">夜间模式</span>
        <span className="hidden dark:block">日间模式</span>
      </button>
      <button className={menuItemCls} onClick={onOpenSettings}>
        <Settings2 size={14} />
        设置…
      </button>
      <div className="my-1 border-t border-[var(--hairline)]" />
      <button
        className={menuItemCls}
        onClick={() => {
          // 登出即清空本地镜像，避免下一个账号看到上一个账号的文章
          clearMirror();
          void signOut();
        }}
      >
        <LogOut size={14} />
        退出登录
      </button>
    </Dropdown>
  );
}
