"use client";

import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import { useLocale, useT } from "@/i18n/useT";
import { ALL, UNCATEGORIZED } from "../constants";
import { displayCatName, displayCatPath } from "../lib/catPath";
import { groupByRecency, isDayHeading, showsRelativeTime } from "../lib/recencyGroups";
import type { DocMeta } from "../types";
import type { Workspace } from "../hooks/useWorkspace";

/** List excerpts are plain text roughly stripped by the server and often still contain whole long links; show only the domain so URLs don't break the layout */
function cleanExcerpt(s: string): string {
  return s
    .replace(/https?:\/\/([^\s/?#]+)[^\s]*/g, (_, host: string) => {
      const parts = host.replace(/^www\./, "").split(".");
      return `‹${parts.slice(-2).join(".")}›`;
    })
    // Long digit strings like ID or order numbers keep only the first 4 digits, so they neither stretch the layout nor sit exposed in the list
    .replace(/\d{12,}/g, (m) => `${m.slice(0, 4)}…`)
    .replace(/\\_/g, "_")
    .replace(/\s+/g, " ")
    .trim();
}

/** Restore / permanently delete on the right of trash rows: the row layout no longer needs a divider, so they're compacted into a row of small edge buttons */
function TrashActions({ ws, doc }: { ws: Workspace; doc: DocMeta }) {
  const { docActions } = ws;
  const t = useT();
  return (
    <div className="flex shrink-0 gap-1.5 pt-0.5">
      <button
        className="cursor-pointer rounded-md border border-[var(--hairline-strong)] px-2 py-0.5 text-[11.5px] text-[var(--ink)] hover:bg-[var(--paper)]"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.restoreDoc(doc);
        }}
      >
        {t("恢复")}
      </button>
      <button
        className="cursor-pointer rounded-md px-2 py-0.5 text-[11.5px] text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
        onClick={(e) => {
          e.stopPropagation();
          void docActions.hardDeleteDoc(doc);
        }}
      >
        {t("彻底删除")}
      </button>
    </div>
  );
}

/** One document in the timeline: title + one-line excerpt on the left, faint folder and word count on the right, separated only by whitespace, no borders.
 *  showTime: only the Today / Yesterday groups show relative time before the word count; older groups' left column already says when.
 *  at: this row's time (max(opened, edited) in the 「最近打开」 (Recent) view, updatedAt elsewhere), provided by ws.timeOf
 *  Don't name this DocRow again: the same-named component in the sidebar tree is a different layout (components/DocRow.tsx) */
function TimelineRow({
  ws,
  doc,
  showTime,
  at,
}: {
  ws: Workspace;
  doc: DocMeta;
  showTime: boolean;
  at: string;
}) {
  const { nav, menus, drag } = ws;
  const { isTrash } = nav;
  const t = useT();
  const cat = doc.category || UNCATEGORIZED;
  const excerpt = cleanExcerpt(doc.excerpt || "");
  const chars = typeof doc.chars === "number" ? doc.chars : 0;
  // Trash rows have only two buttons on the right, so one fewer empty track to avoid an extra gap
  const cols = isTrash
    ? "grid-cols-[minmax(0,1fr)_auto]"
    : "grid-cols-[minmax(0,1fr)_auto_auto]";
  return (
    <div
      className={`group relative -mx-3 grid ${cols} items-start gap-5 rounded-lg px-3 py-3 transition-colors duration-150 hover:bg-[var(--accent-wash)] ${
        isTrash ? "" : "cursor-pointer"
      } ${drag.isDragging({ kind: "doc", id: doc.id }) ? "opacity-40" : ""}`}
      onClick={() => {
        // Rows in the trash can't be opened: there are only the restore / permanently delete buttons
        if (!isTrash) nav.openDoc(doc.id);
      }}
      onContextMenu={isTrash ? undefined : (e) => menus.openDocMenuAt(e, doc.id)}
      {...(isTrash ? {} : drag.dragSrcProps({ kind: "doc", id: doc.id }))}
    >
      <div className="min-w-0">
        <p className="truncate text-[15.5px] font-semibold leading-[1.4] text-[var(--ink)]">
          {doc.title || t(UNTITLED_DOC)}
        </p>
        <p
          className={`mt-0.5 truncate text-[13px] ${
            excerpt ? "text-[var(--ink-soft)]" : "text-[var(--ink-faint)]"
          }`}
        >
          {excerpt || t("尚无内容")}
        </p>
      </div>
      {isTrash ? (
        <TrashActions ws={ws} doc={doc} />
      ) : (
        <>
          <div className="whitespace-nowrap pt-1 text-right text-[11.5px] leading-relaxed">
            {/* Only show the last-level folder name; clicking it opens that folder. On narrow screens it yields the whole line to the row below */}
            <button
              className="hidden cursor-pointer text-[var(--ink-soft)] underline-offset-2 hover:text-[var(--ink)] hover:underline sm:ml-auto sm:block"
              title={displayCatPath(cat, t)}
              onClick={(e) => {
                e.stopPropagation();
                nav.openCategory(cat);
              }}
            >
              {displayCatName(cat.split("/").pop() ?? cat, t)}
            </button>
            <span className="block tabular-nums text-[var(--ink-faint)]">
              {[
                showTime ? formatRelativeTime(at) : "",
                chars > 0 ? t("{n} 字", { n: chars.toLocaleString(), abs: chars }) : "",
              ]
                .filter(Boolean)
                .join(" · ")}
            </span>
          </div>
          <button
            className={`mt-0.5 cursor-pointer self-start rounded-md p-1 text-[var(--ink-faint)] hover:bg-[var(--paper)] hover:text-[var(--ink)] [@media(hover:none)]:visible ${
              menus.docMenu?.id === doc.id ? "visible" : "invisible group-hover:visible"
            }`}
            // Menu trigger: the outside-click logic spares it, so clicking again toggles it closed here
            data-menu-trigger
            onClick={(e) => menus.toggleDocMenuAt(e, doc.id)}
          >
            <MoreHorizontal size={16} />
          </button>
        </>
      )}
    </div>
  );
}

