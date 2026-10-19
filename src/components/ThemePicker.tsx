"use client";

/**
 * Theme picker panel: a screen of thumbnail samples rendered with each theme's real CSS, plus typography sliders and new / custom CSS entries.
 * Isolation works by replacing #nice in theme CSS with each card's own class; structural base styles are shared once by the whole panel.
 * Selection and tweaks write straight to the store, which handles persistence; this file makes no requests.
 */
import { useMemo } from "react";
import { Check, Pencil, Plus, Code2 } from "lucide-react";
import { useStore } from "@/store/useStore";
import {
  THEME_PRESETS,
  BASE_CSS,
  DEFAULT_TUNE,
  customThemeToPreset,
  CUSTOM_THEME_PREFIX,
  type ThemePreset,
} from "@/lib/themes";
import { useT } from "@/i18n/useT";
import { rich } from "@/i18n/rich";

/** Scope class shared by all thumbnails: BASE_CSS is injected once against it (see ThemePickerPanel) */
const THUMB_SCOPE = "tp-thumb";

/** Injecting BASE_CSS per card would mean 14+ copies of 100KB duplicated text, parsed 14 times over.
 *  Instead it's computed once at module level and injected once in the panel; the injection point precedes the cards,
 *  so at equal specificity it's still "base first, theme after", and themes still override the base */
const BASE_THUMB_CSS = BASE_CSS.replaceAll("#nice", `.${THUMB_SCOPE}`);

/**
 * Theme thumbnail: renders a mini sample (heading/body/quote) with the theme's real CSS,
 * isolated by replacing #nice in selectors with this card's own class, then scaled down as a whole.
 * Each card injects only its theme's diff CSS; structural base styles come from the single THUMB_SCOPE copy.
 */
