"use client";

/**
 * 语言的 React 接入。组件里一律 `const t = useT()`：
 * 它读 context，语言切换时组件会跟着重渲染；直接 import 模块级 t() 的组件不会。
 */
import { createContext, createElement, useContext, useEffect, useMemo, useState } from "react";
import { getLocale, initLocale, LOCALE_CHANGED_EVENT, type Locale } from "./locale";
import { translate, type TFn, type TVars } from "./t";

const LocaleContext = createContext<{ locale: Locale } | null>(null);

export function LocaleProvider({ locale, children }: { locale: Locale; children: React.ReactNode }) {
  // render 阶段就灌进模块变量（幂等）：子组件里的模块级 t() 首帧也拿得到对的语言
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

/** 没有 Provider（单测、孤立渲染）时退回模块变量，不抛 */
export function useLocale(): Locale {
  return useContext(LocaleContext)?.locale ?? getLocale();
}

/** 返回的函数随语言换引用：依赖它的 useMemo / useCallback 会在切换语言后重算 */
export function useT(): TFn {
  const locale = useLocale();
  return useMemo(() => (zh: string, vars?: TVars) => translate(zh, locale, vars), [locale]);
}
