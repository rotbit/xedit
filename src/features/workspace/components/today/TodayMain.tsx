"use client";

/**
 * Today page left column: date heading + quick add + overdue and today's todos.
 * Anything after tomorrow is in the right column's "Up next"; this only holds what's due today (undated list items count as today).
 * Below the list is "Done this week": things checked today (from the daily log, still here even after a refresh drops them from the list) plus earlier days this week by day;
 * the section ends with a "Completed history" row leading to the history page. "Recently opened" is in the right column's UpcomingColumn, not here.
 */
import { CalendarDays, ChevronRight, FileText, Repeat } from "lucide-react";
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import {
  daysBetween,
  formatDue,
  formatMonthDay,
  formatWeekday,
  shiftDay,
} from "@/lib/todos/dates";
import { removeDayEvent, type DayEvent } from "@/lib/todos/events";
import type { DocMeta } from "../../types";
import { LinkMenu } from "./LinkMenu";
import { MoveMenu } from "./MoveMenu";
import {
  EmptyGuide,
  EmptyLine,
  eventLabel,
  itemLabel,
  linkedDoc,
  RemoveButton,
  rowId,
  secondaryOf,
  TodoBox,
  type RowActions,
} from "./parts";
import type { AddTarget } from "./AddTarget";
import { doneCountAll } from "./doneToday";
import { QuickAdd } from "./QuickAdd";
import { TodayHeader } from "./TodayHeader";
import { dragRowCls, useTodoDrag } from "./useTodoDrag";