function ThemeThumb({ theme }: { theme: ThemePreset }) {
  // Custom theme ids are prefixed UUIDs that may contain characters illegal in CSS class names, so replace them with underscores
  const cls = `tp-${theme.id.replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  const css = useMemo(() => theme.css.replaceAll("#nice", `.${cls}`), [theme, cls]);
  const t = useT();

  return (
    <div className="light-lock pointer-events-none h-[88px] overflow-hidden rounded-[5px] bg-white">
      <style>{css}</style>
      <div
        className={`${THUMB_SCOPE} ${cls}`}
        style={{
          transform: "scale(0.5)",
          transformOrigin: "top left",
          width: "200%",
          padding: "12px 16px",
        }}
      >
        <h2 style={{ marginTop: 0, marginBottom: 10 }}>
          <span className="prefix" />
          <span className="content">{t("标题样式")}</span>
          <span className="suffix" />
        </h2>
        <p style={{ margin: "8px 0" }}>
          {rich(t("正文文字，{strong}与{a}的样子。"), {
            strong: <strong>{t("重点强调")}</strong>,
            a: <a>{t("链接")}</a>,
          })}
        </p>
        <blockquote style={{ margin: "10px 0" }}>
          <p style={{ margin: "6px 0" }}>{t("引用内容的样式")}</p>
        </blockquote>
      </div>
    </div>
  );
}

/** A theme card: thumbnail + name + tags; custom themes also get an edit button that appears on hover. */
function ThemeCard({
  theme,
  active,
  onSelect,
  onEdit,
}: {
  theme: ThemePreset;
  active: boolean;
  onSelect: () => void;
  onEdit?: () => void;
}) {
  const t = useT();
  return (
    <div className="group cursor-pointer text-left" onClick={onSelect}>
      <div
        className={`relative rounded-md p-[2px] transition-shadow ${
          active
            ? "ring-2 ring-[var(--accent)]"
            : "ring-1 ring-[var(--hairline)] group-hover:ring-[var(--hairline-strong)]"
        }`}
      >
        <ThemeThumb theme={theme} />
        {onEdit ? (
          <button
            className="absolute right-1.5 top-1.5 flex h-6 w-6 cursor-pointer items-center justify-center rounded-md bg-black/45 text-white opacity-0 transition-opacity hover:bg-black/65 group-hover:opacity-100"
            title={t("编辑主题")}
            onClick={(e) => {
              // The edit button sits on the card and must stop propagation, otherwise clicking 「编辑」 (Edit) would also select the theme
              e.stopPropagation();
              onEdit();
            }}
          >
            <Pencil size={12} />
          </button>
        ) : null}
      </div>
      <div className="flex items-center justify-between px-0.5 pt-1.5">
        <span
          className={`flex items-center gap-1 text-[12.5px] ${
            active ? "font-medium text-[var(--accent-deep)]" : "text-[var(--ink)]"
          }`}
        >
          {active ? <Check size={12} /> : null}
          {t(theme.name)}
        </span>
        <span className="text-[10.5px] text-[var(--ink-faint)]">{t(theme.tag)}</span>
      </div>
    </div>
  );
}

/** Typography slider row */
function SliderRow({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit: string;
  onChange: (v: number) => void;
}) {
  return (
    // The panel lives inside a dropdown, so clicks from dragging sliders must be stopped right here or the menu treats them as outside clicks and closes
    <div className="flex items-center gap-2.5 px-3.5 py-1.5" onClick={(e) => e.stopPropagation()}>
      <span className="w-7 shrink-0 text-[12px] text-[var(--ink-soft)]">{label}</span>
      <input
        type="range"
        className="h-1 min-w-0 flex-1 cursor-pointer accent-[var(--accent)]"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <span className="w-11 shrink-0 text-right text-[11.5px] text-[var(--ink-faint)] [font-family:var(--mono)]">
        {value}
        {unit}
      </span>
    </div>
  );
}

/** Typography tweaks block: font size / line height / paragraph spacing sliders + one-click reset, placed after the theme grid;
 *  the settings page embeds this too, and className lets the wrapper adapt to its layout (e.g. offsetting inline padding) */
export function TypographyTuner({ className }: { className?: string } = {}) {
  const tuneFontSize = useStore((s) => s.tuneFontSize);
  const tuneLineHeight = useStore((s) => s.tuneLineHeight);
  const tuneParaSpacing = useStore((s) => s.tuneParaSpacing);
  const setTune = useStore((s) => s.setTune);
  const t = useT();

  return (
    <div className={className}>
      <p className="px-3.5 pb-0.5 pt-0.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        {t("排版微调")}
      </p>
      <SliderRow
        label={t("字号")}
        value={tuneFontSize}
        // The three ranges are deliberately narrow: beyond them it no longer looks like normal typesetting in a WeChat article
        min={14}
        max={18}
        step={0.5}
        unit="px"
        onChange={(v) => setTune({ tuneFontSize: v })}
      />
      <SliderRow
        label={t("行高")}
        value={tuneLineHeight}
        min={1.5}
        max={2.2}
        step={0.05}
        unit=""
        onChange={(v) => setTune({ tuneLineHeight: v })}
      />
      <SliderRow
        label={t("段距")}
        value={tuneParaSpacing}
        min={8}
        max={28}
        step={2}
        unit="px"
        onChange={(v) => setTune({ tuneParaSpacing: v })}
      />
      <button
        className="mx-3.5 my-1 cursor-pointer rounded px-1.5 py-0.5 text-[11.5px] text-[var(--ink-faint)] hover:text-[var(--accent)]"
        onClick={(e) => {
          e.stopPropagation();
          setTune({ ...DEFAULT_TUNE });
        }}
      >
        {t("重置排版微调")}
      </button>
    </div>
  );
}

/** Panel body, inside the top bar's 「主题」 (Theme) dropdown; scrolls itself, max 72vh, with a fixed bottom button bar. */
export function ThemePickerPanel() {
  const themeId = useStore((s) => s.themeId);
  const setThemeId = useStore((s) => s.setThemeId);
  const customThemes = useStore((s) => s.customThemes);
  const setThemeStudio = useStore((s) => s.setThemeStudio);
  const setCssDialogOpen = useStore((s) => s.setCssDialogOpen);
  const t = useT();

  const footBtn =
    "flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-[var(--hairline-strong)] px-3 py-2 text-[12.5px] text-[var(--ink)] hover:bg-[var(--paper)]";

  return (
    <div className="max-h-[72vh] overflow-y-auto">
      {/* Structural base styles for thumbnails, shared once across the panel; it must come before the cards
          so theme CSS comes later and still overrides it at equal specificity */}
      <style>{BASE_THUMB_CSS}</style>
      {customThemes.length > 0 ? (
        <>
          <p className="px-3.5 pb-1.5 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
            {t("我的主题")}
          </p>
          <div className="grid grid-cols-2 gap-2.5 px-3 pb-2">
            {customThemes.map((spec) => {
              const preset = customThemeToPreset(spec);
              return (
                <ThemeCard
                  key={preset.id}
                  theme={preset}
                  active={preset.id === themeId}
                  onSelect={() => setThemeId(preset.id)}
                  onEdit={() => setThemeStudio(spec.id)}
                />
              );
            })}
          </div>
        </>
      ) : null}

      <p className="px-3.5 pb-1.5 pt-1.5 text-[11px] tracking-widest text-[var(--ink-faint)]">
        {t("排版主题")}
      </p>
      <div className="grid grid-cols-2 gap-2.5 px-3 pb-2">
        {THEME_PRESETS.map((th) => (
          <ThemeCard
            key={th.id}
            theme={th}
            active={th.id === themeId}
            onSelect={() => setThemeId(th.id)}
          />
        ))}
      </div>

      {/* Typography tweaks: like themes, they adjust "what the article looks like", so they sit at the end of the theme panel, separated from the grid by a hairline */}
      <div className="border-t border-[var(--hairline)] py-1.5">
        <TypographyTuner />
      </div>

      <div className="sticky bottom-0 flex gap-2 border-t border-[var(--hairline-soft)] bg-[var(--panel)] px-3 py-2.5">
        <button className={footBtn} onClick={() => setThemeStudio("new")}>
          <Plus size={14} />
          {t("新建主题")}
        </button>
        <button className={footBtn} onClick={() => setCssDialogOpen(true)}>
          <Code2 size={14} />
          {t("自定义 CSS")}
        </button>
      </div>
    </div>
  );
}

// Lets outside code (e.g. the settings menu) check whether an id is a custom theme
export { CUSTOM_THEME_PREFIX };
