import { NextResponse, type NextRequest } from "next/server";
import { LANDING_LOCALE_HEADER } from "@/features/landing/locales";

/**
 * Tags /en and /ja requests with their landing locale so the root layout can set <html lang>.
 *
 * Why a proxy header rather than separate root layouts per route group: the root layout must stay shared
 * (session, theme-init script, Providers), and splitting it would mean moving every app route under a group.
 * The layout can't see the pathname itself, so the proxy hands it over as a request header. The trade-off:
 * client-side navigation keeps the layout, so the landing language switcher uses full document loads.
 */
export function proxy(request: NextRequest) {
  const headers = new Headers(request.headers);
  headers.set(LANDING_LOCALE_HEADER, request.nextUrl.pathname.slice(1));
  return NextResponse.next({ request: { headers } });
}

export const config = {
  matcher: ["/en", "/ja"],
};
