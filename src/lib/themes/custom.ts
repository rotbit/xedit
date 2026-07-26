// 自定义主题引擎：十来个结构化参数 → 生成与内置主题同构的 CSS。
// 颜色只填一个主色，深浅底色/边框/斑马纹全部从主色派生，
// 保证怎么调都不会出「满屏荧光色」的翻车配色。

import { THEME_PRESETS, type ThemePreset } from "./presets";

export interface CustomThemeSpec {
  id: string;
  name: string;
  /** 主色（#rrggbb） */
  accent: string;
  /** h2 造型 */
  headingStyle: "plain" | "bar" | "underline" | "chip" | "wings";
  /** h2 对齐（wings 造型固定居中） */
  headingAlign: "left" | "center";
  /** 引用块造型 */
  quoteStyle: "bar" | "card" | "plain";
  /** 链接下划线样式 */
  linkStyle: "underline" | "dashed" | "plain";
  /** 加粗是否着主色 */
  strongAccent: boolean;
  /** 引用/色块圆角（px，0-16） */
  radius: number;
  /** 正文用衬线字体 */
  serif: boolean;
}

/** 自定义主题在 themeId 里的前缀，与内置 id 区分 */
export const CUSTOM_THEME_PREFIX = "custom:";

export const HEADING_STYLE_OPTIONS: { value: CustomThemeSpec["headingStyle"]; label: string }[] = [
  { value: "underline", label: "短下划线" },
  { value: "bar", label: "左竖线" },
  { value: "chip", label: "色块章节" },
  { value: "wings", label: "两侧翼线" },
  { value: "plain", label: "纯色简约" },
];

export const QUOTE_STYLE_OPTIONS: { value: CustomThemeSpec["quoteStyle"]; label: string }[] = [
  { value: "bar", label: "左线浅底" },
  { value: "card", label: "描边卡片" },
  { value: "plain", label: "极简灰线" },
];

export const LINK_STYLE_OPTIONS: { value: CustomThemeSpec["linkStyle"]; label: string }[] = [
  { value: "underline", label: "实线下划" },
  { value: "dashed", label: "虚线下划" },
  { value: "plain", label: "仅颜色" },
];

export function defaultCustomSpec(): Omit<CustomThemeSpec, "id"> {
  return {
    name: "我的主题",
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

// ---- 颜色派生 ----

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

/** 与白色混合出浅底 */
const tint = (hex: string, r: number) => mix(hex, [255, 255, 255], r);
/** 与黑色混合出深一档 */
const shade = (hex: string, r: number) => mix(hex, [0, 0, 0], r);
/** 与中灰混合出降饱和的辅助色（图注等） */
const grayMix = (hex: string, r: number) => mix(hex, [150, 150, 150], r);

function rgba(hex: string, alpha: number): string {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

// ---- CSS 生成 ----

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
        `#nice h2 { font-size: 19px; color: ${deep}; border-left: 4px solid ${accent}; background-image: linear-gradient(90deg, ${wash}, ${rgba(accent, 0)}); border-radius: 0 ${radius}px ${radius}px 0; }`,
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

/** 转成与内置主题同构的 ThemePreset，供预览/复制/缩略图复用同一条链路 */
export function customThemeToPreset(spec: CustomThemeSpec): ThemePreset {
  return {
    id: CUSTOM_THEME_PREFIX + spec.id,
    name: spec.name || "未命名主题",
    color: spec.accent,
    tag: "我的主题",
    css: buildCustomThemeCss(spec),
  };
}

/** 统一的主题解析口：内置 id 或 custom:xxx 都能拿到 ThemePreset */
export function resolveTheme(themeId: string, customThemes: CustomThemeSpec[]): ThemePreset {
  if (themeId.startsWith(CUSTOM_THEME_PREFIX)) {
    const raw = themeId.slice(CUSTOM_THEME_PREFIX.length);
    const spec = customThemes.find((t) => t.id === raw);
    if (spec) return customThemeToPreset(spec);
  }
  return THEME_PRESETS.find((t) => t.id === themeId) ?? THEME_PRESETS[0];
}

/** 校验并规整从远端/本地读回的自定义主题列表（历史数据可能残缺） */
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
