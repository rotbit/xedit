import { BASE_CSS, THEME_PRESETS } from "@/lib/themes";
import { PAPER_CLASS, type ThemeMeta } from "./paper";

/**
 * 落地页与主题页要同时展示 13 套主题的真实样张，编译时做两件事：
 *
 * 1) BASE 只按 .xe-paper 输出一次，各主题按 .xe-paper.xe-t-<id> 输出（多一节类选择器
 *    天然压过 BASE）。换主题只是换 class，既不重复注入 13 份基础样式（省约 50KB），
 *    默认主题也不依赖 JS。
 * 2) 样张里的标题改用 [data-h="n"] 而不是真的 h1~h6。样张是「文字的图片」，
 *    不该混进页面大纲——否则首页会冒出两个 h1、十几个来自样张的 h2。
 */

/** 把选择器里的 h1~h6 换成属性选择器，声明块原样不动 */
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

/**
 * 单套主题的原样 CSS（BASE + 主题，标题仍是 h1~h6），
 * 供「复制到公众号」演示内联使用——那条路径会先把样张还原成真正的标题标签。
 */
export function themeCssFor(id: string, scope: string): string[] {
  const theme = THEME_PRESETS.find((t) => t.id === id) ?? THEME_PRESETS[0];
  return [BASE_CSS.replaceAll("#nice", scope), theme.css.replaceAll("#nice", scope)];
}

export const THEME_METAS: ThemeMeta[] = THEME_PRESETS.map(({ id, name, color, tag }) => ({
  id,
  name,
  color,
  tag,
}));
