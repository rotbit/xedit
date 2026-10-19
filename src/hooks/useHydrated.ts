"use client";

import { useSyncExternalStore } from "react";

const noopSubscribe = () => () => {};

/**
 * Returns false during SSR and the first client frame, flips to true right after hydration and triggers a re-render.
 * Why: with the session injected into the server HTML, useSession is final on the first frame,
 * so render branches that depend on localStorage (doc mirror, local library) must wait for this flag,
 * otherwise the server (no localStorage) and the first client frame disagree and hydration throws #418.
 */
export function useHydrated(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false
  );
}
