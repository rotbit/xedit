"use client";

import { useEffect, useSyncExternalStore } from "react";
import { getSession, useSession } from "next-auth/react";
import type { Session } from "next-auth";
import {
  AUTH_SNAPSHOT_KEY,
  readAuthSnapshot,
  wasAuthed,
  type AuthSnapshot,
} from "@/lib/authSnapshot";
import { MIRROR_OWNER_KEY, sameOwner, toMirrorOwner } from "@/lib/mirrorOwner";
import { resolveAccountSwitch } from "@/lib/orphanDrafts";
import { bumpSessionEpoch } from "@/lib/sessionEpoch";
import { notifyDocsChanged } from "@/lib/localDocs";
import { toast } from "@/components/Toast";
import { t } from "@/i18n/t";
import {
  getProbeServerState,
  getProbeState,
  startProbing,
  subscribeProbe,
} from "@/lib/sessionProbe";
import { useOnline } from "@/hooks/useOnline";

/** For rendering the account row: session when online, local snapshot when offline; their fields line up */
export type AuthUser = Session["user"] | AuthSnapshot;

/** What the identifying fields look like in an account snapshot / ownership record written by another tab */
function identityOf(raw: string | null) {
  if (raw === null) return null;
  try {
    const v: unknown = JSON.parse(raw);
    return v && typeof v === "object" ? toMirrorOwner(v as { id?: string; email?: string }) : null;
  } catch {
    return null;
  }
}

/**
 * The workspace's three run modes:
 * - loggedIn: normal cloud mode
 * - offlineAuthed: the local login is still valid but the server is temporarily unreachable (offline, reverse proxy down, VPN dropped);
 *   everything goes to the local mirror as usual and syncs automatically once back online
 * - localMode: logged out, data lives in the browser (Obsidian-style local-first)
 *
 * There's only one rule: **it's a logout only if the server explicitly says "no session"**. The next-auth client
 * reports unauthenticated for both network failures and real logouts; trusting it would drop to guest mode whenever the network blips,
 * so we run an extra probe (lib/sessionProbe) and stay logged in until it reaches a verdict.
 */
export function useAuthMode() {
  const { data: session, status } = useSession();
  const navigatorOnline = useOnline();
  const probe = useSyncExternalStore(subscribeProbe, getProbeState, getProbeServerState);

  const loggedIn = status === "authenticated";
  // This device remembers being logged in: the current unauthenticated most likely just means "couldn't get an answer"
  const authedBefore = status === "unauthenticated" && wasAuthed();
  const offlineAuthed = authedBefore && probe !== "signed-out";
  const localMode = status === "unauthenticated" && !offlineAuthed;

  const user = session?.user;
  const userId = user?.id;
  const userEmail = user?.email;

  // Each confirmed login settles "who owns this mirror": the same person continues the snapshot and reclaims drafts that didn't get pushed last time;
  // if the user changed (another tab logged in as someone else, the cookie got swapped, with no logout in between), first move the old owner's dirty drafts
  // into the orphan list, then clear the mirror, or the two accounts' docs get mixed together.
  // This effect runs before the useDocLibrary ones, so the ordering holds
  useEffect(() => {
    if (status !== "authenticated" || !user) return;
    const r = resolveAccountSwitch(user);
    if (r.stashFailed) {
      toast(t("上一账号有未同步草稿，本次未清理本地缓存"), "info");
      return;
    }
    // When dispatching the event synchronously, useDocLibrary's listener isn't attached yet (it comes later in the same effect pass), so defer to a microtask
    if (r.cleared || r.reclaimed > 0) queueMicrotask(() => notifyDocsChanged());
    if (r.reclaimed > 0) toast(t("找回 {n} 篇上次未同步的草稿，将自动同步", { n: r.reclaimed }), "success");
  }, [status, user]);

  // Another tab logged out or switched accounts: this tab's localStorage has already changed, but React knows nothing about it.
  // next-auth broadcasts signIn/signOut itself via BroadcastChannel (node_modules/next-auth/react.js)
  // and refetches the session; what we add is the local state — bump the generation to invalidate in-flight writes, then have the list reread.
  // The same person just refreshing confirmedAt isn't a user change; otherwise every tab renewing would needlessly invalidate a batch of in-flight requests
  useEffect(() => {
    const mine = toMirrorOwner({ id: userId, email: userEmail });
    const onStorage = (e: StorageEvent) => {
      if (e.key !== null && e.key !== AUTH_SNAPSHOT_KEY && e.key !== MIRROR_OWNER_KEY) return;
      if (e.key !== null && e.newValue !== null && sameOwner(identityOf(e.newValue), mine)) return;
      bumpSessionEpoch();
      notifyDocsChanged();
      void getSession(); // Also nudge the provider so status settles again
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, [userId, userEmail]);

  // No session but this device remembers logging in: probe the server ourselves instead of taking next-auth's word for it
  useEffect(() => {
    if (!authedBefore) return;
    return startProbing();
  }, [authedBefore]);

  return {
    session,
    status,
    /** Browser online "and" server reachable: callers use this to decide between going straight to the cloud or saving locally first */
    online: navigatorOnline && !offlineAuthed,
    loggedIn,
    offlineAuthed,
    localMode,
    /** Current account: session when online, local snapshot when offline (the snapshot is cached, so the reference is stable) */
    user: user ?? readAuthSnapshot() ?? undefined,
  };
}

export type AuthMode = ReturnType<typeof useAuthMode>;
