"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { sanitizeCustomThemes } from "@/lib/themes/custom";
import { queueSettingsWrite, useCloudSettings, type UserSettingsRow } from "@/hooks/useSettings";

/** 排版偏好在 store 里的那四个字段，拼成一个可比较的指纹 */
function fingerprint(): string {
  const s = useStore.getState();
  return JSON.stringify([s.themeId, s.customCss, s.linkFootnote, s.customThemes]);
}

/** 登录后装载排版偏好，并独立同步后续设置变更。 */
export function useEditorSettings(loggedIn: boolean) {
  /** GET 落地那一刻的指纹；null = 云端那份还没到，这时一律不回写 */
  const baselineRef = useRef<string | null>(null);
  /** 本会话确实发生过用户修改（与基线出现过差异就永久置位）：
   *  改 A→B→A 也要推 B 之后的那次 A，所以不能只比当前值与基线 */
  const touchedRef = useRef(false);

  const apply = useCallback((settings: UserSettingsRow) => {
    const s = useStore.getState();
    s.setThemeId(settings.themeId ?? s.themeId);
    s.setCustomCss(settings.customCss ?? s.customCss);
    s.setLinkFootnote(settings.linkFootnote ?? s.linkFootnote);
    try {
      s.setCustomThemes(sanitizeCustomThemes(JSON.parse(settings.customThemes ?? "[]")));
    } catch {
      /* 历史数据损坏时保留本地值 */
    }
  }, []);

  // 基线必须在云端那份应用完之后才取：先置位再发请求的话，1s 内用户随手改一下设置，
  // 防抖那一枪就会带着本地默认值把服务端覆盖掉（新设备登录后尤其明显）
  const settled = useCallback(() => {
    baselineRef.current = fingerprint();
  }, []);

  useCloudSettings(loggedIn, apply, settled);

  // —— 偏好设置自动同步（防抖 1s，与侧栏排序合并进同一个 PUT） ——
  const themeId = useStore((s) => s.themeId);
  const customCss = useStore((s) => s.customCss);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const customThemes = useStore((s) => s.customThemes);

  useEffect(() => {
    if (!loggedIn || baselineRef.current === null) return;
    if (!touchedRef.current) {
      // 还是云端给的那份（装载引起的这一轮渲染）：没人改过，不必回写
      if (JSON.stringify([themeId, customCss, linkFootnote, customThemes]) === baselineRef.current) {
        return;
      }
      touchedRef.current = true;
    }
    queueSettingsWrite({ themeId, customCss, linkFootnote, customThemes });
  }, [loggedIn, themeId, customCss, linkFootnote, customThemes]);
}
