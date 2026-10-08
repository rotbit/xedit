"use client";

/**
 * 中 / 英切换，与 DarkToggle 同尺寸同样式，摆在它旁边。
 * 按钮上写的是「要切到」的那个语言：EN 表示点了变英文——
 * 显示当前语言的话，看不懂当前语言的人恰恰认不出这是切换按钮。
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
      {/* i18n-ignore 语言名用它自己的文字写，不翻译 */}
      {locale === "zh" ? "EN" : "中"}
    </button>
  );
}
