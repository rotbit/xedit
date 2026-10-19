"use client";

/**
 * Link-doc popover: opened from "Link doc ▾" on a left-column list row of the Today page, spanning the trigger row horizontally (the trigger row needs `relative`).
 * Width follows the row and isn't stretched by long folder paths; paths are truncated inline.
 * The content is just DocPicker; when already linked there's an extra "Unlink" row at the top.
 * Picking "New" closes the popover before asking for the folder: the popover is an inline overlay that would sit under the modal,
 * and clicks on the dialog would be treated as outside clicks by useDismissMenu.
 */
import { useRef } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import type { DocMeta } from "../../types";
import { askNewDocFolder } from "./AddTarget";
import { DocPicker, type Option } from "./DocPicker";

export function LinkMenu({
  item,
  docs,
  categories,
  onLink,
  onLinkNew,
  onClose,
}: {
  item: TodoItem;
  /** Candidate pool: user-visible docs */
  docs: DocMeta[];
  /** Folders a "New document" can go into (template categories already filtered out) */
  categories: string[];
  onLink: (link: string | null) => void;
  onLinkNew: (title: string, category: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissMenu(ref, onClose, true);
  useEscape(onClose);
  const t = useT();

  const pick = (o: Option) => {
    onClose();
    if (o.pick.kind === "doc") {
      if (o.pick.id !== item.link) onLink(o.pick.id);
      return;
    }
    // Closing unmounts us, so below only use values and callbacks already captured, never this component's state; with no title, use the task's text
    const title = o.pick.title || item.text;
    void askNewDocFolder(categories, t).then((category) => {
      if (category !== null) onLinkNew(title, category);
    });
  };

  const detach = item.link ? (
    <button
      type="button"
      className="flex w-full cursor-pointer items-center rounded-md px-2 py-1.5 text-left text-[var(--ink-faint)] hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
      onMouseDown={(e) => e.preventDefault()}
      onClick={() => {
        onClose();
        onLink(null);
      }}
    >
      {t("取消关联")}
    </button>
  ) : null;

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label={t("关联文章")}
      className="absolute inset-x-0 top-full z-10 mt-1 rounded-[8px] border border-[var(--hairline)] bg-[var(--panel)] p-[5px] text-[13px] text-[var(--ink)] shadow-[0_10px_36px_rgba(0,0,0,.14)]"
    >
      <DocPicker docs={docs} onPick={pick} top={detach} />
    </div>
  );
}
