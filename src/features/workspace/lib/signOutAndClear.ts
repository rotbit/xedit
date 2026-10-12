/**
 * 退出登录并清掉本地账号痕迹：头像菜单与设置页共用这一份，免得两处的清理步骤走样。
 */
import { signOut } from "next-auth/react";
import { toast } from "@/components/Toast";
import { resetSettings } from "@/hooks/useSettings";
import type { TFn } from "@/i18n/t";
import { stashAndDetachMirror } from "@/lib/orphanDrafts";

export function signOutAndClear(t: TFn): void {
  // 登出即清空本地镜像，避免下一个账号看到上一个账号的文章；
  // 但没推上云的草稿要先挪进孤儿列表，原主人下次登录能自动领回去。
  // 存不下（配额满）就整份镜像留着不清——稿子比干净更重要。
  // 设置那份是模块级缓存（GET 只发一次），不一起清的话换账号后
  // 沿用的还是上一个账号的主题/自定义 CSS
  if (!stashAndDetachMirror()) toast(t("有未同步草稿，本次未清理本地缓存"), "info");
  resetSettings();
  void signOut();
}
