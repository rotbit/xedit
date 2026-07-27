import type { Session } from "next-auth";

/**
 * 超级管理员：ADMIN_EMAILS 环境变量白名单（逗号分隔，不区分大小写）。
 * 不落库——与 githubConfigured / ossConfigured 一样走「能力开关在 env」的既有约定，
 * 改名单只需改环境变量重启。此文件不 import "@/auth"，auth.ts 的回调也要用它。
 */

export function isAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const lower = email.trim().toLowerCase();
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean)
    .includes(lower);
}

/** 管理接口守卫：会话属于白名单管理员时返回其 userId，否则 null */
export function adminSessionUserId(session: Session | null): string | null {
  if (!session?.user?.id || !isAdminEmail(session.user.email)) return null;
  return session.user.id;
}
