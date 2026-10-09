"use client";

/**
 * 关联文章弹层：今天页左栏清单行的「关联文章 ▾」点开，横向占满触发行（触发行要带 relative）；
 * 宽度跟着行走，不随长文件夹路径撑开，路径在行内截断。
 * 里面就是 DocPicker；已关联的在列表顶部多一行「取消关联」。
 */
import { useRef } from "react";
import { useDismissMenu } from "@/hooks/useDismissMenu";
import { useEscape } from "@/hooks/useEscape";
import { useT } from "@/i18n/useT";
import type { TodoItem } from "@/lib/todos/collect";
import type { DocMeta } from "../../types";
import { DocPicker, type Option } from "./DocPicker";

export function LinkMenu({
  item,
  docs,
  onLink,
  onLinkNew,
  onClose,
}: {
  item: TodoItem;
  /** 候选池：用户看得见的文章 */
  docs: DocMeta[];
  onLink: (link: string | null) => void;
  onLinkNew: (title: string) => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useDismissMenu(ref, onClose, true);
  useEscape(onClose);
  const t = useT();

  const pick = (o: Option) => {
    onClose();
    if (o.pick.kind === "new") onLinkNew(o.pick.title);
    else if (o.pick.id !== item.link) onLink(o.pick.id);
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
