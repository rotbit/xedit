"use client";

/**
 * Quick add at the top of the "To do" column: click the row to turn it into an input in place; type and press Enter to record.
 *
 * Defaults to a standalone todo — everyday tasks don't necessarily belong to a doc, and noting one shouldn't force picking "where to put it".
 * Standalone todos still live in a hidden todo-list doc: reusing doc storage and sync gives cross-device for free,
 * and that doc is filtered out at the library layer so the user never sees it.
 * Linking a doc is an optional secondary action: "Link doc" on the right opens search. When a task clearly belongs to a draft
 * ("fill in the data for section 3"), link it — the task is still stored in the list, with `[[docId]]` at the end of the line,
 * and clicking it on the Today page jumps there; you can also create a new doc in place (choosing a folder) and link it.
 * The link-target state and right-side controls live in AddTarget.tsx, shared with the per-day input rows in the right column.
 */
import { useRef, useState } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";
import type { DocMeta } from "../../types";
import { Picker, TargetControl, useAddTarget, type AddTarget } from "./AddTarget";

/**
 * The open-state input row (with the picker). Closing unmounts it; next open starts fresh and the target resets to standalone.
 */
function InputRow({
  docs,
  categories,
  onSubmit,
  onClose,
}: {
  docs: DocMeta[];
  categories: string[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
  onClose: () => void;
}) {
  const rowRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [text, setText] = useState("");
  const { target, targetLabel, picking, setPicking, choosingFolder, pick, detach } = useAddTarget(inputRef, categories);
  const [pending, setPending] = useState(false);
  const t = useT();
  // Suspend while the folder dialog is open: clicks on the dialog and Esc belong to it and must not collapse the input row
  useDismissMenu(rowRef, onClose, !choosingFolder);
  // Esc has two levels: if the picker is open, close just the picker and go back to the input; otherwise close the whole row
  useEscape(() => {
    if (picking) {
      setPicking(false);
      inputRef.current?.focus();
    } else onClose();
  }, !choosingFolder);

  const submit = async () => {
    if (pending || !text.trim()) return;
    // Lock while submitting: hitting Enter twice before the todo-list doc exists would create two 「待办清单」 docs
    setPending(true);
    const ok = await onSubmit(text, target);
    setPending(false);
    if (ok) onClose();
    else inputRef.current?.focus(); // On failure don't close or clear the text; return focus for an easy retry
  };

  return (
    <div ref={rowRef} className="relative">
      <div
        role="group"
        aria-label={t("添加待办")}
        className="flex items-center gap-2.5 border-b border-[var(--hairline)] px-0.5 py-2"
      >
        <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
        <input
          ref={inputRef}
          autoFocus
          className="min-w-0 flex-1 bg-transparent text-[14px] outline-none placeholder:text-[var(--ink-faint)] disabled:opacity-60"
          placeholder={t("要做什么…")}
          value={text}
          disabled={pending}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            // Enter during IME composition selects a candidate, not a submit
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            void submit();
          }}
        />
        <TargetControl
          target={target}
          label={targetLabel}
          picking={picking}
          pending={pending}
          size="md"
          onToggle={() => setPicking((v) => !v)}
          onDetach={detach}
        />
      </div>
      {picking ? <Picker docs={docs} onPick={(o) => void pick(o)} /> : null}
    </div>
  );
}

/**
 * Placeholder row + open-state input row.
 * Locked (disabled) until the whole library has loaded: the todo-list doc can't be found yet, and submitting would create a new one by mistake.
 */
export function QuickAdd({
  disabled,
  docs,
  categories,
  onSubmit,
}: {
  disabled: boolean;
  docs: DocMeta[];
  /** Folders a "New document" can go into (template categories filtered out) */
  categories: string[];
  onSubmit: (text: string, target: AddTarget) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const t = useT();
  return (
    <div className="relative mb-1.5">
      {open ? (
        <InputRow docs={docs} categories={categories} onSubmit={onSubmit} onClose={() => setOpen(false)} />
      ) : (
        <button
          type="button"
          // Marked as a menu trigger: the outside-dismiss logic lets it through and it toggles itself
          data-menu-trigger
          className="flex w-full cursor-pointer items-center gap-2.5 border-b border-[var(--hairline)] px-0.5 py-2 text-left text-[14px] text-[var(--ink-faint)] hover:text-[var(--ink-soft)] disabled:cursor-default disabled:opacity-60"
          disabled={disabled}
          aria-expanded={open}
          onClick={() => setOpen(true)}
        >
          <span className="h-4 w-4 shrink-0 rounded-full border-[1.5px] border-dashed border-[var(--hairline-strong)]" />
          {t("添加待办…")}
        </button>
      )}
    </div>
  );
}
