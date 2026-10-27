"use client";

/**
 * Today page right column "Up next": six days from tomorrow, one row per day (consecutive empty days merge into one row that expands into days on click, with a collapse row at the end); later items fold into "N more" at the bottom, and "Recently opened" is at the very bottom.
 * This only schedules, no checking off — on the day it's due an item naturally moves to the left column. Each day ends with an input to add something to that day,
 * which, like the left-column quick add, can optionally link a doc (shared via AddTarget.tsx): things planned ahead are often work on a particular draft.
 */
import { useCallback, useRef, useState } from "react";
import { ChevronUp, X } from "lucide-react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import type { TFn } from "@/i18n/t";
import { useLocale, useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import { dayOfMonth, formatDue, formatMonthDay, formatWeekday, shiftDay } from "@/lib/todos/dates";
import type { Workspace } from "../../hooks/useWorkspace";
import type { DocMeta } from "../../types";
import { isDefaultTarget, Picker, TargetControl, useAddTarget, type AddTarget } from "./AddTarget";
import { MoveMenu } from "./MoveMenu";
import { RecentDocsSection } from "./RecentDocs";
import { itemLabel, linkedDoc, rowId, type RowActions } from "./parts";
import { dragRowCls, useTodoDrag } from "./useTodoDrag";

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
  /** Each item in the folded list at the bottom shows its date on the right; in the six per-day rows the date is already on the left */
  showDate: boolean;
  t: TFn;
}) {
  const locale = useLocale();
  const id = rowId(item);
  const menuOpen = actions.menuId === id;
  const label = itemLabel(item, t);
  const textCls = "min-w-0 flex-1 truncate text-left";
  // List items' doc is invisible to the user; clickable only when linked, and goes to the linked doc
  const openId = item.source === "notes" ? (linkedDoc(item, actions.docTitleOf)?.id ?? null) : item.docId;
  const drag = useTodoDrag();
  return (
    <div
      {...drag.dragProps(item)}
      className={`group relative -mx-1.5 flex items-center gap-2 rounded-md px-1.5 py-[3px] text-[13px] text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] ${
        menuOpen ? "bg-[var(--accent-wash)]" : ""
      } ${dragRowCls(drag, item)}`}
    >
      {/* Teal dot: everything here is scheduled, the same accent the left column uses for ranges */}
      <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--today)]" />
      {openId ? (
        <button
          type="button"
          className={`${textCls} cursor-pointer hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)]`}
          title={label}
          onClick={() => actions.onOpenDoc(openId)}
        >
          {label}
        </button>
      ) : (
        <span className={textCls} title={label}>
          {label}
        </span>
      )}
      {showDate && item.due ? (
        <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-faint)]">
          {formatDue(item.due, today, locale)}
        </span>
      ) : null}
      {/* Ranges show the end date; in the folded list it follows the start date, reading as 「10/9 → 10/12」 */}
      {item.end ? (
        <span className="shrink-0 text-[11px] tabular-nums text-[var(--ink-faint)]">
          → {formatMonthDay(item.end, today, locale)}
        </span>
      ) : null}
      <button
        type="button"
        data-menu-trigger
        aria-label={t("变更日期")}
        title={t("变更日期")}
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
          onRepeat={(on) => actions.onRepeat(item, on)}
          onRemove={() => actions.onRemove(item)}
          onClose={() => actions.setMenuId(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * The "+ Add to tomorrow" row at the end of each day: revealed on hovering that day; Enter submits and clears, keeping focus for adding more.
 * "Link doc" only shows while this row has focus, so six rows don't all carry it and look noisy; once a doc is picked its tag stays,
 * and so does the whole row — otherwise moving the mouse away would hide the chosen target along with the input.
 */
function DayAdd({
  label,
  disabled,
  docs,
  categories,
  onSubmit,
}: {
  label: string;
  disabled: boolean;
  docs: DocMeta[];
  categories: string[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
}) {
  const [text, setText] = useState("");
  const [pending, setPending] = useState(false);
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { target, targetLabel, picking, setPicking, choosingFolder, pick, detach, reset } = useAddTarget(
    inputRef,
    categories
  );
  const attached = !isDefaultTarget(target);
  // While the folder dialog is open, focus is in the dialog and the mouse isn't on this day; without forcing visible, the input row would vanish
  const shown = attached || picking || choosingFolder;
  // Close the picker on outside click / Esc and return focus to the input.
  // Only attached while picking: after choosing "New", picking drops before the folder dialog opens, so clicks and Esc on the dialog don't reach this row

  const closePicker = useCallback(() => {
    setPicking(false);
    inputRef.current?.focus();
  }, [setPicking]);
  useDismissMenu(rowRef, closePicker, picking);
  useEscape(closePicker, picking);

  return (
    <div ref={rowRef} className="group/add relative">
      <form
        className={`flex items-center gap-2 ${
          shown ? "opacity-100" : "opacity-0 focus-within:opacity-100 group-hover/day:opacity-100"
        }`}
        onSubmit={async (e) => {
          e.preventDefault();
          if (pending || !text.trim()) return;
          // Lock while submitting so repeated Enter doesn't record twice
          setPending(true);
          const ok = await onSubmit(text.trim(), target);
          setPending(false);
          if (ok) {
            setText("");
            reset();
          }
          // On failure keep the text and target for an easy retry
          inputRef.current?.focus();
        }}
      >
        <input
          ref={inputRef}
          className="min-w-0 flex-1 bg-transparent py-[3px] text-[12px] text-[var(--ink-soft)] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
          placeholder={label}
          aria-label={label}
          value={text}
          disabled={disabled || pending}
          onChange={(e) => setText(e.target.value)}
        />
        <TargetControl
          target={target}
          label={targetLabel}
          picking={picking}
          pending={disabled || pending}
          size="sm"
          className={shown ? "" : "hidden group-focus-within/add:flex"}
          onToggle={() => setPicking((v) => !v)}
          onDetach={detach}
        />
      </form>
      {picking ? <Picker docs={docs} onPick={(o) => void pick(o)} /> : null}
    </div>
  );
}

/** Fold entry at the bottom: items after the six days collapse into one "N more ›" row; hidden entirely if there are none */
function Fold({
  items,
  today,
  actions,
  t,
}: {
  items: TodoItem[];
  today: string;
  actions: RowActions;
  t: TFn;
}) {
  const [open, setOpen] = useState(false);
  if (items.length === 0) return null;
  const n = items.length;
  return (
    <div className="border-b border-[var(--hairline-soft)]">
      <button
        type="button"
        aria-expanded={open}
        className="flex w-full cursor-pointer items-center gap-1 py-2.5 text-left text-[12.5px] tabular-nums text-[var(--ink-soft)] hover:text-[var(--ink)]"
        onClick={() => setOpen((v) => !v)}
      >
        <span>{t("还有 {n} 件", { n, abs: n })}</span>
        <span className={`inline-block text-[var(--ink-faint)] transition-transform ${open ? "rotate-90" : ""}`}>›</span>
      </button>
      {open ? (
        <div className="pb-2">
          {items.map((item) => (
            <UpcomingItem key={rowId(item)} item={item} today={today} actions={actions} showDate t={t} />
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function UpcomingColumn({
  today,
  later,
  ready,
  actions,
  docs,
  onAddOnDay,
  nav,
}: {
  today: string;
  /** The `later` bucket: already sorted by date ascending */
  later: TodoItem[];
  ready: boolean;
  actions: RowActions;
  /** Candidate pool for linking: user-visible docs */
  docs: DocMeta[];
  onAddOnDay: (text: string, day: string, target: AddTarget) => Promise<boolean>;
  nav: Workspace["nav"];
}) {
  const t = useT();
  const locale = useLocale();
  const last = shiftDay(today, DAYS_AHEAD);
  const days = Array.from({ length: DAYS_AHEAD }, (_, i) => shiftDay(today, i + 1));
  const byDay = new Map<string, TodoItem[]>(days.map((d) => [d, []]));
  const beyond: TodoItem[] = [];
  for (const item of later) {
    if (!item.due) continue; // Undated items in `later` are unscheduled todos in doc bodies; the Today page doesn't show them
    // Ranges are grouped under their start day and appear only once (followed by "→ end date")
    if (item.due > last) beyond.push(item);
    else byDay.get(item.due)?.push(item);
  }
  // Header count covers every dated item, including the ones folded into "N more", so it matches what the column holds
  const datedCount = days.reduce((n, d) => n + (byDay.get(d)?.length ?? 0), 0) + beyond.length;
  // Two or more consecutive days with nothing scheduled merge into one row 「13–16 · 周二 – 周五」: empty days as tall as busy ones would stretch the right column,
  // pushing "Recently opened" below the fold. Clicking any segment expands all merged segments into single days at once (users don't want to click them one by one), so they can add to a specific day; expansion state lasts only for this session
  const [expanded, setExpanded] = useState(false);
  const groups: { from: number; to: number }[] = [];
  // Whether there are any mergeable segments: only then does the expanded list need a "Collapse" row at the end
  let foldable = false;
  for (let i = 0; i < days.length; i++) {
    const empty = (byDay.get(days[i])?.length ?? 0) === 0;
    let j = i;
    while (empty && j + 1 < days.length && (byDay.get(days[j + 1])?.length ?? 0) === 0) j++;
    if (j > i) foldable = true;
    if (j > i && !expanded) {
      groups.push({ from: i, to: j });
      i = j;
    } else groups.push({ from: i, to: i });
  }
  const dayName = (day: string, i: number) => (i === 0 ? t("明天") : formatWeekday(day, locale));
  // The day hovered while dragging a todo gets a full-row background; negative margin + equal padding extend it to both edges, applied only on hover so divider lines don't grow normally
  const drag = useTodoDrag();
  const overCls = (day: string) => (drag.isOver(day) ? "-mx-2 rounded-md bg-[var(--accent-wash)] px-2" : "");

  return (
    <aside className="min-w-0">
      <div className="flex items-baseline justify-between border-b border-[var(--hairline)] pb-2">
        <h2 className="text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">{t("接下来")}</h2>
        <span className="rounded-full bg-[var(--accent-wash)] px-[7px] text-[11px] leading-[18px] tracking-normal tabular-nums text-[var(--ink-soft)]">
          {t("{n} 件", { n: datedCount, abs: datedCount })}
        </span>
      </div>
      {groups.map(({ from, to }) => {
        if (to > from) {
          const a = days[from];
          const b = days[to];
          return (
            <button
              key={a}
              type="button"
              title={t("展开这几天")}
              // Also a drop target: dropping lands on the first day; lingering while dragging auto-expands so you can keep dragging to a specific day
              {...drag.dropProps(a, { onLinger: () => setExpanded(true) })}
              className={`group/run grid w-full cursor-pointer grid-cols-[44px_minmax(0,1fr)] gap-2.5 border-b border-[var(--hairline-soft)] py-2.5 text-left text-[var(--hairline-strong)] hover:text-[var(--ink-faint)] ${overCls(a)}`}
              onClick={() => setExpanded(true)}
            >
              <div className="[font-family:var(--serif)] whitespace-nowrap text-[13px] leading-[18px] tabular-nums">
                {dayOfMonth(a)}–{dayOfMonth(b)}
              </div>
              <div className={`min-w-0 truncate py-[3px] text-[12px] leading-[12px] ${locale === "en" ? "" : "tracking-[.14em]"}`}>
                {dayName(a, from)} – {dayName(b, to)} · {t("没有安排")}
              </div>
            </button>
          );
        }
        const day = days[from];
        const items = byDay.get(day) ?? [];
        const empty = items.length === 0;
        const name = dayName(day, from);
        return (
          <div
            key={day}
            {...drag.dropProps(day)}
            className={`group/day grid grid-cols-[44px_minmax(0,1fr)] gap-2.5 border-b border-[var(--hairline-soft)] py-2.5 ${overCls(day)}`}
          >
            <div className={empty && !drag.isOver(day) ? "text-[var(--hairline-strong)]" : "text-[var(--ink)]"}>
              <div className="[font-family:var(--serif)] text-[18px] leading-none">{dayOfMonth(day)}</div>
              <div
                className={`mt-1.5 whitespace-nowrap text-[10.5px] ${locale === "en" ? "" : "tracking-[.14em]"} ${
                  from === 0 ? "text-[var(--today)]" : empty ? "" : "text-[var(--ink-faint)]"
                }`}
              >
                {name}
              </div>
            </div>
            <div className="min-w-0">
              {empty ? <div className="py-[3px] text-[12px] text-[var(--ink-faint)]">{t("没有安排")}</div> : null}
              {items.map((item) => (
                <UpcomingItem key={rowId(item)} item={item} today={today} actions={actions} showDate={false} t={t} />
              ))}
              <DayAdd
                label={t("＋ 添加到{day}", { day: name })}
                disabled={!ready}
                docs={docs}
                categories={actions.categories}
                onSubmit={(text, target) => onAddOnDay(text, day, target)}
              />
            </div>
          </div>
        );
      })}
      {expanded && foldable ? (
        // Same look as the merged row: expanding empty days adds this row, click to collapse so "Recently opened" returns to the first screen
        <button
          type="button"
          className="grid w-full cursor-pointer grid-cols-[44px_minmax(0,1fr)] gap-2.5 border-b border-[var(--hairline-soft)] py-2.5 text-left text-[var(--hairline-strong)] hover:text-[var(--ink-faint)]"
          onClick={() => setExpanded(false)}
        >
          <div className="flex h-[18px] items-center justify-center">
            <ChevronUp size={14} aria-hidden />
          </div>
          <div className={`py-[3px] text-[12px] leading-[12px] ${locale === "en" ? "" : "tracking-[.14em]"}`}>
            {t("收起")}
          </div>
        </button>
      ) : null}
      <Fold items={beyond} today={today} actions={actions} t={t} />
      <RecentDocsSection docs={docs} nav={nav} />
    </aside>
  );
}
