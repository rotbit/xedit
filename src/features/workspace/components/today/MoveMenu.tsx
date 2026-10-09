"use client";

/**
 * 变更日期菜单：表头注明当前日期，下面是今天 / 明天 / 下周一三个常用落点，其它日期走原生日期框，
 * 「持续到…」设时间段的结束日，再加删除。左右两栏共用，绝对定位在触发行的右下方（触发行要带 relative）。
 * 改开始日时结束日照留（早于新开始日就丢掉，变回单日）。
 * 发布排期不给删除也不给时间段：没有正文行可删，发布是某一天的事。
 */
import { useEffect, useRef, type KeyboardEvent } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import type { DueRange } from "@/lib/todos/parse";
import { formatDue, formatMonthDay, formatWeekday, nextMonday, shiftDay } from "@/lib/todos/dates";

const itemCls =
  "flex w-full cursor-pointer items-center justify-between gap-4 rounded-[5px] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--accent-wash)] disabled:cursor-default disabled:hover:bg-transparent";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dateInputCls = "min-w-0 cursor-pointer bg-transparent text-[12px] text-[var(--ink-soft)] outline-none";

/**
 * 原生日期框的提交时机：失焦或回车才算数。逐段敲数字时每敲一位 onChange 都会给出一个合法日期
 * （年份敲到一半的 0002-10-09 也合法），那时就提交会把半成品写进正文。不受控：受控的日期框
 * 在用户逐段敲数字时会被 React 拨回原值，所以只把最新值记在 ref 里。
 * 从原生日历弹层点选后焦点还留在框里，用户接着点菜单外面关菜单时 blur 不一定赶在卸载前，
 * 所以卸载时也 flush 一次，点选的值不会丢。
 */
function useDateDraft(initial: string, commit: (value: string) => void) {
  const draft = useRef(initial);
  const done = useRef(false);
  const flush = () => {
    // 回车提交后菜单关闭、输入框卸载时还会再失焦一次，只认第一次
    if (done.current || draft.current === initial) return;
    done.current = true;
    commit(draft.current);
  };
  const flushRef = useRef(flush);
  useEffect(() => {
    flushRef.current = flush;
  });
  useEffect(() => () => flushRef.current(), []);
  return {
    defaultValue: initial,
    onChange: (e: { target: { value: string } }) => {
      draft.current = e.target.value;
    },
    onBlur: flush,
    onKeyDown: (e: KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Enter") {
        e.preventDefault();
        flush();
      }
    },
  };
}

export function MoveMenu({
  item,
  today,
  onMove,
  onRemove,
  onClose,
}: {
  item: TodoItem;
  today: string;
  onMove: (range: DueRange) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // 不随窗口失焦关闭：原生日期框弹出的选择器在有些浏览器里会让窗口失焦
  useDismissMenu(ref, onClose, true, false);
  useEscape(onClose);
  const t = useT();
  const locale = useLocale();
  const isPublish = item.source === "publish";

  const pick = (range: DueRange) => {
    onClose();
    if (range.due !== item.due || range.end !== item.end) onMove(range);
  };
  /** 改开始日：结束日照留，早于新开始日（或就是同一天）就丢掉，变回单日 */
  const moveStart = (due: string) => pick({ due, end: item.end && item.end > due ? item.end : null });

  const start = item.due ?? today;
  const startDraft = useDateDraft(item.due ?? "", (v) => {
    if (DATE_RE.test(v) && v !== item.due) moveStart(v);
  });
  const endDraft = useDateDraft(item.end ?? "", (v) => {
    // 清空 = 不再持续，变回单日；早于开始日的不认（min 拦不住手敲）
    if (!v) pick({ due: start, end: null });
    else if (DATE_RE.test(v) && v >= start) pick({ due: start, end: v > start ? v : null });
  });

  const presets: { label: string; due: string }[] = [
    { label: t("今天"), due: today },
    { label: t("明天"), due: shiftDay(today, 1) },
    { label: t("下周一"), due: nextMonday(today) },
  ];
  const current = !item.due
    ? t("没定日期")
    : item.end
      ? `${formatMonthDay(item.due, today, locale)} – ${formatMonthDay(item.end, today, locale)}`
      : `${formatDue(item.due, today, locale)} ${formatWeekday(item.due, locale)}`;

  return (
    <div
      ref={ref}
      role="menu"
      className="absolute right-0 top-full z-10 mt-1 min-w-[200px] rounded-[8px] border border-[var(--hairline)] bg-[var(--panel)] p-[5px] text-[var(--ink)] shadow-[0_10px_36px_rgba(0,0,0,.14)]"
    >
      <div className="flex items-baseline justify-between gap-4 px-2 pb-1.5 pt-1 text-[11.5px] tracking-[.06em] text-[var(--ink-faint)]">
        <span className="text-[var(--ink-soft)]">{t("变更日期")}</span>
        <span className="tabular-nums">{current}</span>
      </div>
      {presets.map((p) => {
        const same = p.due === item.due;
        return (
          <button
            key={p.label}
            type="button"
            role="menuitem"
            className={`${itemCls} ${same ? "text-[var(--ink-faint)]" : ""}`}
            disabled={same}
            onClick={() => moveStart(p.due)}
          >
            <span>{p.label}</span>
            <span className="text-[12px] tabular-nums text-[var(--ink-faint)]">
              {formatMonthDay(p.due, today, locale)}
            </span>
          </button>
        );
      })}
      <label className="flex w-full items-center justify-between gap-4 px-2 py-1.5 text-[13px]">
        <span>{t("其它日期")}</span>
        <input type="date" className={dateInputCls} {...startDraft} />
      </label>
      {isPublish ? null : (
        <>
          <label className="flex w-full items-center justify-between gap-4 px-2 py-1.5 text-[13px]">
            <span>{t("持续到…")}</span>
            <input type="date" className={dateInputCls} min={start} {...endDraft} />
          </label>
          <div className="mx-1 my-1 border-t border-[var(--hairline-soft)]" />
          <button
            type="button"
            role="menuitem"
            className={`${itemCls} text-[var(--seal)]`}
            onClick={() => {
              onClose();
              onRemove();
            }}
          >
            {t("删除这条")}
          </button>
        </>
      )}
    </div>
  );
}
