import type { Metadata, Viewport } from "next";
import { cookies, headers } from "next/headers";
import "./globals.css";
import { auth } from "@/auth";
import { Providers } from "@/components/Providers";
import { LANDING_HTML_LANG, LANDING_LOCALE_HEADER, isLandingLocale } from "@/features/landing/locales";
import { detectLocale, htmlLang, LANG_COOKIE } from "@/i18n/locale";
import {
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_KEYWORDS,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
} from "@/lib/site";

export const metadata: Metadata = {
  // With metadataBase set, each page's relative canonical / OG image paths become absolute URLs
  metadataBase: new URL(SITE_URL),
  title: {
    default: `${SITE_NAME} · ${SITE_TAGLINE}`,
    template: `%s｜${SITE_NAME}`,
  },
  description: SITE_DESCRIPTION,
  keywords: SITE_KEYWORDS,
  applicationName: SITE_NAME,
  authors: [{ name: SITE_NAME, url: SITE_URL }],
  creator: SITE_NAME,
  publisher: SITE_NAME,
  alternates: { canonical: "/" },
  robots: {
    index: true,
    follow: true,
    googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1 },
  },
  openGraph: {
    type: "website",
    locale: "zh_CN",
    url: SITE_URL,
    siteName: SITE_NAME,
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: `${SITE_NAME} — ${SITE_TAGLINE}` }],
  },
  twitter: {
    card: "summary_large_image",
    title: `${SITE_NAME} · ${SITE_TAGLINE}`,
    description: SITE_DESCRIPTION,
    images: [OG_IMAGE],
  },
  formatDetection: { telephone: false, email: false, address: false },
};

/**
 * Three things that must run before the browser's first paint, or it flickers:
 * 1) Mark the macOS desktop shell (Electron hides the system title bar, so the top bar must leave room for the traffic lights);
 *    preload also sets this on DOMContentLoaded, but doing it earlier here keeps the top bar from jumping;
 * 2) Restore the dark mode preference (avoids a white flash);
 * 3) Detect whether this machine already has a workspace (data-ws), so returning users get the landing page covered by CSS on this frame.
 * 2 and 3 get their own try: if localStorage is unavailable (private mode), it mustn't swallow 1 too.
 * Inlined rather than linking /theme-init.js: saves a render-blocking network round trip.
 * (public/theme-init.js is kept as a fallback for old HTML cached in the SW offline shell.)
 * A compile-time static string with no runtime input concatenated, so it's safe to inject.
 */
const THEME_INIT_SCRIPT = `try{if(window.xeditDesktop&&window.xeditDesktop.platform==="darwin")document.documentElement.classList.add("desktop-mac")}catch(e){}try{if(localStorage.getItem("xedit-dark")==="1")document.documentElement.dataset.theme="dark";var d=localStorage.getItem("xedit-local-docs");if(localStorage.getItem("xedit-was-authed")==="1"||localStorage.getItem("xedit-vault")==="1"||(d&&d!=="[]"))document.documentElement.dataset.ws="1"}catch(e){}`;

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#fafafa" },
    { media: "(prefers-color-scheme: dark)", color: "#161616" },
  ],
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  // Resolve the session on the server and ship it with the HTML: SessionProvider skips the client's first-frame /api/auth/session
  // round trip, so login-dependent data requests (doc mirror, settings, etc.) are no longer held up ~1s by it
  const session = await auth();
  // UI language: cookie first, Accept-Language on first visit. The layout is already dynamic because of auth(), so reading headers costs nothing extra
  const [cookieStore, headerList] = await Promise.all([cookies(), headers()]);
  // /en and /ja are tagged by src/proxy.ts: the page's language wins over the product cookie there, and since the
  // app has no Japanese, any product UI on those pages (login dialog etc.) is English
  const landingLocale = headerList.get(LANDING_LOCALE_HEADER);
  const pageLocale = isLandingLocale(landingLocale) && landingLocale !== "zh" ? landingLocale : null;
  const locale = pageLocale
    ? "en"
    : detectLocale(cookieStore.get(LANG_COOKIE)?.value, headerList.get("accept-language"));
  return (
    <html
      lang={pageLocale ? LANDING_HTML_LANG[pageLocale] : htmlLang(locale)}
      className="h-full"
      suppressHydrationWarning
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="h-full overflow-hidden">
        <Providers session={session} locale={locale}>{children}</Providers>
      </body>
    </html>
  );
}
