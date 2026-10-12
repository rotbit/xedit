"use client";

/**
 * 「历史已完成」：从今天页进入的月历回顾页。左栏月历（每格列出当天做完的事和还没做完的待办），
 * 右栏是选中那一天的明细，或按本周 / 本月 / 本年看。
 * 数据同今天页；日志变化刷新明细，文库变化 / 跨天才重算待办，切换选中项复用结果。
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
  // 翻月不改变选中：右栏一直是用户点过的那天 / 那个范围
  const [sel, setSel] = useState<HistorySel>(() => ({ kind: "day", key: today }));
  // 没做完的待办按到期日（时间段覆盖的每一天）归组，左右两栏共用
  const { allDocs } = ws.library;
  const pending = useMemo(
    () => pendingByDay(collectTodos(allDocs ?? [], signals.today)),
    [allDocs, signals]
  );

  return (
    <div className="min-h-0 flex-1 overflow-y-auto">
      <div className="mx-auto grid w-full max-w-[880px] gap-10 px-6 pb-16 pt-9 sm:px-10 md:grid-cols-[minmax(0,1fr)_300px] md:gap-12">
        <MonthCalendar month={month} today={today} sel={sel} pending={pending} onMonth={setMonth} onSelect={setSel} />
        {/* md 及以上右栏在滚动容器里吸顶、自己滚：本年几百条时页面高度仍由左栏月历决定。
            self-start：网格项默认拉伸到行高，sticky 就没有活动余地。
            top-9 = 页面 pt-9，吸住后与未滚动时位置相同，不跳。
            max-h = 视口 − 顶栏 h-12(48) − pt-9(36) − pb-16(64)：右栏最高时连同上下留白正好一屏，外层不会多出滚动 */}
        <div className="min-w-0 md:sticky md:top-9 md:max-h-[calc(100dvh-148px)] md:self-start md:overflow-y-auto md:pr-1">
          <HistoryDetail ws={ws} today={today} sel={sel} pending={pending} onSelect={setSel} />
        </div>
      </div>
    </div>
  );
}
