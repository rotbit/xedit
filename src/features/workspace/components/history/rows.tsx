"use client";

/**
 * Row pieces of the history detail column: done / open task rows, a day's rows grouped plainly (week / month / year)
 * or on a card with 已完成 / 未完成 sections (single-day view). Split out of HistoryDetail.tsx to keep both under the file cap.
 */
import { FileText } from "lucide-react";
import type { TFn } from "@/i18n/t";
import type { TodoItem } from "@/lib/todos/collect";
import type { DayEvent } from "@/lib/todos/events";
import type { DayDigest } from "@/lib/todos/history";
import { NOTES_TITLE } from "@/lib/todos/write";
import { eventLabel, itemLabel, linkedDoc, rowId, TodoBox } from "../today/parts";

/** Horizontal padding differs by context: card rows sit inset like Today's, plain day groups stay flush with their header */
type Inset = "card" | "flush";
const rowCls = (inset: Inset) =>
  `flex items-start gap-2.5 py-2.5 text-[13.5px] leading-[1.45] ${inset === "card" ? "px-3.5" : "px-0.5"}`;

/** How documents display and link: if still in the library use the current name and make it clickable; deleted ones use the recorded title, not clickable */
export interface DocLookup {
  /** Visible document id → current name */
  titles: Map<string, string>;
  /** id of the todo list document (hidden from the user): task rows no longer note their source */
  notesIds: Set<string>;
  open: (id: string) => void;
  /** The document a done record opens on click (doneOpenId in today/parts.tsx); null when there's nothing to open */
  openIdOf: (e: DayEvent) => string | null;
}

/** Source chip: same teal chip Today rows use for a linked doc, so the two pages read as one system */
function SourceChip({ title, t }: { title: string; t: TFn }) {
  return (
    <span className="mt-[3px] inline-flex max-w-full items-center gap-1 rounded-[4px] bg-[var(--today-tint)] px-1.5 text-[12px] text-[var(--today)]">
      <FileText size={12} className="shrink-0" aria-hidden />
      <span className="min-w-0 truncate">{t("《{title}》", { title })}</span>
    </span>
  );
}

