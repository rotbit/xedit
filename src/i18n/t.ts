/**
 * 文案翻译。字典以中文原文为 key：迁移只是给现有字符串包一层 t()，
 * 不用另起一套 key 名，扫描脚本也能直接找出还没包的中文。
 * 英文缺词时回退中文原文——宁可露中文，也不能露出 key 或空白。
 */
import { en } from "./en";
import { getLocale, type Locale } from "./locale";

export type TVars = Record<string, string | number>;

const missing = new Set<string>();
const isDev = process.env.NODE_ENV !== "production";

/** 开发期调试用：本次会话里英文缺了哪些词 */
export function missingKeys(): string[] {
  return [...missing];
}

// 复数段写在字典值里：`{count, article, articles}`，count 为 1 取第二段，否则第三段
const PLURAL_RE = /\{(\w+),\s*([^,{}]*?),\s*([^,{}]*?)\}/g;
const VAR_RE = /\{(\w+)\}/g;
const HAS_CJK = /[\u4e00-\u9fff]/;

/**
 * 插值。vars 里没有的占位符原样保留——rich() 要靠留下来的 `{doc}` 把 JSX 节点插回去。
 * 先处理复数段再替换变量，`{count}` 本身最后才变成数字。
 */
export function interpolate(text: string, vars?: TVars): string {
  if (!vars) return text;
  return text
    .replace(PLURAL_RE, (all, name: string, one: string, other: string) =>
      name in vars ? (Number(vars[name]) === 1 ? one : other) : all
    )
    .replace(VAR_RE, (all, name: string) => (name in vars ? String(vars[name]) : all));
}

/** 指定语言翻译：lib 里带显式 locale 参数的函数（便于测试）用它，平时用 t() */
export function translate(zh: string, locale: Locale, vars?: TVars): string {
  if (locale === "zh") return interpolate(zh, vars);
  // hasOwn：原文恰好是 "constructor" 之类时不能摸到原型链上的属性
  const hit = Object.hasOwn(en, zh) ? en[zh] : undefined;
  if (hit === undefined) {
    // 不含中文的多半是已经译过、又经过一层 t() 的英文或服务端原文，不算缺词
    if (isDev && HAS_CJK.test(zh) && !missing.has(zh)) {
      missing.add(zh);
      console.warn(`[i18n] missing en: ${JSON.stringify(zh)}`);
    }
    return interpolate(zh, vars);
  }
  return interpolate(hit, vars);
}

/** 翻译函数的类型：组件把 useT() 拿到的 t 传给模块级辅助函数时用 */
export type TFn = typeof t;

/** 按当前语言取文案。组件里请用 useT()，语言切换时才会跟着重渲染 */
export function t(zh: string, vars?: TVars): string {
  return translate(zh, getLocale(), vars);
}

/**
 * 只做标记、原样返回：模块顶层常量里的文案用它包住，渲染时再 t(常量)。
 * 顶层直接 t() 只会在模块加载时翻一次，切换语言后不变；
 * 用 tk() 包起来扫描脚本就知道这是已接管的 key，不再报成漏网的中文。
 */
export function tk<T extends string>(zh: T): T {
  return zh;
}
