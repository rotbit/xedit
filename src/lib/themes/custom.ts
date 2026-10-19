// Custom theme engine: a dozen or so structured parameters → CSS isomorphic to the built-in themes.
// Only one primary color is entered; light/dark backgrounds, borders and zebra stripes all derive from it,
// so no amount of tweaking can produce a garish "neon everywhere" palette.

import { t, tk } from "@/i18n/t";
import { THEME_PRESETS, type ThemePreset } from "./presets";

export interface CustomThemeSpec {
  id: string;
  name: string;
  /** Primary color (#rrggbb) */
  accent: string;
  /** h2 style */
  headingStyle: "plain" | "bar" | "underline" | "chip" | "wings";
  /** h2 alignment (the wings style is always centered) */
  headingAlign: "left" | "center";
  /** Blockquote style */
  quoteStyle: "bar" | "card" | "plain";
  /** Link underline style */
  linkStyle: "underline" | "dashed" | "plain";
  /** Whether bold text uses the primary color */
  strongAccent: boolean;
  /** Blockquote/color block corner radius (px, 0-16) */
  radius: number;
  /** Serif font for body text */
  serif: boolean;
}

/** Prefix for custom themes in themeId, distinguishing them from built-in ids */
export const CUSTOM_THEME_PREFIX = "custom:";

export const HEADING_STYLE_OPTIONS: { value: CustomThemeSpec["headingStyle"]; label: string }[] = [
  { value: "underline", label: tk("短下划线") },
  { value: "bar", label: tk("左竖线") },
  { value: "chip", label: tk("色块章节") },
  { value: "wings", label: tk("两侧翼线") },
  { value: "plain", label: tk("纯色简约") },
];

export const QUOTE_STYLE_OPTIONS: { value: CustomThemeSpec["quoteStyle"]; label: string }[] = [
  { value: "bar", label: tk("左线浅底") },
  { value: "card", label: tk("描边卡片") },
  { value: "plain", label: tk("极简灰线") },
];

export const LINK_STYLE_OPTIONS: { value: CustomThemeSpec["linkStyle"]; label: string }[] = [
  { value: "underline", label: tk("实线下划") },
  { value: "dashed", label: tk("虚线下划") },
  { value: "plain", label: tk("仅颜色") },
];

export function defaultCustomSpec(): Omit<CustomThemeSpec, "id"> {
  return {
    // Default name in the current language at creation: what's stored is the user's own theme name and won't follow language changes afterwards
    name: t("我的主题"),
    accent: "#1e6bb8",
    headingStyle: "underline",
    headingAlign: "left",
    quoteStyle: "bar",
    linkStyle: "underline",
    strongAccent: true,
    radius: 8,
    serif: false,
  };
}

// ---- Color derivation ----

