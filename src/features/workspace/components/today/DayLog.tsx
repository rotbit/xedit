"use client";

/**
 * 「做了」一栏：某一天的事件流（本地日志），按时间升序。
 * 只读展示，不做跳转：这里是回顾，不是入口；要打开文章去侧栏或左栏。
 */
import { UNTITLED_DOC } from "@/lib/docDefaults";
import type { DayEvent } from "@/lib/todos/events";
import { ColumnHead, EmptyLine } from "./parts";

const pad = (n: number) => String(n).padStart(2, "0");

function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 一次写作的持续时长；不足 1 分钟不显示——零点几分钟的「写」只是一次保存，报时长没意义 */
function formatDuration(ms: number): string | null {
  const m = Math.round(ms / 60_000);
  if (m < 1) return null;
  if (m < 60) return `${m} 分钟`;
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? `${h} 小时 ${rest} 分钟` : `${h} 小时`;
}

const titleOf = (e: DayEvent) => `《${e.title || UNTITLED_DOC}》`;

/** 文章名加粗，其余动词用正文字重：一眼扫过去先看到写的是哪篇 */
function DocName({ e }: { e: DayEvent }) {
  return <span className="font-medium">{titleOf(e)}</span>;
}

function EventBody({ e }: { e: DayEvent }) {
  if (e.kind === "write") {
    const chars = e.chars ?? 0;
    const duration = formatDuration((e.end ?? e.ts) - e.ts);
    return (
      <>
        <div className="text-[14.5px] leading-[1.45]">
          写了 <DocName e={e} />
        </div>
        {chars !== 0 || duration ? (
          <div className="mt-px text-[12.5px] text-[var(--ink-faint)]">
            {chars !== 0 ? (
              <>
                {/* 删字也是在写：负数照实显示，不隐藏 */}
                <b className="font-medium tabular-nums text-[var(--ink-soft)]">
                  {chars > 0 ? "+" : "-"}
                  {Math.abs(chars).toLocaleString()}
                </b>{" "}
                字
              </>
            ) : null}
            {chars !== 0 && duration ? " · " : null}
            {duration}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <div className="text-[14.5px] leading-[1.45]">
      {e.kind === "create" ? (
        <>
          新建 <DocName e={e} />
        </>
      ) : e.kind === "version" ? (
        <>
          <DocName e={e} /> 存档
        </>
      ) : (
        `完成「${e.text ?? ""}」`
      )}
    </div>
  );
}

export function DayLog({ events, isToday }: { events: DayEvent[]; isToday: boolean }) {
  // 日志本就按写入顺序追加，这里再排一次兜住手改存储或跨设备导入的乱序
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  return (
    <div className="min-w-0">
      <ColumnHead title="做了" />
      {sorted.length === 0 ? (
        <EmptyLine>{isToday ? "还没有记录，开始写点什么吧" : "那天没有记录"}</EmptyLine>
      ) : (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {sorted.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="flex gap-3.5 px-0.5 py-2">
              <span className="w-10 shrink-0 pt-0.5 font-mono text-[12.5px] text-[var(--ink-faint)]">
                {clock(e.ts)}
              </span>
              <div className="min-w-0 flex-1">
                <EventBody e={e} />
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="mt-3.5 text-[12.5px] text-[var(--ink-faint)]">
        写字、存版本、新建文章由编辑器自动记录。
      </div>
    </div>
  );
}
