/**
 * UI language: purely a user preference, not part of the route (no /en/...).
 * Stored in a cookie rather than localStorage: the root layout needs the language on the server
 * to render the right <html lang> and first-screen text directly, without a client-side re-translation that flickers.
 */

export type Locale = "zh" | "en";

export const LOCALES: readonly Locale[] = ["zh", "en"];
export const DEFAULT_LOCALE: Locale = "zh";
export const LANG_COOKIE = "xedit-lang";
export const LOCALE_CHANGED_EVENT = "xedit:locale-changed";

const ONE_YEAR = 60 * 60 * 24 * 365;

export function isLocale(v: unknown): v is Locale {
  return v === "zh" || v === "en";
}

/**
 * Cookie first (the user picked one explicitly); otherwise use the first Accept-Language entry:
 * Chinese (zh, zh-CN, zh-TW...) gets Chinese, everything else English -- English beats Chinese for non-Chinese users.
 * With neither (crawlers, curl) fall back to Chinese, matching the product's main audience.
 */
export function detectLocale(
  cookieValue: string | undefined,
  acceptLanguage: string | null | undefined
): Locale {
  if (isLocale(cookieValue)) return cookieValue;
  const first = acceptLanguage?.split(",")[0]?.split(";")[0]?.trim().toLowerCase();
  if (!first || first === "*") return DEFAULT_LOCALE;
  return first === "zh" || first.startsWith("zh-") ? "zh" : "en";
}

export function htmlLang(locale: Locale): string {
  return locale === "zh" ? "zh-CN" : "en";
}

/**
 * Module-level current language. Initialized from <html lang>: the server already set lang from the cookie,
 * so t() calls that run before the Provider mounts (module-level constants etc.) still get the right language.
 */
function initialLocale(): Locale {
  if (typeof document === "undefined") return DEFAULT_LOCALE;
  const lang = document.documentElement?.lang;
  if (!lang) return DEFAULT_LOCALE;
  return lang.toLowerCase().startsWith("zh") ? "zh" : "en";
}

let current: Locale = initialLocale();
let initialized = false;

export function getLocale(): Locale {
  return current;
}

/**
 * The Provider pushes in the server-determined language on its first frame.
 * In the browser only the first call counts: if the user has switched languages since, a Provider re-render must not change it back.
 * On the server it's overwritten every time: module variables are shared across all requests there, so this is only a best effort for the current one;
 * that's why components should use useT() (reads context, accurate under SSR), leaving module-level t() for event callbacks and lib.
 */
export function initLocale(locale: Locale): void {
  if (typeof window === "undefined") {
    current = locale;
    return;
  }
  if (initialized) return;
  initialized = true;
  current = locale;
}

/** User switches language: write the cookie (the server renders with it next request), update lang, and notify the Provider to re-render */
export function setLocale(next: Locale): void {
  current = next;
  initialized = true;
  if (typeof document === "undefined") return;
  document.cookie = `${LANG_COOKIE}=${next}; max-age=${ONE_YEAR}; path=/; SameSite=Lax`;
  if (document.documentElement) document.documentElement.lang = htmlLang(next);
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT));
}
