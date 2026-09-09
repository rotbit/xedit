"use client";

import { useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { sanitizeCustomThemes } from "@/lib/themes/custom";

/** 登录后装载排版偏好，并独立同步后续设置变更。 */
export function useEditorSettings(loggedIn: boolean) {
  const settingsLoadedRef = useRef(false);
  // —— 登录后拉取云端偏好（主题/自定义CSS/外链设置） ——
  useEffect(() => {
    if (!loggedIn || settingsLoadedRef.current) return;
    settingsLoadedRef.current = true;
    void (async () => {
      const res = await fetch("/api/settings");
      if (!res.ok) return;
      const settings = await res.json();
      if (settings) {
        const s = useStore.getState();
        s.setThemeId(settings.themeId);
        s.setCustomCss(settings.customCss);
        s.setLinkFootnote(settings.linkFootnote);
        try {
          s.setCustomThemes(sanitizeCustomThemes(JSON.parse(settings.customThemes ?? "[]")));
        } catch {
          /* 历史数据损坏时保留本地值 */
        }
      }
    })();
  }, [loggedIn]);

  // —— 偏好设置自动同步（防抖 1s） ——
  const themeId = useStore((s) => s.themeId);
  const customCss = useStore((s) => s.customCss);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const customThemes = useStore((s) => s.customThemes);

  useEffect(() => {
    if (!loggedIn || !settingsLoadedRef.current) return;
    const timer = setTimeout(() => {
      void fetch("/api/settings", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ themeId, customCss, linkFootnote, customThemes }),
      });
    }, 1000);
    return () => clearTimeout(timer);
  }, [loggedIn, themeId, customCss, linkFootnote, customThemes]);
}
