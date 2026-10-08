/**
 * 界面语言：只是用户偏好，不进路由（没有 /en/...）。
 * 存在 cookie 里而不是 localStorage：根布局在服务端就要知道语言，
 * 才能直接渲染出对的 <html lang> 和首屏文案，不用客户端再翻一遍造成闪烁。
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
 * cookie 优先（用户手动选过）；没有就看 Accept-Language 的第一个语言：
 * 中文（zh、zh-CN、zh-TW…）给中文，其余一律英文——非中文用户看英文总比看中文强。
 * 两样都没有（爬虫、curl）落回中文，和产品的主要受众一致。
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
 * 模块级当前语言。初值按 <html lang> 推：服务端已经按 cookie 写好了 lang，
 * 这样在 Provider 挂上之前就执行的 t()（模块顶层常量等）也能拿到对的语言。
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
 * Provider 首帧把服务端判定的语言灌进来。
 * 浏览器里只认第一次：之后用户切换过语言，Provider 重渲染时再调用不能把它改回去。
 * 服务端每次都覆盖：模块变量在服务端是所有请求共享的，只能尽量贴近当前这次请求；
 * 所以组件里要用 useT()（读 context，SSR 下也准），模块级 t() 留给事件回调和 lib。
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

/** 用户切换语言：写 cookie（下次请求服务端就按它渲染）、改 lang、通知 Provider 重渲染 */
export function setLocale(next: Locale): void {
  current = next;
  initialized = true;
  if (typeof document === "undefined") return;
  document.cookie = `${LANG_COOKIE}=${next}; max-age=${ONE_YEAR}; path=/; SameSite=Lax`;
  if (document.documentElement) document.documentElement.lang = htmlLang(next);
  window.dispatchEvent(new CustomEvent(LOCALE_CHANGED_EVENT));
}
