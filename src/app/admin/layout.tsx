import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { isAdminEmail } from "@/lib/admin";

export const metadata: Metadata = {
  title: "管理后台",
  robots: { index: false, follow: false },
};

/** 服务端门卫：非白名单管理员直接送回首页，页面代码根本不下发 */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!session?.user?.id || !isAdminEmail(session.user.email)) redirect("/");
  // 根布局 body 是 overflow-hidden，滚动收在这层容器里
  return <div className="h-full overflow-y-auto bg-[var(--paper)]">{children}</div>;
}
