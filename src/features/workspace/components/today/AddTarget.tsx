"use client";

/**
 * Optional link target when 「记一件事」 (adding a task), shared by the left-column quick input (QuickAdd) and the input row at the end of each day in the right column (UpcomingColumn).
 *
 * Both must behave the same: default is a standalone todo; clicking 「关联文章」 (Link document) on the right opens search, and once chosen it shows 《title》 + X to undo;
 * it's extracted here so two copies don't drift apart. State and rendering are separate: useAddTarget tracks what's selected,
 * TargetControl only draws the right-hand part, and each input row decides when its picker opens and how it closes.
 */
import { useState, type RefObject } from "react";
import { X } from "lucide-react";
import { askCategoryPick } from "@/components/CategoryPickDialog";
import type { TFn } from "@/i18n/t";
import { useT } from "@/i18n/useT";
import { displayCatName, nameOf } from "../../lib/catPath";
import type { DocMeta } from "../../types";
import { DocPicker, type Option } from "./DocPicker";

/**
 * Where the task is recorded: always in the todo list document (appended if it exists, created if not), optionally linked to an existing document (link);
 * or to a newly created document that's then linked: when title is an empty string the task text becomes the title, and category is the chosen folder.
 */
export type AddTarget = { kind: "notes"; link?: string } | { kind: "new"; title: string; category: string };

export const NOTES: AddTarget = { kind: "notes" };

/** Whether it's still the default target (standalone todo, not linked to any document) */
export const isDefaultTarget = (target: AddTarget) => target.kind === "notes" && !target.link;

/**
 * After clicking 「新建」 (New) in the picker, ask which folder it goes in; shared by three places (row-end link, quick input, end of each day).
 * Returns the category path, null = cancelled. Callers each close their own popover first, then await it;
 * the dialog is a global host that doesn't depend on the caller staying mounted, so the row-end popover unmounting on close doesn't affect later callbacks.
 */
export function askNewDocFolder(categories: string[], t: TFn): Promise<string | null> {
  return askCategoryPick({ title: t("新建文章到哪个文件夹"), categories });
}

/** Frame for the document picker below the input row */
export function Picker({ docs, onPick }: { docs: DocMeta[]; onPick: (o: Option) => void }) {
  const t = useT();
  return (
    <div
      role="dialog"
      aria-label={t("关联文章")}
      className="absolute inset-x-0 top-full z-20 mt-1 rounded-lg border border-[var(--hairline)] bg-[var(--panel)] p-2 text-[13px] shadow-lg"
    >
      <DocPicker docs={docs} onPick={onPick} />
    </div>
  );
}

/**
 * Link target state: what's selected (target), the right-hand label text (targetLabel), whether the picker is open (picking),
 * whether the folder dialog is open (choosingFolder). After selecting / cancelling, focus returns to the input so the user can keep typing or hit Enter.
 *
 * choosingFolder must be passed to the input row: the dialog is modal, so clicks inside it count as "outside clicks" for the input row,
 * and Esc also reaches the input row; without suspending their close logic the input row would collapse (and the quick input row would unmount, losing the text).
 */
export function useAddTarget(inputRef: RefObject<HTMLInputElement | null>, categories: string[]) {
  const t = useT();
  const [target, setTarget] = useState<AddTarget>(NOTES);
  /** Text of the right-hand label when a document is linked; no label for the default target */
  const [targetLabel, setTargetLabel] = useState("");
  const [picking, setPicking] = useState(false);
  const [choosingFolder, setChoosingFolder] = useState(false);

  const pick = async (o: Option) => {
    setPicking(false);
    if (o.pick.kind === "doc") {
      setTarget({ kind: "notes", link: o.pick.id });
      setTargetLabel(t("《{title}》", { title: o.label }));
      inputRef.current?.focus();
      return;
    }
    const { title } = o.pick;
    setChoosingFolder(true);
    const category = await askNewDocFolder(categories, t);
    setChoosingFolder(false);
    // Cancelling is as if 「新建」 (New) was never clicked: the target stays as it was
    if (category !== null) {
      setTarget({ kind: "new", title, category });
      // Include the last-level folder name: otherwise you can't tell where it'll land, and there's no chance to catch a wrong choice before submitting
      const what = title ? t("新建《{title}》", { title }) : t("新建文章");
      setTargetLabel(`${what} · ${displayCatName(nameOf(category), t)}`);
    }
    inputRef.current?.focus();
  };

  const detach = () => {
    setTarget(NOTES);
    setTargetLabel("");
    inputRef.current?.focus();
  };

  /** Reset to default after a successful submit: when adding several in a row each picks its own link, not inheriting the previous one */
  const reset = () => {
    setTarget(NOTES);
    setTargetLabel("");
    setPicking(false);
  };

  return { target, targetLabel, picking, setPicking, choosingFolder, pick, detach, reset };
}

const SIZES = {
  md: { text: "text-[12.5px]", icon: 12, maxW: "max-w-[40%]" },
  sm: { text: "text-[11.5px]", icon: 11, maxW: "max-w-[45%]" },
} as const;

/**
 * The right-hand part of the input row: a 「关联文章」 (Link document) text button for the default target, or 《title》 + X once a document is chosen.
 * md pairs with the left column's 14px input row, sm with the right column's 12px one.
 */
export function TargetControl({
  target,
  label,
  picking,
  pending,
  size,
  onToggle,
  onDetach,
  className = "",
}: {
  target: AddTarget;
  label: string;
  picking: boolean;
  pending: boolean;
  size: "md" | "sm";
  onToggle: () => void;
  onDetach: () => void;
  className?: string;
}) {
  const t = useT();
  const s = SIZES[size];
  if (isDefaultTarget(target)) {
    return (
      <button
        type="button"
        className={`shrink-0 cursor-pointer ${s.text} text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60 ${className}`}
        disabled={pending}
        aria-expanded={picking}
        onClick={onToggle}
      >
        {t("关联文章")}
      </button>
    );
  }
  return (
    <span className={`flex ${s.maxW} shrink-0 items-center gap-1 ${s.text} text-[var(--ink-soft)] ${className}`}>
      <span className="min-w-0 truncate">{label}</span>
      <button
        type="button"
        className="shrink-0 cursor-pointer rounded p-0.5 text-[var(--ink-faint)] hover:text-[var(--ink)] disabled:cursor-default disabled:opacity-60"
        aria-label={t("取消关联")}
        disabled={pending}
        onClick={onDetach}
      >
        <X size={s.icon} />
      </button>
    </span>
  );
}
