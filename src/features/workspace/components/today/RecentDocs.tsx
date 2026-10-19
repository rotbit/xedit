"use client";

/**
 * "Recently opened" at the bottom of the Today right column: the latest few docs, sorted by the later of last opened / last edited.
 *
 * Why it's on the Today page: the app opens here by default, so "what to do today + drafts in progress" fit on one screen
 * without clicking "Recently opened" in the sidebar; it's also the only one-click entry to the cross-folder timeline (ALL view).
 * Why under "Up next" in the right column: with many todos the left column gets long, and a full-width bottom section would be pushed below the fold;
 * in the right column it stays in that area of the first screen however many todos there are.
 * Why only 6: the right column already has six days of schedule above, and more would push it below the fold too; this is a jumping-off point, not a list page —
 * the "All" link beside the title goes to the ALL view for more.
 * Why no folder: the right column is only 300px, title and time fill a line, and a folder would only truncate the title; title wins.
 * The heading row has a rule like "Up next"; a panel background is too heavy in a narrow column, so none.
 */
import { useMemo } from "react";
import { ChevronRight, FileText } from "lucide-react";
import { useT } from "@/i18n/useT";
import { UNTITLED_DOC } from "@/lib/docDefaults";
import { formatRelativeTime } from "@/lib/format";
import { ALL } from "../../constants";
import { recencyOf, useRecentOpens } from "../../lib/recentOpens";
import type { Workspace } from "../../hooks/useWorkspace";
import type { DocMeta } from "../../types";

const LIMIT = 6;

export function RecentDocsSection({ docs, nav }: { docs: DocMeta[]; nav: Workspace["nav"] }) {
  const t = useT();
  const opens = useRecentOpens();
  // Same ordering as the ALL view; recencyOf returns updatedAt as-is on bad data, and parse failures sink to 0
  const recent = useMemo(
    () =>
      docs
        .map((doc) => {
          const at = recencyOf(doc, opens);
          return { doc, at, ms: Date.parse(at) || 0 };
        })
        .sort((a, b) => b.ms - a.ms)
        .slice(0, LIMIT),
    [docs, opens],
  );
  if (recent.length === 0) return null;
  return (
    <section className="mt-10">
      <h2 className="flex items-center justify-between border-b border-[var(--hairline)] pb-2 text-[11.5px] tracking-[.14em] text-[var(--ink-faint)]">
        <span>{t("最近打开")}</span>
        <button
          type="button"
          className="flex cursor-pointer items-center gap-0.5 font-normal tracking-normal hover:text-[var(--ink)]"
          onClick={() => nav.openCategory(ALL)}
        >
          {t("全部")}
          <ChevronRight size={12} />
        </button>
      </h2>
      <div className="divide-y divide-[var(--hairline-soft)]">
        {recent.map(({ doc, at }) => (
          <button
            key={doc.id}
            type="button"
            className="flex w-full cursor-pointer items-center gap-2 py-2 text-left hover:opacity-80"
            onClick={() => nav.openDoc(doc.id)}
          >
            <FileText size={13} className="shrink-0 text-[var(--ink-faint)]" />
            <span className="min-w-0 flex-1 truncate text-[13.5px] text-[var(--ink)]">{doc.title || t(UNTITLED_DOC)}</span>
            <span className="shrink-0 text-[11.5px] tabular-nums text-[var(--ink-faint)]">{formatRelativeTime(at)}</span>
          </button>
        ))}
      </div>
    </section>
  );
}
