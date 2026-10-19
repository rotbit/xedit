/** Mapping between Feishu docx font color enums (FontColor 1–7) and their official color values.
 *  Push direction: any CSS color from the editor snaps to the nearest of the 7 presets by RGB distance;
 *  import direction: the enum is restored to its hex and wrapped back in <span style="color:…">.
 *  Values come from the open platform docs (rgb(216,57,49) etc. are the colors the Feishu editor actually uses). */
export const FEISHU_FONT_COLORS = [
  { id: 1, hex: "#d83931", r: 216, g: 57, b: 49 }, // red
  { id: 2, hex: "#de7802", r: 222, g: 120, b: 2 }, // orange
  { id: 3, hex: "#dc9b04", r: 220, g: 155, b: 4 }, // yellow
  { id: 4, hex: "#2ea121", r: 46, g: 161, b: 33 }, // green
  { id: 5, hex: "#245bdb", r: 36, g: 91, b: 219 }, // blue
  { id: 6, hex: "#6425d0", r: 100, g: 37, b: 208 }, // purple
  { id: 7, hex: "#8f959e", r: 143, g: 149, b: 158 }, // gray
] as const;

/** If even the nearest preset exceeds this squared distance, skip coloring (e.g. near-black/white; forcing a match only looks worse) */
const MAX_DISTANCE_SQ = 140 * 140;

function parseCssColor(css: string): { r: number; g: number; b: number } | undefined {
  const s = css.trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1];
  if (hex) {
    const h = hex.length === 3 ? [...hex].map((c) => c + c).join("") : hex;
    return {
      r: parseInt(h.slice(0, 2), 16),
      g: parseInt(h.slice(2, 4), 16),
      b: parseInt(h.slice(4, 6), 16),
    };
  }
  const rgb = s.match(/^rgba?\((\d+)[,\s]+(\d+)[,\s]+(\d+)/i);
  if (rgb) return { r: Number(rgb[1]), g: Number(rgb[2]), b: Number(rgb[3]) };
  return undefined;
}

/** CSS color (hex / rgb()) → nearest Feishu font color enum; returns undefined if unparseable or nothing is close */
export function feishuFontColorOf(css: string): number | undefined {
  const c = parseCssColor(css);
  if (!c) return undefined;
  let best: number | undefined;
  let bestDist = Infinity;
  for (const p of FEISHU_FONT_COLORS) {
    const d = (c.r - p.r) ** 2 + (c.g - p.g) ** 2 + (c.b - p.b) ** 2;
    if (d < bestDist) {
      bestDist = d;
      best = p.id;
    }
  }
  return bestDist <= MAX_DISTANCE_SQ ? best : undefined;
}

/** Feishu font color enum → hex; returns undefined for unknown enums */
export function hexOfFeishuFontColor(id: number | undefined): string | undefined {
  return FEISHU_FONT_COLORS.find((c) => c.id === id)?.hex;
}
