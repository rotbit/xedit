"use client";

import { useCallback, useEffect, useRef } from "react";
import { useStore } from "@/store/useStore";
import { sanitizeCustomThemes } from "@/lib/themes/custom";
import { queueSettingsWrite, useCloudSettings, type UserSettingsRow } from "@/hooks/useSettings";

/** The four typography preference fields in the store, combined into a comparable fingerprint */
function fingerprint(): string {
  const s = useStore.getState();
  return JSON.stringify([s.themeId, s.customCss, s.linkFootnote, s.customThemes]);
}

/** Loads typography preferences after login and syncs later setting changes independently. */
export function useEditorSettings(loggedIn: boolean) {
  /** Fingerprint at the moment the GET landed; null = the cloud copy hasn't arrived yet, so never write back */
  const baselineRef = useRef<string | null>(null);
  /** Whether the user actually changed something this session (set permanently once it ever differs from the baseline):
   *  A→B→A must still push the final A after B, so comparing the current value to the baseline isn't enough */
  const touchedRef = useRef(false);

  const apply = useCallback((settings: UserSettingsRow) => {
    const s = useStore.getState();
    s.setThemeId(settings.themeId ?? s.themeId);
    s.setCustomCss(settings.customCss ?? s.customCss);
    s.setLinkFootnote(settings.linkFootnote ?? s.linkFootnote);
    try {
      s.setCustomThemes(sanitizeCustomThemes(JSON.parse(settings.customThemes ?? "[]")));
    } catch {
      /* Keep local values if the stored data is corrupt */
    }
  }, []);

  // Take the baseline only after the cloud copy is applied: if it's set before the request and the user tweaks a setting within 1s,
  // the debounced write would overwrite the server with local defaults (especially noticeable when logging in on a new device)
  const settled = useCallback(() => {
    baselineRef.current = fingerprint();
  }, []);

  useCloudSettings(loggedIn, apply, settled);

  // -- Auto-sync preferences (1s debounce, merged into the same PUT as sidebar ordering) --
  const themeId = useStore((s) => s.themeId);
  const customCss = useStore((s) => s.customCss);
  const linkFootnote = useStore((s) => s.linkFootnote);
  const customThemes = useStore((s) => s.customThemes);

  useEffect(() => {
    if (!loggedIn || baselineRef.current === null) return;
    if (!touchedRef.current) {
      // Still the cloud copy (this render was caused by loading): nobody changed it, so no need to write back
      if (JSON.stringify([themeId, customCss, linkFootnote, customThemes]) === baselineRef.current) {
        return;
      }
      touchedRef.current = true;
    }
    queueSettingsWrite({ themeId, customCss, linkFootnote, customThemes });
  }, [loggedIn, themeId, customCss, linkFootnote, customThemes]);
}
