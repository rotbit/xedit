"use client";

/**
 * 今天页右栏「接下来」：明天起六天，一天一行；再往后的和没定日期的折在底部两个入口里。
 * 这里只排期不打勾——要做的那天它自然会到左栏；每天末尾可以直接往那天记一件事。
 */
import { useRef, useState } from "react";
import { X } from "lucide-react";
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import { dayOfMonth, formatDue, formatWeekday, shiftDay } from "@/lib/todos/dates";
import { MoveMenu } from "./MoveMenu";
import { itemLabel, rowId, type RowActions } from "./parts";

const DAYS_AHEAD = 6;

const miniBtnCls =
  "flex h-5 w-5 shrink-0 cursor-pointer items-center justify-center rounded text-[12px] leading-none text-[var(--ink-faint)] hover:bg-[var(--panel)] hover:text-[var(--ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)] group-hover:opacity-100";

function UpcomingItem({
  item,
  today,
  actions,
  showDate,
  t,
}: {
  item: TodoItem;
  today: string;
  actions: RowActions;
  /** 「之后」列表里每条右侧带日期；按天排的六行里日期已经在左边了 */
  showDate: boolean;
  t: TFn;
}) {
  const locale = useLocale();
  const id = rowId(item);
  const menuOpen = actions.menuId === id;
  const label = itemLabel(item, t);
  const textCls = "min-w-0 flex-1 truncate text-left";
  return (
    <div
      className={`group relative -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-[3px] text-[13px] text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] ${
        menuOpen ? "bg-[var(--accent-wash)]" : ""
      }`}
    >
      <span
        className={`h-[5px] w-[5px] shrink-0 rounded-full ${
          item.source === "publish" ? "bg-[var(--ink-soft)]" : "bg-[var(--hairline-strong)]"
        }`}
      />
      {item.source === "notes" ? (
        <span className={textCls} title={label}>
          {label}
        </span>
      ) : (
        <button
          type="button"
          className={`${textCls} cursor-pointer hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)]`}
          title={label}
          onClick={() => actions.onOpenDoc(item.docId)}
        >
          {label}
        </button>
      )}
      {showDate && item.due ? (
        <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-faint)]">
          {formatDue(item.due, today, locale)}
        </span>
      ) : null}
      <button
        type="button"
        data-menu-trigger
        aria-label={t("移到别的日期")}
        title={t("移到别的日期")}
        aria-expanded={menuOpen}
        className={`${miniBtnCls} ${menuOpen ? "opacity-100" : "opacity-0"}`}
        onClick={() => actions.setMenuId(menuOpen ? null : id)}
      >
        ⋯
      </button>
      {item.source === "publish" ? null : (
        <button
          type="button"
          aria-label={t("删除")}
          title={t("删除")}
          className={`${miniBtnCls} opacity-0 hover:text-[var(--seal)]`}
          onClick={() => actions.onRemove(item)}
        >
          <X size={12} />
        </button>
      )}
      {menuOpen ? (
        <MoveMenu
          item={item}
          today={today}
          onMove={(due) => actions.onMove(item, due)}
          onRemove={() => actions.onRemove(item)}
          onClose={() => actions.setMenuId(null)}
        />
      ) : null}
    </div>
  );
}

