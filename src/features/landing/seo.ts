import type { Metadata } from "next";
import { OG_IMAGE, SITE_NAME, absoluteUrl } from "@/lib/site";
import { getLandingCopy } from "./content";
import { LANDING_HTML_LANG, LANDING_LOCALES, LANDING_OG_LOCALE, LANDING_PATH, type LandingLocale } from "./locales";

/**
 * hreflang map shared by every landing locale's <head> and the sitemap: each version lists all of them (itself included),
 * and x-default points at English, the best guess for a visitor whose language we don't publish.
 */
export function landingLanguages(absolute = false): Record<string, string> {
  const url = (p: string) => (absolute ? absoluteUrl(p) : p);
  const map: Record<string, string> = {};
  for (const l of LANDING_LOCALES) map[LANDING_HTML_LANG[l]] = url(LANDING_PATH[l]);
  map["x-default"] = url(LANDING_PATH.en);
  return map;
}

/**
 * Full metadata for one landing locale. Everything locale-dependent is set explicitly: Next merges page metadata
 * over the root layout's shallowly, so openGraph / twitter / alternates here replace the root's Chinese ones wholesale.
 */
export function landingMetadata(locale: LandingLocale): Metadata {
  const { seo } = getLandingCopy(locale);
  const path = LANDING_PATH[locale];
  return {
    // absolute: the root template would append 「｜xEdit」 to a title that already starts with the name
    title: { absolute: seo.title },
    description: seo.description,
    keywords: seo.keywords,
    alternates: { canonical: path, languages: landingLanguages() },
    openGraph: {
      type: "website",
      locale: LANDING_OG_LOCALE[locale],
      alternateLocale: LANDING_LOCALES.filter((l) => l !== locale).map((l) => LANDING_OG_LOCALE[l]),
      url: absoluteUrl(path),
      siteName: SITE_NAME,
      title: seo.title,
      description: seo.description,
      images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: seo.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: seo.title,
      description: seo.description,
      images: [OG_IMAGE],
    },
  };
}
