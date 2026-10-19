"use client";

import { useEffect, useMemo, useState } from "react";
import { DOCS_CHANGED_EVENT } from "@/lib/localDocs";
import { todayKey } from "@/lib/todos/dates";
import { DAY_LOG_CHANGED_EVENT } from "@/lib/todos/events";

/**
 * Log events only refresh the UI; library events also bump the cache signal for derived todos. Returns a stable reference when neither the date nor the library changed.
 * Also re-reads "today" — if the page stays open past midnight, the next activity of any kind corrects the date.
 */
export function useTodaySignals() {
  const [today, setToday] = useState(() => todayKey());
  const [docsVersion, setDocsVersion] = useState(0);
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => {
      setTick((t) => t + 1);
      setToday(todayKey());
    };
    const onDocs = () => {
      setDocsVersion((v) => v + 1);
      bump();
    };
    // Items checked in another tab write to the same localStorage; this page doesn't get the custom event, so rely on the storage event;
    // a null key means clear(), which includes the log key, so refresh too
    const onStorage = (e: StorageEvent) => {
      if (e.key === null || e.key.startsWith("xedit-day-log")) bump();
    };
    window.addEventListener(DOCS_CHANGED_EVENT, onDocs);
    window.addEventListener(DAY_LOG_CHANGED_EVENT, bump);
    window.addEventListener("storage", onStorage);
    // Also check when the tab becomes visible again: a page left open overnight should come back to a new day
    document.addEventListener("visibilitychange", onDocs);
    return () => {
      window.removeEventListener(DOCS_CHANGED_EVENT, onDocs);
      window.removeEventListener(DAY_LOG_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
      document.removeEventListener("visibilitychange", onDocs);
    };
  }, []);
  return useMemo(() => ({ today, docsVersion }), [today, docsVersion]);
}
