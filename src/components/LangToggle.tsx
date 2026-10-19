"use client";

/**
 * Chinese / English toggle, same size and style as DarkToggle, placed next to it.
 * The button shows the language you'll "switch to": EN means click for English —
 * showing the current language would be unrecognizable as a toggle to exactly those who can't read it.
 */
import { setLocale } from "@/i18n/locale";
import { useLocale, useT } from "@/i18n/useT";

export function LangToggle() {
  const locale = useLocale();
  const t = useT();
  return (
    <button
      className="flex h-8 w-8 shrink-0 cursor-pointer items-center justify-center rounded-md text-[12px] font-medium text-[var(--ink-faint)] transition-colors hover:bg-[var(--paper)] hover:text-[var(--ink)]"
      onClick={() => setLocale(locale === "zh" ? "en" : "zh")}
      title={t("切换界面语言")}
    >
      {/* i18n-ignore language names are written in their own script, not translated */}
      {locale === "zh" ? "EN" : "中"}
    </button>
  );
}
