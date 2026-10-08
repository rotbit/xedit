/**
 * 服务端取本次请求的界面语言：和根布局同一套判定，cookie 优先、再看 Accept-Language。
 * 服务端不能用模块级 t()——那个变量是所有请求共享的；拿到 locale 后配合 translate(zh, locale) 用。
 */
import { cookies, headers } from "next/headers";
import { detectLocale, LANG_COOKIE, type Locale } from "./locale";

/** RSC 页面用：读 next/headers */
export async function requestLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return detectLocale(cookieStore.get(LANG_COOKIE)?.value, headerList.get("accept-language"));
}

/** route handler 用：直接看传进来的 Request，不依赖请求上下文，单测里直接构造 Request 也能跑 */
export function localeOfRequest(req: Request): Locale {
  const cookie = req.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LANG_COOKIE}=`))
    ?.slice(LANG_COOKIE.length + 1);
  return detectLocale(value, req.headers.get("accept-language"));
}