/** Small buttons revealed on row hover (link doc / change date): marked as menu triggers and toggled by the button itself */
function MenuTrigger({ open, onClick, children }: { open: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      data-menu-trigger
      aria-expanded={open}
      className={`mt-[2px] shrink-0 cursor-pointer rounded px-1.5 py-px text-[11.5px] text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)] group-hover:opacity-100 ${
        open ? "opacity-100" : "opacity-0"
      }`}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/** Row-end status pills (daily / overdue / range): same shape, color carries the meaning */
const pillCls = "ml-1 mt-[2px] shrink-0 rounded-full px-[7px] text-[11px] leading-[18px] tabular-nums";

/** Neutral count pill for section headers */
const countPillCls =
  "rounded-full bg-[var(--accent-wash)] px-[7px] text-[11px] leading-[18px] tracking-normal tabular-nums text-[var(--ink-soft)]";

function TodoRow({
  item,
  done,
  today,
  docs,
  actions,
  onToggle,
  t,
}: {
  item: TodoItem;
  done: boolean;
  today: string;
  docs: DocMeta[];
  actions: RowActions;
  onToggle: (() => void) | undefined;
  t: TFn;
}) {
  const locale = useLocale();
  const id = rowId(item);
  const menuOpen = actions.menuId === id;
  const linkId = `${id}|link`;
  const linkOpen = actions.menuId === linkId;
  const repeat = item.repeat !== null;
  // A range is only overdue once past its end date; the overdue label shows the end date too. A daily task's due is computed as today, so it's never overdue or a range
  const last = item.end ?? item.due;
  const late = !repeat && !done && last !== null && last < today;
  // Ongoing range: show start–end and which day of it today is (overdue ones still show the overdue label)
  const span =
    !repeat && !done && !late && item.due && item.end
      ? {
          range: `${formatMonthDay(item.due, today, locale)} – ${formatMonthDay(item.end, today, locale)}`,
          n: daysBetween(item.due, today) + 1,
        }
      : null;
  const sub = secondaryOf(item, t, actions.docTitleOf);
  const linked = linkedDoc(item, actions.docTitleOf);
  const label = itemLabel(item, t);
  const textCls = `text-left text-[14.5px] leading-[1.45] ${
    done ? "text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]" : ""
  }`;
  // Where clicking the text goes: body todos go to their doc; list items' doc is invisible to the user, so they're clickable only when linked, and go to the linked doc
  const openId = item.source === "notes" ? (linked?.id ?? null) : item.docId;
  const canLink = !done && item.source === "notes";
  // Publish schedules aren't a body line, so there's nothing to delete
  const canRemove = !done && item.source !== "publish";
  // Done items can't be dragged: they're no longer scheduled on any day
  const drag = useTodoDrag();
  const indicator = done ? null : drag.rowIndicator(item);
  return (
    <div
      {...(done ? {} : { ...drag.dragProps(item), ...drag.rowDropProps(item) })}
      className={`group relative flex items-start gap-2.5 px-3.5 py-2.5 last:rounded-b-[9px] hover:bg-[var(--sidebar)] ${done ? "" : dragRowCls(drag, item)}`}
    >
      {/* Reorder insertion line: drawn on the row edge it will land on, straddling the gap so before-this and after-previous look the same */}
      {indicator ? (
        <div
          aria-hidden
          className={`pointer-events-none absolute left-0 right-0 h-[2px] rounded-full bg-[var(--today)] ${
            indicator === "before" ? "top-[-1px]" : "bottom-[-1px]"
          }`}
        />
      ) : null}
      <TodoBox done={done} onClick={onToggle} label={done ? t("取消完成") : t("标记完成")} />
      <div className="min-w-0 flex-1">
        {/* Click the text to see the source: todos often need the doc for the details */}
        {openId ? (
          <button
            type="button"
            className={`cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)] ${textCls}`}
            onClick={() => actions.onOpenDoc(openId)}
          >
            {label}
          </button>
        ) : (
          <span className={textCls}>{label}</span>
        )}
        {/* A linked doc is a destination, so it gets the teal chip; other sources are just provenance and stay plain faint text */}
        {sub && item.source === "notes" && linked ? (
          <div className="flex min-w-0">
            <span className="mt-[3px] inline-flex max-w-full items-center gap-1 rounded-[4px] bg-[var(--today-tint)] px-1.5 text-[12px] text-[var(--today)]">
              <FileText size={12} className="shrink-0" aria-hidden />
              <span className="min-w-0 truncate">{sub}</span>
            </span>
          </div>
        ) : sub ? (
          <div className="mt-px truncate text-[12.5px] text-[var(--ink-faint)]">{sub}</div>
        ) : null}
      </div>
      {/* Hover actions first, status labels after: actions are transparent but take space, and labels at the far right line up across rows instead of being pushed mid-row */}
      {canLink ? (
        <MenuTrigger open={linkOpen} onClick={() => actions.setMenuId(linkOpen ? null : linkId)}>
          {t("关联文章")} ▾
        </MenuTrigger>
      ) : null}
      {done ? null : (
        <MenuTrigger open={menuOpen} onClick={() => actions.setMenuId(menuOpen ? null : id)}>
          {t("变更日期")} ▾
        </MenuTrigger>
      )}
      {canRemove ? <RemoveButton label={t("删除这条待办")} onClick={() => actions.onRemove(item)} /> : null}
      {repeat ? (
        // Daily is a property of the task, not a date, so its pill stays neutral; teal is kept for real schedules
        <span className={`${pillCls} flex items-center gap-1 bg-[var(--accent-wash)] text-[var(--ink-soft)]`}>
          <Repeat size={11} aria-hidden />
          {t("每天")}
        </span>
      ) : late && last ? (
        <span className={`${pillCls} bg-[var(--seal-wash)] text-[var(--seal)]`}>
          {t("{date} 逾期", { date: formatDue(last, today, locale) })}
        </span>
      ) : span ? (
        <span className={`${pillCls} bg-[var(--today-wash)] text-[var(--today)]`}>
          {span.range} · {t("第 {n} 天", { n: span.n, abs: span.n })}
        </span>
      ) : null}
      {menuOpen ? (
        <MoveMenu
          item={item}
          today={today}
          onMove={(due) => actions.onMove(item, due)}
          onRepeat={(on) => actions.onRepeat(item, on)}
          onRemove={() => actions.onRemove(item)}
          onClose={() => actions.setMenuId(null)}
        />
      ) : null}
      {linkOpen ? (
        <LinkMenu
          item={item}
          docs={docs}
          categories={actions.categories}
          onLink={(link) => actions.onLink(item, link)}
          onLinkNew={(title, category) => actions.onLinkNew(item, title, category)}
          onClose={() => actions.setMenuId(null)}
        />
      ) : null}
    </div>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");

function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

/** A row in "Done": read-only, no navigation; a mistaken entry can be deleted (only the log record, not the body) */
/** A done row; only with onUndo (today's) can the check be clicked to undo; earlier days are read-only */
function DoneRow({ day, e, t, onUndo }: { day: string; e: DayEvent; t: TFn; onUndo?: () => void }) {
  return (
    <div className="group flex items-start gap-2.5 px-0.5 py-1.5">
      <TodoBox done onClick={onUndo} label={onUndo ? t("取消完成") : undefined} />
      <span className="min-w-0 flex-1 text-[13.5px] leading-[1.45] text-[var(--ink-faint)] line-through decoration-[var(--hairline-strong)]">
        {eventLabel(e.text ?? "", e.title, t)}
      </span>
      <span className="mt-[2px] shrink-0 text-[12px] tabular-nums text-[var(--ink-faint)]">{clock(e.ts)}</span>
      <RemoveButton label={t("删除这条记录")} onClick={() => removeDayEvent(day, e.id)} />
    </div>
  );
}

/**
 * "Done this week": first what was checked today (click the check to mark it undone), then earlier days this week by day (read-only).
 * Show everything, no collapsing: the user wants to see the whole week at a glance. The last row is the "Completed history" entry to the history page.
 */
function DoneSection({
  today,
  done,
  week,
  total,
  t,
  onUndo,
  onOpenHistory,
}: {
  today: string;
  done: DayEvent[];
  week: { day: string; events: DayEvent[] }[];
  /** Everything ever done in the local log (doneCountAll) */
  total: number;
  t: TFn;
  onUndo: (e: DayEvent) => void;
  onOpenHistory: () => void;
}) {
  const locale = useLocale();
  if (done.length === 0 && week.length === 0 && total === 0) return null;
  const count = done.length + week.reduce((sum, g) => sum + g.events.length, 0);
  // "Yesterday" reads better for yesterday; earlier days use 「周三 · 10/7」 — weekday helps recall, date avoids ambiguity
  const dayName = (day: string) =>
    day === shiftDay(today, -1)
      ? t("昨天")
      : `${formatWeekday(day, locale)} · ${formatMonthDay(day, today, locale)}`;
  return (
    <div className="mt-12">
      <div className="flex items-baseline justify-between border-b border-[var(--hairline)] pb-2">
        <h2 className="text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">{t("本周已完成")}</h2>
        <span className={countPillCls}>
          {t("{n} 件", { n: count, abs: count })}
        </span>
      </div>
      {done.length > 0 ? (
        <div className="divide-y divide-[var(--hairline-soft)]">
          {done.map((e) => (
            <DoneRow key={e.id} day={today} e={e} t={t} onUndo={() => onUndo(e)} />
          ))}
        </div>
      ) : null}
      {week.map((g) => (
        <div key={g.day} className="mt-3 pb-1">
          <h3 className="border-b border-[var(--hairline-soft)] pb-1.5 text-[11px] tracking-[.14em] tabular-nums text-[var(--ink-faint)]">
            {dayName(g.day)}
          </h3>
          <div className="divide-y divide-[var(--hairline-soft)]">
            {g.events.map((e) => (
              <DoneRow key={e.id} day={g.day} e={e} t={t} />
            ))}
          </div>
        </div>
      ))}
      <button
        type="button"
        className={`flex w-full cursor-pointer items-center gap-2.5 px-0.5 py-2 text-left text-[13.5px] text-[var(--ink-soft)] hover:text-[var(--ink)] ${
          done.length > 0 || week.length > 0 ? "border-t border-[var(--hairline-soft)]" : ""
        }`}
        onClick={onOpenHistory}
      >
        <span className="flex h-4 w-4 shrink-0 items-center justify-center">
          <CalendarDays size={14} aria-hidden />
        </span>
        <span className="min-w-0 flex-1">{t("历史已完成")}</span>
        <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-faint)]">
          {t("{n} 件", { n: total, abs: total })}
        </span>
        <ChevronRight size={12} className="shrink-0 text-[var(--ink-faint)]" aria-hidden />
      </button>
    </div>
  );
}

export function TodayMain({
  today,
  rows,
  done,
  week,
  isDone,
  docs,
  allEmpty,
  ready,
  actions,
  onToggle,
  onUndo,
  onAdd,
  onOpenHistory,
  onOpenDaily,
}: {
  today: string;
  /** Overdue + today + just checked */
  rows: TodoItem[];
  /** Checked today and no longer in rows (computed by doneToday and passed in) */
  done: DayEvent[];
  /** Done on earlier days this week (from Monday), excluding today, newest day first (computed by doneThisWeek and passed in) */
  week: { day: string; events: DayEvent[] }[];
  isDone: (item: TodoItem) => boolean;
  /** Candidate pool for "Link doc": user-visible docs (excluding the todo-list doc) */
  docs: DocMeta[];
  /** Nothing in the right column either, and nothing done today or this week: the whole page is empty, so the left column shows the illustrated onboarding */
  allEmpty: boolean;
  /** Whether the whole library has loaded: until then the todo-list doc can't be found and a submit would create a new one, so input is locked */
  ready: boolean;
  actions: RowActions;
  onToggle: (item: TodoItem, checked: boolean) => void;
  /** Clicking the check in "Done": mark undone, back to the list */
  onUndo: (e: DayEvent) => void;
  onAdd: (text: string, target: AddTarget) => Promise<boolean>;
  /** "Completed history" entry: go to the history page */
  onOpenHistory: () => void;
  /** Open today's daily note, creating it on first use */
  onOpenDaily: () => void;
}) {
  const t = useT();
  // Progress counts both kinds of "done today": events already dropped from the list, and rows just checked that stay struck through in it
  // (doneToday leaves those out of `done`, so counting only `done` would shrink the total every time something is checked)
  const checked = rows.filter(isDone).length;
  // The list area is the drop target for "today"; it only accepts drags from the right column (starting after today) — overdue / today items are already here
  const drag = useTodoDrag();
  const listDrop = drag.dropProps(today, { accept: (i) => i.due !== null && i.due > today });
  return (
    <div className="min-w-0">
      <TodayHeader
        today={today}
        done={done.length + checked}
        total={done.length + rows.length}
        onOpenDaily={onOpenDaily}
      />
      {/* The list sits on a white card over the paper; no overflow-hidden, since row menus and the add picker hang out below it */}
      <div className="mt-6 rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)] shadow-[0_1px_2px_rgb(0_0_0/0.04),0_6px_18px_rgb(0_0_0/0.04)]">
        <QuickAdd disabled={!ready} docs={docs} categories={actions.categories} onSubmit={onAdd} />
        <div {...listDrop} className={`rounded-b-[9px] ${drag.isOver(today) ? "bg-[var(--today-tint)]" : ""}`}>
          {rows.length === 0 ? (
            allEmpty ? (
              <EmptyGuide text={t("添加一件今天要做的事，或在右侧排到某一天")} />
            ) : (
              <EmptyLine>{t("今天没有安排")}</EmptyLine>
            )
          ) : (
            <div className="divide-y divide-[var(--hairline-soft)]">
              {rows.map((item) => {
                const done = isDone(item);
                // Checking a publish schedule writes published: true; there's no "unpublish"
                const locked = done && item.source === "publish";
                return (
                  <TodoRow
                    key={rowId(item)}
                    item={item}
                    done={done}
                    today={today}
                    docs={docs}
                    actions={actions}
                    onToggle={locked ? undefined : () => onToggle(item, !done)}
                    t={t}
                  />
                );
              })}
            </div>
          )}
        </div>
      </div>
      <DoneSection
        today={today}
        done={done}
        week={week}
        total={doneCountAll()}
        t={t}
        onUndo={onUndo}
        onOpenHistory={onOpenHistory}
      />
    </div>
  );
}