function hexToRgb(hex: string): [number, number, number] {
  const m = hex.trim().match(/^#?([0-9a-f]{6})$/i);
  if (!m) return [51, 51, 51];
  const n = parseInt(m[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(hex: string, target: [number, number, number], ratio: number): string {
  const rgb = hexToRgb(hex);
  const out = rgb.map((v, i) => Math.round(v + (target[i] - v) * ratio));
  return `#${out.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

/** Mix with white for a light background */
const tint = (hex: string, r: number) => mix(hex, [255, 255, 255], r);
/** Mix with black for one shade darker */
const shade = (hex: string, r: number) => mix(hex, [0, 0, 0], r);
/** Mix with mid-gray for a desaturated accent (captions etc.) */
const grayMix = (hex: string, r: number) => mix(hex, [150, 150, 150], r);

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---- CSS generation ----

export function buildCustomThemeCss(spec: CustomThemeSpec): string {
  const accent = /^#[0-9a-f]{6}$/i.test(spec.accent) ? spec.accent : "#1e6bb8";
  const deep = shade(accent, 0.22);
  const wash = tint(accent, 0.93);
  const zebra = tint(accent, 0.965);
  const border = tint(accent, 0.55);
  const borderSoft = tint(accent, 0.76);
  const codeBg = tint(accent, 0.94);
  const caption = grayMix(accent, 0.6);
  const radius = Math.min(16, Math.max(0, Math.round(spec.radius)));

  const rules: string[] = [];

  if (spec.serif) {
    rules.push(
      `#nice { font-family: Optima, Georgia, "Songti SC", "Noto Serif SC", "PingFang SC", serif; }`
    );
  }

  rules.push(`#nice h1 { font-size: 22px; text-align: center; color: ${deep}; }`);

  const centered = spec.headingStyle === "wings" || spec.headingAlign === "center";
  const h2Align = centered ? "text-align: center; " : "";
  switch (spec.headingStyle) {
    case "plain":
      rules.push(`#nice h2 { font-size: 19px; ${h2Align}color: ${deep}; }`);
      break;
    case "bar":
      rules.push(
        `#nice h2 { font-size: 19px; color: ${deep}; border-left: 4px solid ${accent}; background-color: ${wash}; border-radius: 0 ${radius}px ${radius}px 0; }`,
        `#nice h2 .content { display: inline-block; padding: 7px 12px; }`
      );
      break;
    case "underline":
      rules.push(
        `#nice h2 { font-size: 19px; ${h2Align}color: ${deep}; }`,
        `#nice h2 .content { display: inline-block; border-bottom: 3px solid ${accent}; padding: 0 4px 6px 4px; }`
      );
      break;
    case "chip":
      rules.push(
        `#nice h2 { font-size: 18px; ${h2Align}}`,
        `#nice h2 .content { display: inline-block; background-color: ${accent}; color: #ffffff; padding: 5px 18px; border-radius: ${Math.max(4, radius)}px; font-size: 17px; letter-spacing: 1px; box-shadow: 0 3px 8px ${rgba(accent, 0.26)}; }`
      );
      break;
    case "wings":
      rules.push(
        `#nice h2 { font-size: 18px; text-align: center; color: ${deep}; letter-spacing: 0.1em; }`,
        `#nice h2 .prefix { display: inline-block; width: 24px; height: 1px; background-color: ${border}; vertical-align: middle; margin-right: 14px; }`,
        `#nice h2 .suffix { display: inline-block; width: 24px; height: 1px; background-color: ${border}; vertical-align: middle; margin-left: 14px; }`
      );
      break;
  }

  rules.push(
    `#nice h3 { font-size: 17px; color: ${deep}; }`,
    `#nice h3 .prefix { display: inline-block; width: 4px; height: 16px; background-color: ${accent}; margin-right: 8px; border-radius: 2px; }`,
    `#nice h4 { font-size: 16px; color: ${deep}; }`
  );

  const linkDecor =
    spec.linkStyle === "plain"
      ? ""
      : ` border-bottom: 1px ${spec.linkStyle === "dashed" ? "dashed" : "solid"} ${border};`;
  rules.push(`#nice a { color: ${accent}; text-decoration: none;${linkDecor} }`);

  rules.push(
    `#nice strong { color: ${spec.strongAccent ? deep : "#111111"}; }`,
    `#nice em { color: ${grayMix(accent, 0.3)}; }`,
    `#nice del { color: #999999; }`
  );

  switch (spec.quoteStyle) {
    case "bar":
      rules.push(
        `#nice blockquote { border-left: 3px solid ${accent}; background-color: ${wash}; color: ${grayMix(accent, 0.55)}; border-radius: 0 ${radius}px ${radius}px 0; }`
      );
      break;
    case "card":
      rules.push(
        `#nice blockquote { border: 1px solid ${borderSoft}; background-color: ${wash}; color: ${grayMix(accent, 0.55)}; border-radius: ${radius}px; padding: 6px 18px; }`
      );
      break;
    case "plain":
      rules.push(
        `#nice blockquote { border-left: 2px solid #d9d9d9; background-color: transparent; color: #8c8c8c; }`
      );
      break;
  }

  rules.push(
    `#nice p code, #nice li code, #nice td code { color: ${shade(accent, 0.1)}; background-color: ${codeBg}; }`,
    `#nice th { background-color: ${wash}; color: ${deep}; }`,
    `#nice tr:nth-child(2n) td { background-color: ${zebra}; }`,
    `#nice th, #nice td { border-color: ${borderSoft}; }`,
    `#nice hr { border-top: 1px solid ${borderSoft}; }`,
    `#nice figcaption { color: ${caption}; }`,
    `#nice .footnote-ref { color: ${accent}; }`,
    `#nice .table-of-contents { background-color: ${wash}; }`
  );

  return rules.join("\n");
}

/** Convert to a ThemePreset isomorphic to built-in themes, so preview/copy/thumbnails reuse the same pipeline */
export function customThemeToPreset(spec: CustomThemeSpec): ThemePreset {
  return {
    id: CUSTOM_THEME_PREFIX + spec.id,
    name: spec.name || tk("未命名主题"),
    color: spec.accent,
    tag: tk("我的主题"),
    css: buildCustomThemeCss(spec),
  };
}

/** Unified theme resolver: built-in ids and custom:xxx both yield a ThemePreset */
export function resolveTheme(themeId: string, customThemes: CustomThemeSpec[]): ThemePreset {
  if (themeId.startsWith(CUSTOM_THEME_PREFIX)) {
    const raw = themeId.slice(CUSTOM_THEME_PREFIX.length);
    const spec = customThemes.find((t) => t.id === raw);
    if (spec) return customThemeToPreset(spec);
  }
  return THEME_PRESETS.find((t) => t.id === themeId) ?? THEME_PRESETS[0];
}

/** Validate and normalize custom theme lists read back from remote/local (legacy data may be incomplete) */
export function sanitizeCustomThemes(value: unknown): CustomThemeSpec[] {
  if (!Array.isArray(value)) return [];
  const defaults = defaultCustomSpec();
  return value
    .filter((t): t is Record<string, unknown> => typeof t === "object" && t !== null)
    .filter((t) => typeof t.id === "string" && t.id.length > 0)
    .slice(0, 50)
    .map((t) => ({
      id: t.id as string,
      name: typeof t.name === "string" ? (t.name as string).slice(0, 30) : defaults.name,
      accent: typeof t.accent === "string" ? (t.accent as string) : defaults.accent,
      headingStyle: HEADING_STYLE_OPTIONS.some((o) => o.value === t.headingStyle)
        ? (t.headingStyle as CustomThemeSpec["headingStyle"])
        : defaults.headingStyle,
      headingAlign: t.headingAlign === "center" ? "center" : "left",
      quoteStyle: QUOTE_STYLE_OPTIONS.some((o) => o.value === t.quoteStyle)
        ? (t.quoteStyle as CustomThemeSpec["quoteStyle"])
        : defaults.quoteStyle,
      linkStyle: LINK_STYLE_OPTIONS.some((o) => o.value === t.linkStyle)
        ? (t.linkStyle as CustomThemeSpec["linkStyle"])
        : defaults.linkStyle,
      strongAccent: typeof t.strongAccent === "boolean" ? t.strongAccent : defaults.strongAccent,
      radius: typeof t.radius === "number" ? t.radius : defaults.radius,
      serif: typeof t.serif === "boolean" ? t.serif : defaults.serif,
    }));
}
