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

/** Whitelist membership alone is not identity proof; the provider must have verified this account's email. */
export function isVerifiedAdmin(user: { email?: string | null; emailVerified?: Date | boolean | null }): boolean {
  return Boolean(user.emailVerified) && isAdminEmail(user.email);
}

/** Session flags are refreshed from the database and bound to the OAuth proof in auth.ts on every auth() call. */
export function adminSessionUserId(session: Session | null): string | null {
  if (!session?.user?.id || !session.user.isAdmin || !isVerifiedAdmin({ email: session.user.email, emailVerified: session.user.emailIsVerified })) return null;
  return session.user.id;
}