/** 每天末尾的「＋ 记到明天」：悬停那一天才露出来，回车提交后清空、焦点留着方便连记 */
function DayAdd({
  label,
  disabled,
  onSubmit,
}: {
  label: string;
  disabled: boolean;
  onSubmit: (text: string) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  return (
    <form
      className="opacity-0 focus-within:opacity-100 group-hover/day:opacity-100"
      onSubmit={async (e) => {
        e.preventDefault();
        if (pending || !text.trim()) return;
        setPending(true);
        const ok = await onSubmit(text.trim());
        setPending(false);
        if (ok) setText("");
        inputRef.current?.focus();
      }}
    >
      <input
        ref={inputRef}
        className="w-full bg-transparent py-[3px] text-[12px] text-[var(--ink-soft)] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
        placeholder={label}
        aria-label={label}
        value={text}
        disabled={disabled || pending}
        onChange={(e) => setText(e.target.value)}
      />
    </form>
  );
}

/** 底部的折叠入口：之后 / 没定日期 */
function Fold({
  title,
  items,
  today,
  actions,
  showDate,
  t,
}: {
  title: string;
  items: TodoItem[];
  today: string;
  actions: RowActions;
  showDate: boolean;
  t: TFn;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="border-b border-[var(--hairline-soft)]">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center justify-between py-2.5 text-[12.5px] text-[var(--ink-soft)] hover:text-[var(--ink)]"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{title}</span>
        <span className="tabular-nums text-[var(--ink-faint)]">
          {t("{n} 件", { n: items.length, abs: items.length })}{" "}
          <span className={`inline-block transition-transform ${open ? "rotate-90" : ""}`}>›</span>
        </span>
      </button>
      {open && items.length > 0 ? (
        <div className="pb-2">
          {items.map((item) => (
            <UpcomingItem key={rowId(item)} item={item} today={today} actions={actions} showDate={showDate} t={t} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UpcomingColumn({
  today,
  later,
  undated,
  ready,
  actions,
  onAddOnDay,
}: {
  today: string;
  /** later 桶：已按日期升序 */
  later: TodoItem[];
  undated: TodoItem[];
  ready: boolean;
  actions: RowActions;
  onAddOnDay: (text: string, day: string) => Promise<boolean>;
}) {
  const t = useT();
  const locale = useLocale();
  const last = shiftDay(today, DAYS_AHEAD);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => shiftDay(today, i + 1));
  const byDay = new Map<string, TodoItem[]>(days.map((d) => [d, []]));
  const beyond: TodoItem[] = [];
  for (const item of later) {
    if (!item.due) continue; // later 里没日期的是文章正文里没排期的，今天页不展示
    if (item.due > last) beyond.push(item);
    else byDay.get(item.due)?.push(item);
  }
  const weekCount = days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0);

  return (
    <aside className="min-w-0">
      <div className="flex items-baseline justify-between border-b border-[var(--hairline)] pb-2">
        <h2 className="text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">{t("接下来")}</h2>
        <span className="text-[11.5px] tabular-nums text-[var(--ink-faint)]">
          {t("{n} 件", { n: weekCount, abs: weekCount })}
        </span>
      </div>
      {days.map((day, i) => {
        const items = byDay.get(day) ?? [];
        const empty = items.length === 0;
        const name = i === 0 ? t("明天") : formatWeekday(day, locale);
        return (
          <div
            key={day}
            className="group/day grid grid-cols-[44px_minmax(0,1fr)] gap-2.5 border-b border-[var(--hairline-soft)] py-2.5"
          >
            <div className={empty ? "text-[var(--hairline-strong)]" : "text-[var(--ink)]"}>
              <div className="[font-family:var(--serif)] text-[18px] leading-none">{dayOfMonth(day)}</div>
              <div
                className={`mt-1.5 whitespace-nowrap text-[10.5px] ${locale === "en" ? "" : "tracking-[.14em]"} ${
                  empty ? "" : "text-[var(--ink-faint)]"
                }`}
              >
                {name}
              </div>
            </div>
            <div className="min-w-0">
              {empty ? <div className="py-[3px] text-[13px] text-[var(--hairline-strong)]">—</div> : null}
              {items.map((item) => (
                <UpcomingItem key={rowId(item)} item={item} today={today} actions={actions} showDate={false} t={t} />
              ))}
              <DayAdd
                label={t("＋ 记到{day}", { day: name })}
                disabled={!ready}
                onSubmit={(text) => onAddOnDay(text, day)}
              />
            </div>
          </div>
        );
      })}
      <Fold title={t("之后")} items={beyond} today={today} actions={actions} showDate t={t} />
      <Fold title={t("没定日期")} items={undated} today={today} actions={actions} showDate={false} t={t} />
    </aside>
  );
}
