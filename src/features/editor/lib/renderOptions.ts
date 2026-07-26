import { useStore } from "@/store/useStore";
import { resolveTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";

/** 复制与导出共用的渲染参数：当前主题 + 代码高亮 + 排版微调 + 自定义 CSS */
export async function buildRenderOptions() {
  const s = useStore.getState();
  const codeCss = await getCodeThemeCss(s.codeThemeId);
  const tuneCss = buildTuneCss(s);
  return {
    themeCss: resolveTheme(s.themeId, s.customThemes).css,
    codeCss,
    customCss: `${tuneCss}\n${s.customCss}`.trim(),
    macCode: s.macCode,
    linkFootnote: s.linkFootnote,
  };
}
