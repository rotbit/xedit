import { BASE_CSS, THEME_PRESETS } from "@/lib/themes";
import { PAPER_CLASS, type ThemeMeta } from "./paper";

/**
 * The /themes page shows real samples of all 13 themes at once, so at compile time we do two things:
 *
 * 1) BASE is emitted once under .xe-paper, and each theme under .xe-paper.xe-t-<id> (the extra class selector
 *    naturally beats BASE). Switching themes is just a class swap, without injecting 13 copies of the base styles (saves ~50KB),
 *    and the default theme doesn't depend on JS.
 * 2) Sample headings use [data-h="n"] instead of real h1~h6. A sample is a "picture of text"
 *    and shouldn't pollute the page outline; otherwise the home page would get two h1s and a dozen sample h2s.
 */

/** Replace h1~h6 in selectors with attribute selectors, leaving declaration blocks untouched */
function retargetHeadings(css: string): string {
  return css.replace(/([^{}]+)\{([^{}]*)\}/g, (_, sel: string, body: string) => {
    return `${sel.replace(/\bh([1-6])\b/g, '[data-h="$1"]')}{${body}}`;
  });
}

export function buildThemeStyles(): string {
  const base = retargetHeadings(BASE_CSS).replaceAll("#nice", `.${PAPER_CLASS}`);
  const themes = THEME_PRESETS.map((t) =>
    retargetHeadings(t.css).replaceAll("#nice", `.${PAPER_CLASS}.xe-t-${t.id}`)
  ).join("");
  return base + themes;
}

export const THEME_METAS: ThemeMeta[] = THEME_PRESETS.map(({ id, name, color, tag }) => ({
  id,
  name,
  color,
  tag,
}));
