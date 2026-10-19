"use client";

import { useEffect } from "react";

/** Register the offline-shell Service Worker (production only; in development hot reload and SW caching interfere) */
export function SwRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") return;
    if (!("serviceWorker" in navigator)) return;
    navigator.serviceWorker.register("/sw.js").catch(() => undefined);
  }, []);
  return null;
}