/** 「最近打开」 (Recent) shows only documents from the last 30 days by default; if fewer than this many, top up in reverse order so infrequent writers don't see an empty page */
const RECENT_DAYS = 30;
const RECENT_MIN = 30;

/** How many to show in the window: the larger of the 30-day count and 30. The list is already sorted by timeOf descending, so take the first n */
function recentCount(docs: DocMeta[], now: number, timeOf: (d: DocMeta) => string): number {
  const cutoff = now - RECENT_DAYS * 24 * 60 * 60 * 1000;
  // Bad timestamps parse to NaN and comparisons are always false, so they naturally don't count as "within 30 days"
  const within = docs.filter((d) => new Date(timeOf(d)).getTime() >= cutoff).length;
  return Math.max(within, RECENT_MIN);
}

/**
 * Timeline view: big serif text on the left (day number, or labels like 「上周」「九月」 (last week, September)), the group's documents on the right.
 * Groups are separated by a single thin line, and granularity coarsens further back, so one-doc-a-day doesn't turn the page into a ledger.
 * The 「最近打开」 (Recent) entry shows only a recent stretch, with a bottom button to expand everything; folder / search / trash still show all.
 */
export function DocTimeline({ ws }: { ws: Workspace }) {
  const locale = useLocale();
  const t = useT();
  const { nav, timeOf } = ws;
  // Remember which view the expansion happened in: the key is only on the inner div and the component itself doesn't remount on category change,
  // so a bare boolean won't do, otherwise expanding in Recent, going to another folder and coming back would still show everything
  const [expandedFor, setExpandedFor] = useState<string | null>(null);
  const expanded = expandedFor === nav.activeCat;
  // The 30-day window is based on mount time: calling Date.now() during render is impure, and a few minutes' drift within a session doesn't matter
  const [mountedAt] = useState(() => Date.now());
  const windowed = nav.activeCat === ALL && !nav.search.trim() && !nav.isTrash && !expanded;
  const all = ws.filtered;
  const shown = windowed ? all.slice(0, recentCount(all, mountedAt, timeOf)) : all;
  const rest = all.length - shown.length;
  const groups = groupByRecency(shown, undefined, locale, timeOf);

  return (
    // On category change one short fade-in of the whole list is enough (changing the key remounts it), rows don't each float up:
    // this is a work list, not a home page, and staggered row entrances just make people wait
    <div key={nav.activeCat} className="fade-in mt-4">
      {groups.map((group, gi) => (
        <div
          key={group.key}
          className={`grid gap-1.5 pb-4 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-6 ${
            gi > 0 ? "border-t border-[var(--hairline)] pt-2.5" : ""
          }`}
        >
          {/* On narrow screens the left column folds into one horizontal line, with smaller big text and the label following */}
          <div className="flex items-baseline gap-2 sm:block sm:pt-3">
            <span
              className={`[font-family:var(--serif)] text-[20px] leading-none tracking-tight text-[var(--ink)] ${
                // Text labels (last week / September) are much wider than day numbers; shrink to 20px so they don't stretch the left column
                isDayHeading(group.key) ? "sm:text-[30px]" : "sm:text-[20px]"
              }`}
            >
              {group.heading}
            </span>
            {group.sub && (
              <span className="text-[11px] tracking-[.14em] text-[var(--ink-faint)] sm:mt-2 sm:block">
                {group.sub}
              </span>
            )}
          </div>
          <div className="min-w-0">
            {group.docs.map((doc) => (
              <TimelineRow
                key={doc.id}
                ws={ws}
                doc={doc}
                showTime={showsRelativeTime(group.key)}
                at={timeOf(doc)}
              />
            ))}
          </div>
        </div>
      ))}
      {windowed && rest > 0 && (
        <button
          className="mt-6 w-full cursor-pointer rounded-lg py-2.5 text-[13px] text-[var(--ink-soft)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          onClick={() => setExpandedFor(nav.activeCat)}
        >
          {t("更早的文章 · 还有 {n} 篇", { n: rest })}
        </button>
      )}
    </div>
  );
}
