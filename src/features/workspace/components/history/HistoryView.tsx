"use client";

/**
 * 「历史已完成」 (Completed history): a month-calendar review page entered from Today. Left column is the calendar (each cell lists that day's completed items and unfinished todos),
 * right column is the selected day's details, or a view by this week / month / year.
 * Same data as Today; log changes refresh the details, library changes / day rollover recompute todos, and switching selection reuses the results.
 */
import { useMemo, useState } from "react";
import { collectTodos } from "@/lib/todos/collect";
import { pendingByDay, type HistoryRange } from "@/lib/todos/history";
import type { Workspace } from "../../hooks/useWorkspace";
import { useTodaySignals } from "../today/useTodaySignals";
import { HistoryDetail } from "./HistoryDetail";
import { MonthCalendar } from "./MonthCalendar";

export type HistorySel = { kind: "day"; key: string } | { kind: "range"; range: HistoryRange };

export function HistoryView({ ws }: { ws: Workspace }) {
  const signals = useTodaySignals();
  const { today } = signals;
  const [month, setMonth] = useState(() => today.slice(0, 7));
  // Changing months doesn't change the selection: the right column always shows the day / range the user clicked
  const [sel, setSel] = useState<HistorySel>(() => ({ kind: "day", key: today }));
  // Unfinished todos are grouped by due date (every day covered by their time span), shared by both columns
  const { allDocs } = ws.library;
  const pending = useMemo(
    () => pendingByDay(collectTodos(allDocs ?? [], signals.today)),
    [allDocs, signals]
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[880px] gap-10 px-6 pb-16 pt-9 sm:px-10 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12">
        <MonthCalendar month={month} today={today} sel={sel} pending={pending} onMonth={setMonth} onSelect={setSel} />
        {/* At md and up the right column sticks within the scroll container and scrolls itself: with hundreds of items for the year, page height is still set by the left calendar.
            self-start: grid items stretch to row height by default, which leaves sticky no room to move.
            top-9 = the page's pt-9, so once stuck it's in the same spot as unscrolled, no jump.
            max-h = viewport − top bar h-12(48) − pt-9(36) − pb-16(64): at its tallest the right column plus margins is exactly one screen, so the outer container doesn't get an extra scroll */}
        <div className="min-w-0 md:sticky md:top-9 md:max-h-[calc(100dvh-148px)] md:self-start md:overflow-y-auto md:pr-1">
          <HistoryDetail ws={ws} today={today} sel={sel} pending={pending} onSelect={setSel} />
        </div>
      </div>
    </div>
  );
}
