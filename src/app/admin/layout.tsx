import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { auth } from "@/auth";
import { adminSessionUserId } from "@/lib/admin";

export const metadata: Metadata = {
  title: "管理后台", // i18n-ignore admin deferred, page metadata
  robots: { index: false, follow: false },
};

/** Server-side gatekeeper: non-allowlisted admins are sent back home and the page code is never shipped */
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  if (!adminSessionUserId(session)) redirect("/");
  // The root layout body is overflow-hidden, so scrolling lives in this container
  return <div className="h-full overflow-y-auto bg-[var(--paper)]">{children}</div>;
}
