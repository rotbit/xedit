"use client";

// Preview peripherals: the theme entry on the right of the top bar, reading mode's word count/reading time, and the title atop the body card.
// Only appears in Preview's reading variant; split out so Preview doesn't carry yet another store dependency.

import { useMemo } from "react";
import { Palette } from "lucide-react";
import { Dropdown } from "@/components/Dropdown";
import { ThemePickerPanel } from "@/components/ThemePicker";
import { wordCount } from "@/lib/wordCount";
import { useT } from "@/i18n/useT";
import { useStore } from "@/store/useStore";

/** Typography theme entry on the right of the preview top bar: themes only affect the rendered result, so the entry sits right beside it;
 *  opens the theme list + font size/line height/paragraph spacing tweaks */
export function ThemeTrigger({ themeName }: { themeName: string }) {
  const t = useT();
  return (
    <Dropdown
      width={430}
      trigger={
        <button
          className="flex h-7 max-w-[200px] cursor-pointer items-center gap-1.5 rounded-md px-2 text-[12px] text-[var(--ink-soft)] transition-colors hover:bg-[var(--accent-wash)] hover:text-[var(--ink)]"
          title={t("切换排版主题")}
        >
          <Palette size={14} className="shrink-0" />
          <span className="truncate">{t(themeName)}</span>
        </button>
      }
    >
      <ThemePickerPanel />
    </Dropdown>
  );
}

/** Right side of the reading mode top bar: word count */
export function ReadingMeta() {
  const t = useT();
  const content = useStore((s) => s.content);
  // wordCount runs several regex passes internally, so only rescan when the body changes
  const chars = useMemo(() => wordCount(content), [content]);

  return (
    <span className="flex items-center gap-2 text-[12px] text-[var(--ink-faint)]">
      <span>{t("{n} 字", { n: chars, abs: chars })}</span>
    </span>
  );
}

/** Article title atop the body card (the body itself is rendered by the theme; the title isn't part of the Markdown body) */
export function ReadingTitle() {
  const title = useStore((s) => s.title);

  return (
    <div className="px-4">
      <h1 className="text-[26px] font-bold leading-[1.4] text-[#1a1a1a] [font-family:var(--serif)]">
        {title}
      </h1>
      <div className="mt-3 h-px w-10 bg-[#e5e5e5]" />
    </div>
  );
}
