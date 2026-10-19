import type { MetadataRoute } from "next";
import { CHANGELOG } from "@/features/changelog/data";
import { LANDING_LOCALES, LANDING_PATH } from "@/features/landing/locales";
import { landingLanguages } from "@/features/landing/seo";
import { absoluteUrl } from "@/lib/site";

/** Sitemap: the landing page in each language (cross-linked by hreflang), theme gallery and changelog */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  const languages = landingLanguages(true);
  return [
    ...LANDING_LOCALES.map((l) => ({
      url: absoluteUrl(LANDING_PATH[l]),
      lastModified,
      changeFrequency: "weekly" as const,
      priority: l === "zh" ? 1 : 0.9,
      alternates: { languages },
    })),
    {
      url: absoluteUrl("/themes"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
    {
      url: absoluteUrl("/changelog"),
      // The latest changelog entry's date is when this page last changed
      lastModified: new Date(CHANGELOG[0].date),
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];
}
