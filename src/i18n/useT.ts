"use client";

/**
 * React binding for language. Components should always use `const t = useT()`:
 * it reads context, so the component re-renders on language change; components importing module-level t() directly don't.
 */
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { getLocale, initLocale, LOCALE_CHANGED_EVENT, type Locale } from "./locale";
import { translate, type TFn, type TVars } from "./t";

const LocaleContext = createContext<{ locale: Locale } | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // Push into the module variable during render (idempotent), so module-level t() in children gets the right language on the first frame
  initLocale(locale);
  const [current, setCurrent] = useState(locale);
  useEffect(() => {
    const sync = () => setCurrent(getLocale());
    window.addEventListener(LOCALE_CHANGED_EVENT, sync);
    return () => window.removeEventListener(LOCALE_CHANGED_EVENT, sync);
  }, []);
  const value = useMemo(() => ({ locale: current }), [current]);
  return createElement(LocaleContext.Provider, { value }, children);
}

/** Without a Provider (unit tests, isolated renders) fall back to the module variable instead of throwing */
export function useLocale(): Locale {
  return useContext(LocaleContext)?.locale ?? getLocale();
}

/** The returned function changes identity with the language, so useMemo / useCallback depending on it recompute after a switch */
export function useT(): TFn {
  const locale = useLocale();
  return useMemo(() => (zh: string, vars?: TVars) => translate(zh, locale, vars), [locale]);
}
