import type { Session } from "next-auth";

/**
 * Super admins: whitelist from the ADMIN_EMAILS env var (comma-separated, case-insensitive).
 * Not stored in the DB -- like githubConfigured / ossConfigured it follows the existing "feature switches live in env" convention,
 * so changing the list just means editing the env var and restarting. This file doesn't import "@/auth" because auth.ts callbacks use it too.
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

/** Admin API guard: returns the userId if the session belongs to a whitelisted admin, otherwise null */
export function adminSessionUserId(session: Session | null): string | null {
  if (!session?.user?.id || !isAdminEmail(session.user.email)) return null;
  return session.user.id;
}
