import { useStore } from "@/store/useStore";
import { resolveTheme, getCodeThemeCss, buildTuneCss } from "@/lib/themes";

/** Render options shared by copy and export: current theme + code highlighting + typography tweaks + custom CSS */
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
