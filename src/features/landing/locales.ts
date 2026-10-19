/**
 * Where each landing locale is published and how it's tagged. Client-safe (no dictionaries imported),
 * so the language switcher and the proxy can share it with the server-side metadata.
 */
export type LandingLocale = "zh" | "en" | "ja";

export const LANDING_LOCALES: readonly LandingLocale[] = ["zh", "en", "ja"];

/** zh is the home page itself; the other locales live under their own path */
export const LANDING_PATH: Record<LandingLocale, string> = { zh: "/", en: "/en", ja: "/ja" };

/** Value for <html lang> and hreflang */
export const LANDING_HTML_LANG: Record<LandingLocale, string> = { zh: "zh-CN", en: "en", ja: "ja" };

export const LANDING_OG_LOCALE: Record<LandingLocale, string> = { zh: "zh_CN", en: "en_US", ja: "ja_JP" };

/** Each language's own name, written in its own script: the switcher must be readable to exactly those who can't read the current page */
export const LANDING_LANG_NAME: Record<LandingLocale, string> = { zh: "中文", en: "English", ja: "日本語" };

/** Request header the proxy sets on /en and /ja so the shared root layout can render the right <html lang> (see src/proxy.ts) */
export const LANDING_LOCALE_HEADER = "x-landing-locale";

export function isLandingLocale(v: unknown): v is LandingLocale {
  return v === "zh" || v === "en" || v === "ja";
}
