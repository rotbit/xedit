import { THEME_PRESETS, type ThemePreset } from "./presets";
import { BASE_CSS } from "./base";

export { THEME_PRESETS, BASE_CSS };
export type { ThemePreset };

export interface CodeTheme {
  id: string;
  name: string;
  /** public/code-themes 下的文件名 */
  file: string;
  dark: boolean;
}

export const CODE_THEMES: CodeTheme[] = [
  { id: "github", name: "GitHub", file: "github.css", dark: false },
  { id: "atom-one-light", name: "Atom One 亮", file: "atom-one-light.css", dark: false },
  { id: "atom-one-dark", name: "Atom One 暗", file: "atom-one-dark.css", dark: true },
  { id: "monokai", name: "Monokai", file: "monokai-sublime.css", dark: true },
  { id: "vs2015", name: "VS 2015", file: "vs2015.css", dark: true },
  { id: "xcode", name: "Xcode", file: "xcode.css", dark: false },
];

export function getTheme(id: string): ThemePreset {
  return THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
}

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

/** 代码主题 CSS 文本（用于预览注入与复制时内联） */
export function getCodeThemeCss(id: string): Promise<string> {
  return fetchCss(`/code-themes/${getCodeTheme(id).file}`);
}

/** 排版微调 CSS 层（叠加在主题之后、自定义 CSS 之前） */
export function buildTuneCss(t: {
  tuneFontSize: number;
  tuneLineHeight: number;
  tuneParaSpacing: number;
}): string {
  const rules: string[] = [];
  if (t.tuneFontSize !== 16 || t.tuneLineHeight !== 1.75) {
    rules.push(`#nice { font-size: ${t.tuneFontSize}px; line-height: ${t.tuneLineHeight}; }`);
  }
  if (t.tuneParaSpacing !== 16) {
    rules.push(`#nice p { margin: ${t.tuneParaSpacing}px 0; }`);
  }
  return rules.join("\n");
}
