/** 飞书 docx 字体色枚举（FontColor 1~7）与官方色值的映射。
 *  推送方向：编辑器的任意 CSS 颜色按 RGB 距离就近落到 7 个预设枚举；
 *  导入方向：枚举还原成对应 hex，包回 <span style="color:…">。
 *  色值来自开放平台文档（rgb(216,57,49) 等为飞书编辑器实际用色）。 */
export const FEISHU_FONT_COLORS = [
  { id: 1, hex: "#d83931", r: 216, g: 57, b: 49 }, // 红
  { id: 2, hex: "#de7802", r: 222, g: 120, b: 2 }, // 橙
  { id: 3, hex: "#dc9b04", r: 220, g: 155, b: 4 }, // 黄
  { id: 4, hex: "#2ea121", r: 46, g: 161, b: 33 }, // 绿
  { id: 5, hex: "#245bdb", r: 36, g: 91, b: 219 }, // 蓝
  { id: 6, hex: "#6425d0", r: 100, g: 37, b: 208 }, // 紫
  { id: 7, hex: "#8f959e", r: 143, g: 149, b: 158 }, // 灰
] as const;

/** 离最近预设色也超过这个平方距离就放弃上色（比如接近黑/白的颜色，硬凑只会更难看） */
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

/** CSS 颜色（hex / rgb() 形态）→ 最接近的飞书字体色枚举；解析不了或都不像返回 undefined */
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

/** 飞书字体色枚举 → hex；未知枚举返回 undefined */
export function hexOfFeishuFontColor(id: number | undefined): string | undefined {
  return FEISHU_FONT_COLORS.find((c) => c.id === id)?.hex;
}
