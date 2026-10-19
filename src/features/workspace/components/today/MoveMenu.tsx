"use client";

/**
 * Change-date menu: the header shows the current date, then three common targets (today / tomorrow / next Monday), a native date input for other dates,
 * "Until…" to set the end of a range, plus delete. Shared by both columns, absolutely positioned at the bottom right of the trigger row (which needs `relative`).
 * Changing the start date keeps the end date (dropped if earlier than the new start, reverting to a single day).
 * Publish schedules get neither delete nor ranges: there's no body line to delete, and publishing happens on one day.
 * A daily task's due is a computed "today", not a user-chosen date: any target (including today) counts as a change
 * and turns it back into a regular single-day todo; "Stop repeating" is a separate item that lands on today.
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
 * When the native date input commits: only on blur or Enter. While typing segment by segment, every keystroke's onChange yields a valid date
 * (a half-typed year like 0002-10-09 is valid too), so committing then would write a half-finished value into the body. Uncontrolled: a controlled
 * date input gets reset by React while the user types segments, so only the latest value is kept in a ref.
 * After picking from the native calendar popup focus stays in the input, and when the user then clicks outside to close the menu, blur may not fire before unmount,
 * so we also flush on unmount and the picked value isn't lost.
 */
function useDateDraft(initial: string, commit: (value: string) => void) {
  const draft = useRef(initial);
  const done = useRef(false);
  const flush = () => {
    // After an Enter commit the menu closes and the input blurs again on unmount; only honor the first
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
  onRepeat,
  onRemove,
  onClose,
}: {
  item: TodoItem;
  today: string;
  onMove: (range: DueRange) => void;
  onRepeat: (on: boolean) => void;
  onRemove: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  // Don't close on window blur: in some browsers the native date picker popup blurs the window
  useDismissMenu(ref, onClose, true, false);
  useEscape(onClose);
  const t = useT();
  const locale = useLocale();
  const isPublish = item.source === "publish";
  const repeat = item.repeat !== null;
  /** The menu's "current date": daily tasks have no fixed date */
  const due = repeat ? null : item.due;

  const pick = (range: DueRange) => {
    onClose();
    if (range.due !== due || range.end !== item.end) onMove(range);
  };
  /** Change start: keep the end date, but drop it if earlier than (or equal to) the new start, reverting to a single day */
  const moveStart = (due: string) => pick({ due, end: item.end && item.end > due ? item.end : null });

  const start = item.due ?? today;
  const startDraft = useDateDraft(due ?? "", (v) => {
    if (DATE_RE.test(v) && v !== due) moveStart(v);
  });
  const endDraft = useDateDraft(item.end ?? "", (v) => {
    // Cleared = no longer a range, back to a single day; ignore ends before the start (min doesn't stop typed input)
    if (!v) pick({ due: start, end: null });
    else if (DATE_RE.test(v) && v >= start) pick({ due: start, end: v > start ? v : null });
  });

  const presets: { label: string; due: string }[] = [
    { label: t("今天"), due: today },
    { label: t("明天"), due: shiftDay(today, 1) },
    { label: t("下周一"), due: nextMonday(today) },
  ];
  const current = repeat
    ? t("每天")
    : !item.due
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
        const same = p.due === due;
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
          <button
            type="button"
            role="menuitem"
            className={itemCls}
            onClick={() => {
              onClose();
              onRepeat(!repeat);
            }}
          >
            {repeat ? t("不再重复") : t("每天重复")}
          </button>
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