const pad = (n: number) => String(n).padStart(2, "0");
/** Check-off time as HH:mm; a 24h clock reads the same in both locales */
function clock(ts: number): string {
  const d = new Date(ts);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function TaskRow({ e, lookup, inset, t }: { e: DayEvent; lookup: DocLookup; inset: Inset; t: TFn }) {
  const label = eventLabel(e.text ?? "", e.title, t);
  // Source: not noted for the todo list doc (hidden from users) or publish schedules (title already in the text); others use the current name, deleted ones the recorded title
  const fromNotes = (e.docId !== undefined && lookup.notesIds.has(e.docId)) || e.title === NOTES_TITLE;
  const isPublish = e.title !== undefined && e.text === `发布《${e.title}》`; // i18n-ignore compared against the raw data text
  const source = e.title && !fromNotes && !isPublish ? ((e.docId && lookup.titles.get(e.docId)) ?? e.title) : null;
  // Where clicking the text goes: the linked article of a checklist item, or the document a body item / publish schedule belongs to
  const openId = lookup.openIdOf(e);
  const textCls = "text-[var(--ink-soft)] line-through decoration-[var(--hairline-strong)]";
  return (
    <div className={rowCls(inset)}>
      <TodoBox done />
      <div className="min-w-0 flex-1">
        {openId ? (
          <button
            type="button"
            className={`${textCls} cursor-pointer text-left hover:text-[var(--ink)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)]`}
            onClick={() => lookup.open(openId)}
          >
            {label}
          </button>
        ) : (
          <div className={textCls}>{label}</div>
        )}
        {source ? <SourceChip title={source} t={t} /> : null}
      </div>
      <span className="mt-[2px] shrink-0 text-[12px] tabular-nums text-[var(--ink-faint)]">{clock(e.ts)}</span>
    </div>
  );
}

/** Unfinished todos: read-only; those dated before today are marked overdue */
function PendingRow({
  item,
  overdue,
  lookup,
  inset,
  t,
}: {
  item: TodoItem;
  overdue: boolean;
  lookup: DocLookup;
  inset: Inset;
  t: TFn;
}) {
  const label = itemLabel(item, t);
  const linked = linkedDoc(item, (id) => lookup.titles.get(id) ?? null);
  // Source: noted for items from a document body; list items only if linked to a document; publish schedules already include the title, so not noted
  const source = item.source === "doc" ? item.docTitle : (linked?.title ?? null);
  // Where clicking the text goes: body items and publish schedules go to that document; the list doc is hidden from users, so only linked items are clickable
  const openId = item.source === "notes" ? (linked?.id ?? null) : item.docId;
  return (
    <div className={rowCls(inset)}>
      <TodoBox done={false} />
      <div className="min-w-0 flex-1">
        {openId ? (
          <button
            type="button"
            className="cursor-pointer text-left focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)]"
            onClick={() => lookup.open(openId)}
          >
            {label}
          </button>
        ) : (
          <div>{label}</div>
        )}
        {source ? <SourceChip title={source} t={t} /> : null}
      </div>
      {overdue ? (
        <span className="ml-1 mt-[2px] shrink-0 rounded-full bg-[var(--seal-wash)] px-[7px] text-[11px] leading-[18px] text-[var(--seal)]">
          {t("逾期")}
        </span>
      ) : null}
    </div>
  );
}

/** One day's details: its digest plus the open todos that land on it */
export interface DayRowsData {
  d: DayDigest;
  pending: TodoItem[];
}

interface RowsProps {
  day: DayRowsData;
  today: string;
  lookup: DocLookup;
  t: TFn;
}

/** Plain day rows for week / month / year groups: unfinished first, completed after, same order as the Today page */
export function DigestRows({ day, today, lookup, t }: RowsProps) {
  const overdue = day.d.key < today;
  return (
    <div className="divide-y divide-[var(--hairline-soft)]">
      {day.pending.map((item) => (
        <PendingRow key={`p:${rowId(item)}`} item={item} overdue={overdue} lookup={lookup} inset="flush" t={t} />
      ))}
      {day.d.tasks.map((e) => (
        <TaskRow key={e.id} e={e} lookup={lookup} inset="flush" t={t} />
      ))}
    </div>
  );
}

function SectionHead({ label, n, t }: { label: string; n: number; t: TFn }) {
  return (
    <div className="flex justify-between border-b border-[var(--hairline-soft)] bg-[var(--paper)] px-3.5 pb-1.5 pt-2.5 text-[11px] tracking-[.14em] text-[var(--ink-faint)]">
      <span>{label}</span>
      <span className="tracking-normal tabular-nums">{t("{n} 件", { n, abs: n })}</span>
    </div>
  );
}

/**
 * Single-day view: the rows on a card, split into 已完成 / 未完成 sections. Done leads here because a past day is read
 * as "what got done"; the open items follow as what's left. Empty sections are left out, an empty day shows `empty`.
 */
export function DayCard({ day, today, lookup, t, empty }: RowsProps & { empty: string }) {
  const overdue = day.d.key < today;
  const { tasks } = day.d;
  return (
    <div className="mt-3 overflow-hidden rounded-[10px] border border-[var(--hairline)] bg-[var(--panel)]">
      {tasks.length > 0 ? (
        <>
          <SectionHead label={t("已完成")} n={tasks.length} t={t} />
          <div className="divide-y divide-[var(--hairline-soft)]">
            {tasks.map((e) => (
              <TaskRow key={e.id} e={e} lookup={lookup} inset="card" t={t} />
            ))}
          </div>
        </>
      ) : null}
      {day.pending.length > 0 ? (
        <>
          <SectionHead label={t("未完成")} n={day.pending.length} t={t} />
          <div className="divide-y divide-[var(--hairline-soft)]">
            {day.pending.map((item) => (
              <PendingRow key={`p:${rowId(item)}`} item={item} overdue={overdue} lookup={lookup} inset="card" t={t} />
            ))}
          </div>
        </>
      ) : null}
      {!hasRows(day) ? (
        <div className="px-3.5">
          <Empty>{empty}</Empty>
        </div>
      ) : null}
    </div>
  );
}

// Completed items plus unfinished todos; which documents were written / created isn't listed here
export const hasRows = (day: DayRowsData) => day.pending.length > 0 || day.d.tasks.length > 0;

export function Empty({ children }: { children: React.ReactNode }) {
  return <div className="px-0.5 py-2 text-[13px] text-[var(--ink-faint)]">{children}</div>;
}
