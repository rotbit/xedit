/**
 * String translation. The dictionary is keyed by the Chinese originals: migrating just wraps existing strings in t(),
 * with no separate key names, and the scan script can find Chinese that isn't wrapped yet.
 * Missing English falls back to the Chinese original -- better to show Chinese than a key or a blank.
 */
import { en } from "./en";
import { getLocale, type Locale } from "./locale";

export type TVars = Record<string, string | number>;

const missing = new Set<string>();
const isDev = process.env.NODE_ENV !== "production";

/** For debugging in development: which English strings were missing this session */
export function missingKeys(): string[] {
  return [...missing];
}

// Plural forms live in the dictionary value: `{count, article, articles}`, the second part when count is 1, otherwise the third
const PLURAL_RE = /\{(\w+),\s*([^,{}]*?),\s*([^,{}]*?)\}/g;
const VAR_RE = /\{(\w+)\}/g;
const HAS_CJK = /[\u4e00-\u9fff]/;

/**
 * Interpolation. Placeholders not in vars are left as-is -- rich() relies on the leftover `{doc}` to insert JSX nodes back.
 * Plural forms are handled before variable substitution, so `{count}` itself becomes a number last.
 */
export function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text
    .replace(PLURAL_RE, (all, name: string, one: string, other: string) =>
      name in vars ? (Number(vars[name]) === 1 ? one : other) : all
    )
    .replace(VAR_RE, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** Translate into a given language: for lib functions that take an explicit locale (easier to test); use t() normally */
export function translate(zh: string, locale: Locale, vars?: TVars): string {
  if (locale === "zh") return interpolate(zh, vars);
  // hasOwn: an original that happens to be "constructor" or similar mustn't hit prototype properties
  const hit = Object.hasOwn(en, zh) ? en[zh] : undefined;
  if (hit === undefined) {
    // Strings without Chinese are most likely already-translated English or server text passed through t() again, not missing entries
    if (isDev && HAS_CJK.test(zh) && !missing.has(zh)) {
      missing.add(zh);
      console.warn(`[i18n] missing en: ${JSON.stringify(zh)}`);
    }
    return interpolate(zh, vars);
  }
  return interpolate(hit, vars);
}

/** Type of the translate function: used when a component passes the t from useT() to module-level helpers */
export type TFn = typeof t;

/** Gets a string in the current language. In components use useT() instead, so they re-render on language change */
export function t(zh: string, vars?: TVars): string {
  return translate(zh, getLocale(), vars);
}

/**
 * Only marks the string and returns it unchanged: wrap strings in module-level constants with it, then t(constant) at render time.
 * A top-level t() only translates once at module load and won't change after switching languages;
 * wrapping with tk() tells the scan script it's a managed key, so it isn't reported as stray Chinese.
 */
export function tk<T extends string>(zh: T): T {
  return zh;
}
