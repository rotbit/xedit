"use client";

import { useCallback, useSyncExternalStore } from "react";
import { useSession } from "next-auth/react";
import { knownPermissions, type Permission } from "@/lib/permissionKeys";

/**
 * Which features the current account has (/api/me/permissions returns effective values: all on for admins, all off when banned).
 * Several places ask (review button, cover tab, ...), so results are cached per user id at module level and fetched once per page;
 * switching accounts changes the id and naturally refetches. Loading, logged out, or failed requests all count as nothing enabled --
 * the UI just hides the buttons; the real gate is on the server.
 */

const EMPTY: Permission[] = [];

/** Fetched results; a missing entry means not fetched yet or in flight */
const cache = new Map<string, Permission[]>();
/** User id currently being fetched, so components mounting together don't each send a request */
const inflight = new Set<string>();
const listeners = new Set<() => void>();

function load(userId: string) {
  if (cache.has(userId) || inflight.has(userId)) return;
  inflight.add(userId);
  void fetch("/api/me/permissions")
    .then((r) => (r.ok ? r.json() : null))
    .then((data: { permissions?: string[] } | null) => {
      cache.set(userId, knownPermissions(data?.permissions));
    })
    .catch(() => {
      // Don't cache failures, so the next component mount can retry
    })
    .finally(() => {
      inflight.delete(userId);
      listeners.forEach((cb) => cb());
    });
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

/** Effective permission list for the current account */
export function usePermissions(): Permission[] {
  const userId = useSession().data?.user?.id;
  // Kick off the fetch on subscribe; keyed by userId so we don't unsubscribe/resubscribe every render
  const sub = useCallback(
    (cb: () => void) => {
      if (userId) load(userId);
      return subscribe(cb);
    },
    [userId]
  );
  return useSyncExternalStore(
    sub,
    () => (userId ? (cache.get(userId) ?? EMPTY) : EMPTY),
    () => EMPTY
  );
}

/** Whether the current account can use a given feature */
export function useCan(perm: Permission): boolean {
  return usePermissions().includes(perm);
}
