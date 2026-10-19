/**
 * Gets the UI language for the current request on the server: same logic as the root layout, cookie first, then Accept-Language.
 * The server can't use module-level t() -- that variable is shared by all requests; use translate(zh, locale) with the locale instead.
 */
import { cookies, headers } from "next/headers";
import { detectLocale, LANG_COOKIE, type Locale } from "./locale";

/** For RSC pages: reads next/headers */
export async function requestLocale(): Promise<Locale> {
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  return detectLocale(cookieStore.get(LANG_COOKIE)?.value, headerList.get("accept-language"));
}

/** For route handlers: inspects the passed-in Request without relying on request context, so unit tests can just construct a Request */
export function localeOfRequest(req: Request): Locale {
  const cookie = req.headers.get("cookie") ?? "";
  const value = cookie
    .split(";")
    .map((p) => p.trim())
    .find((p) => p.startsWith(`${LANG_COOKIE}=`))
    ?.slice(LANG_COOKIE.length + 1);
  return detectLocale(value, req.headers.get("accept-language"));
}
