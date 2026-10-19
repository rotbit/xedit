import { THEME_PRESETS, type ThemePreset } from "./presets";
import { BASE_CSS } from "./base";
import { DEFAULT_TUNE, type TuneValues } from "./tune";
import { tk } from "@/i18n/t";

export { THEME_PRESETS, BASE_CSS, DEFAULT_TUNE };
export type { ThemePreset, TuneValues };
export {
  CUSTOM_THEME_PREFIX,
  HEADING_STYLE_OPTIONS,
  QUOTE_STYLE_OPTIONS,
  LINK_STYLE_OPTIONS,
  buildCustomThemeCss,
  customThemeToPreset,
  defaultCustomSpec,
  resolveTheme,
  sanitizeCustomThemes,
  type CustomThemeSpec,
} from "./custom";

export interface CodeTheme {
  id: string;
  name: string;
  /** File name under public/code-themes */
  file: string;
  dark: boolean;
}

export const CODE_THEMES: CodeTheme[] = [
  { id: "github", name: "GitHub", file: "github.css", dark: false },
  { id: "atom-one-light", name: tk("Atom One 亮"), file: "atom-one-light.css", dark: false },
  { id: "atom-one-dark", name: tk("Atom One 暗"), file: "atom-one-dark.css", dark: true },
  { id: "monokai", name: "Monokai", file: "monokai-sublime.css", dark: true },
  { id: "vs2015", name: "VS 2015", file: "vs2015.css", dark: true },
  { id: "xcode", name: "Xcode", file: "xcode.css", dark: false },
];

export function getCodeTheme(id: string): CodeTheme {
  return CODE_THEMES.find((t) => t.id === id) ?? CODE_THEMES[0];
}

const cssCache = new Map<string, string>();

async function fetchCss(path: string): Promise<string> {
  const cached = cssCache.get(path);
  if (cached !== undefined) return cached;
  try {
    const res = await fetch(path);
    if (!res.ok) return "";
    const text = await res.text();
    cssCache.set(path, text);
    return text;
  } catch {
    return "";
  }
}

/** Code theme CSS text (injected into the preview and inlined on copy) */
export function getCodeThemeCss(id: string): Promise<string> {
  return fetchCss(`/code-themes/${getCodeTheme(id).file}`);
}

/** Typography tuning CSS layer (after the theme, before custom CSS). Emits nothing at default values, leaving typography to the theme */
export function buildTuneCss(t: TuneValues): string {
  const rules: string[] = [];
  if (
    t.tuneFontSize !== DEFAULT_TUNE.tuneFontSize ||
    t.tuneLineHeight !== DEFAULT_TUNE.tuneLineHeight
  ) {
    rules.push(`#nice { font-size: ${t.tuneFontSize}px; line-height: ${t.tuneLineHeight}; }`);
  }
  if (t.tuneParaSpacing !== DEFAULT_TUNE.tuneParaSpacing) {
    rules.push(`#nice p { margin: ${t.tuneParaSpacing}px 0; }`);
  }
  return rules.join("\n");
}
