"use client";

/**
 * 「做了」一栏：某一天的事件流（本地日志），按时间升序。
 * 不做跳转：这里是回顾，不是入口；要打开文章去侧栏或左栏。
 * 可以删条目：误记的、不想留的流水删掉就是，日志本来就只在本机。
 */
import { rich } from "@/i18n/rich";
import type { TFn } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import type { DayEvent } from "@/lib/todos/events";
import { ColumnHead, EmptyLine, RemoveButton } from "./parts";

const pad = (n: number) => String(n).padStart(2, "0");

function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** 一次写作的持续时长；不足 1 分钟不显示——零点几分钟的「写」只是一次保存，报时长没意义 */
function formatDuration(ms: number, t: TFn): string | null {
  const m = Math.round(ms / 60_000);
  if (m < 1) return null;
  if (m < 60) return t("{m} 分钟", { m });
  const h = Math.floor(m / 60);
  const rest = m % 60;
  return rest ? t("{h} 小时 {m} 分钟", { h, m: rest }) : t("{h} 小时", { h });
}

/** 文章名加粗，其余动词用正文字重：一眼扫过去先看到写的是哪篇。书名号在英文里换成引号，交给字典 */
function DocName({ e, t }: { e: DayEvent; t: TFn }) {
  return <span className="font-medium">{t("《{title}》", { title: e.title || t(UNTITLED_DOC) })}</span>;
}

/**
 * 整句交给 t()，文章名、字数这些节点用 {doc} / {n} 占位再由 rich() 插回去：
 * 英文语序和中文不同（「《X》存档」→ "Saved a version of X"），拆成碎片翻不对。
 */
function EventBody({ e }: { e: DayEvent }) {
  const t = useT();
  const doc = <DocName e={e} t={t} />;
  if (e.kind === "write") {
    const chars = e.chars ?? 0;
    const duration = formatDuration((e.end ?? e.ts) - e.ts, t);
    return (
      <>
        <div className="text-[14.5px] leading-[1.45]">
          {rich(t("写了 {doc}"), { doc })}
        </div>
        {chars !== 0 || duration ? (
          <div className="mt-px text-[12.5px] text-[var(--ink-faint)]">
            {/* 删字也是在写：负数照实显示，不隐藏。英文的单复数按绝对值挑（字典里的 {abs, char, chars}） */}
            {chars !== 0
              ? rich(t("{n} 字", { abs: Math.abs(chars) }), {
                  n: (
                    <b className="font-medium tabular-nums text-[var(--ink-soft)]">
                      {chars > 0 ? "+" : "-"}
                      {Math.abs(chars).toLocaleString()}
                    </b>
                  ),
                })
              : null}
            {chars !== 0 && duration ? " · " : null}
            {duration}
          </div>
        ) : null}
      </>
    );
  }
  return (
    <div className="text-[14.5px] leading-[1.45]">
      {e.kind === "create"
        ? rich(t("新建 {doc}"), { doc })
        : e.kind === "version"
          ? rich(t("{doc} 存档"), { doc })
          : t("完成「{text}」", { text: e.text ?? "" })}
    </div>
  );
}

export function DayLog({
  events,
  isToday,
  onRemove,
}: {
  events: DayEvent[];
  isToday: boolean;
  onRemove: (e: DayEvent) => void;
}) {
  // 日志本就按写入顺序追加，这里再排一次兜住手改存储或跨设备导入的乱序
  const sorted = [...events].sort((a, b) => a.ts - b.ts);
  const t = useT();
  return (
    <div className="min-w-0">
      <ColumnHead title={t("做了")} />
      {sorted.length === 0 ? (
        <EmptyLine>{isToday ? t("还没有记录，开始写点什么吧") : t("那天没有记录")}</EmptyLine>
      ) : (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {sorted.map((e, i) => (
            <div key={`${e.ts}-${i}`} className="group flex gap-3.5 px-0.5 py-2">
              <span className="w-10 shrink-0 pt-0.5 font-mono text-[12.5px] text-[var(--ink-faint)]">
                {clock(e.ts)}
              </span>
              <div className="min-w-0 flex-1">
                <EventBody e={e} />
              </div>
              <RemoveButton label={t("删除这条记录")} onClick={() => onRemove(e)} />
            </div>
          ))}
        </div>
      )}
      <div className="mt-3.5 text-[12.5px] text-[var(--ink-faint)]">
        {t("写字、存版本、新建文章由编辑器自动记录。")}
      </div>
    </div>
  );
}
