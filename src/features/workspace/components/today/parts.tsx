"use client";

/** Small pieces shared by both Today columns: item labels, empty states, round checkbox, row-end delete button */
import { Check, X } from "lucide-react";
import type { TFn } from "@/i18n/t";
import type { TodoItem } from "@/lib/todos/collect";
import type { DueRange } from "@/lib/todos/parse";

/**
 * A todo's identity in the UI: the key includes the line number, and deleting a line shifts the line numbers below it in the same doc,
 * so an old key could land on another item; including the text makes it unique (used for menu toggles and React keys).
 */
export const rowId = (item: TodoItem) => `${item.key}|${item.text}`;

/** A publish schedule's text is Chinese built by lib (also written verbatim into the daily log); rebuild it per locale for display */
export function itemLabel(item: TodoItem, t: TFn): string {
  return item.source === "publish" ? t("发布《{title}》", { title: t(item.docTitle) }) : item.text;
}

/** The log stores the task's original text; a publish schedule's original is Chinese built by lib, so rebuild it per locale like itemLabel */
export function eventLabel(text: string, title: string | undefined, t: TFn): string {
  return title !== undefined && text === `发布《${title}》` ? t("发布《{title}》", { title: t(title) }) : text; // i18n-ignore compared against raw data text
}

/**
 * The doc a list item is linked to: returns { id, title }. Unlinked, or linked to a deleted doc (title can't be resolved), both count as unlinked.
 */
export function linkedDoc(
  item: TodoItem,
  titleOf: (id: string) => string | null
): { id: string; title: string } | null {
  if (item.source !== "notes" || !item.link) return null;
  const title = titleOf(item.link);
  return title === null ? null : { id: item.link, title };
}

/**
 * Source subtext. Items in the todo list are "things I noted myself" and need no source; only linked ones get a note.
 * The linked doc shows just its title in 《》 with a doc icon in front, no "Linked" label.
 */
export function secondaryOf(item: TodoItem, t: TFn, titleOf: (id: string) => string | null): string | null {
  if (item.source === "doc") return t("文章里的待办 · 《{title}》", { title: item.docTitle });
  if (item.source === "publish") return t("已排期");
  const linked = linkedDoc(item, titleOf);
  return linked ? t("《{title}》", { title: linked.title }) : null;
}

/** Row actions both columns need: open source, move date, link doc, delete. Only one menu is open at a time; the page owns the open state */
export interface RowActions {
  onOpenDoc: (id: string) => void;
  /** Change date: start + optional end (range); null = remove the date */
  onMove: (item: TodoItem, range: DueRange | null) => void;
  /** Set / clear daily repeat */
  onRepeat: (item: TodoItem, on: boolean) => void;
  onRemove: (item: TodoItem) => void;
  /** Link / change / unlink (null) a doc */
  onLink: (item: TodoItem, link: string | null) => void;
  /** "New" was picked in the picker and a folder chosen: create the doc, then link it */
  onLinkNew: (item: TodoItem, title: string, category: string) => void;
  /** Folders a "New document" can go into (template categories filtered out); all three pickers need it, so it's passed down with the row actions */
  categories: string[];
  /** Doc id → display title; null if not found (deleted, or not in the library) */
  docTitleOf: (id: string) => string | null;
  /** The currently open menu: rowId for the date menu, `${rowId}|link` for the link menu; null if none */
  menuId: string | null;
  setMenuId: (id: string | null) => void;
}

export function EmptyLine({ children }: { children: React.ReactNode }) {
  return <div className="px-0.5 py-2 text-[13px] text-[var(--ink-faint)]">{children}</div>;
}

/**
 * Onboarding shown when the whole page is empty: a monochrome line drawing + one sentence. The drawing only supplies alpha (the PNG's alpha channel);
 * color comes from currentColor via mask, so light and dark themes both follow --ink-faint without two images.
 */
export function EmptyGuide({ text }: { text: string }) {
  return (
    <div className="flex flex-col items-start gap-5 px-0.5 pb-4 pt-10 text-[var(--ink-faint)]">
      <span
        aria-hidden
        className="block h-[124px] w-[220px] bg-current opacity-60 [mask:url(/today-empty.png)_center/contain_no-repeat] [-webkit-mask:url(/today-empty.png)_center/contain_no-repeat]"
      />
      <p className="text-[13.5px] leading-relaxed">{text}</p>
    </div>
  );
}

/**
 * Round checkbox: when checked, filled with ink plus a knocked-out checkmark.
 * Without onClick it's read-only (done records from past days): still drawn checked but not clickable.
 */
export function TodoBox({
  done,
  onClick,
  label,
}: {
  done: boolean;
  onClick?: () => void;
  label?: string;
}) {
  const cls = `mt-[3px] flex h-4 w-4 shrink-0 items-center justify-center rounded-full border-[1.5px] ${
    done
      ? "border-[var(--accent)] bg-[var(--accent)]"
      : "border-[var(--hairline-strong)] bg-[var(--panel)] group-hover:border-[var(--ink-soft)]"
  }`;
  const mark = done ? (
    <Check size={10} strokeWidth={3} className="text-[var(--accent-fg)]" />
  ) : null;
  if (!onClick) return <span className={cls}>{mark}</span>;
  return (
    <button
      type="button"
      className={`${cls} cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--ink-soft)]`}
      role="checkbox"
      aria-checked={done}
      aria-label={label}
      onClick={onClick}
    >
      {mark}
    </button>
  );
}

/**
 * Row-end delete button: transparent until the whole row (outer `group`) is hovered, so every row isn't wearing an ×.
 * Uses opacity instead of hidden: it always takes up space, so the date on the right doesn't jump on hover; also visible on keyboard focus.
 */
export function RemoveButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      className="mt-[3px] shrink-0 cursor-pointer rounded text-[var(--ink-faint)] opacity-0 hover:text-[var(--seal)] focus-visible:opacity-100 focus-visible:outline-2 focus-visible:outline-[var(--ink-soft)] group-hover:opacity-100"
      title={label}
      aria-label={label}
      onClick={onClick}
    >
      <X size={13} />
    </button>
  );
}
