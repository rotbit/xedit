"use client";

/**
 * 变更日期菜单：表头注明当前日期，下面是今天 / 明天 / 下周一三个常用落点，其它日期走原生日期框，
 * 再加删除。左右两栏共用，绝对定位在触发行的右下方（触发行要带 relative）。
 * 发布排期不给删除：没有正文行可删。
 */
import { useRef } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import { formatDue, formatMonthDay, formatWeekday, nextMonday, shiftDay } from "@/lib/todos/dates";

const itemCls =
  "flex w-full cursor-pointer items-center justify-between gap-4 rounded-[5px] px-2 py-1.5 text-left text-[13px] hover:bg-[var(--accent-wash)] disabled:cursor-default disabled:hover:bg-transparent";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function MoveMenu({
  item,
  today,
  onMove,
  onRemove,
  onClose,
}: {
  item: TodoItem;
  today: string;
  onMove: (due: string | null) => void;
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

  const pick = (due: string) => {
    onClose();
    if (due !== item.due) onMove(due);
  };

  const presets: { label: string; due: string }[] = [
    { label: t("今天"), due: today },
    { label: t("明天"), due: shiftDay(today, 1) },
    { label: t("下周一"), due: nextMonday(today) },
  ];
  const current = item.due ? `${formatDue(item.due, today, locale)} ${formatWeekday(item.due, locale)}` : t("没定日期");

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
            onClick={() => pick(p.due)}
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
        {/* 不受控：受控的日期框在用户逐段敲数字时会被 React 拨回原值 */}
        <input
          type="date"
          className="min-w-0 cursor-pointer bg-transparent text-[12px] text-[var(--ink-soft)] outline-none"
          defaultValue={item.due ?? ""}
          onChange={(e) => {
            if (DATE_RE.test(e.target.value)) pick(e.target.value);
          }}
        />
      </label>
      {isPublish ? null : (
        <>
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
