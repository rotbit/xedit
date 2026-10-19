/**
 * Sign out and clear local account traces: shared by the avatar menu and the settings page so the two cleanups don't drift apart.
 */
import { signOut } from "next-auth/react";
import { toast } from "@/components/Toast";
import { resetSettings } from "@/hooks/useSettings";
import type { TFn } from "@/i18n/t";
import { stashAndDetachMirror } from "@/lib/orphanDrafts";

export function signOutAndClear(t: TFn): void {
  // Signing out clears the local mirror so the next account doesn't see the previous account's docs;
  // but drafts not yet pushed to the cloud move to the orphan list first, so the original owner reclaims them automatically on next login.
  // If they can't be saved (quota full), keep the whole mirror uncleared — drafts matter more than cleanliness.
  // Settings are a module-level cache (GET sent only once); if not cleared too, after switching accounts
  // the previous account's theme/custom CSS would still be in use
  if (!stashAndDetachMirror()) toast(t("有未同步草稿，本次未清理本地缓存"), "info");
  resetSettings();
  void signOut();
}
