import {
  GITHUB_URL,
  OG_IMAGE,
  SITE_NAME,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site";
import type { LandingCopy } from "../content/types";
import { LANDING_PATH, type LandingLocale } from "../locales";

/**
 * Structured data; page-level strings (tagline, description, FAQ, features) come from the locale dictionary.
 * @graph ties WebSite / SoftwareApplication / FAQPage into one graph;
 * nodes reference each other by @id to avoid describing the same entity twice.
 */
function landingGraph(copy: LandingCopy, locale: LandingLocale) {
  // Site, app and publisher are the same entities in every language, so their @ids stay on `/`;
  // the page URL and its FAQ belong to this locale's page
  const appId = absoluteUrl("/#app");
  const siteId = absoluteUrl("/#website");
  const orgId = absoluteUrl("/#publisher");
  const pageUrl = absoluteUrl(LANDING_PATH[locale]);

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": orgId,
        name: SITE_NAME,
        url: SITE_URL,
        logo: absoluteUrl("/logo.svg"),
        sameAs: [GITHUB_URL],
      },
      {
        "@type": "WebSite",
        "@id": siteId,
        url: SITE_URL,
        name: `${SITE_NAME} · ${copy.chrome.tagline}`,
        description: copy.jsonLd.description,
        inLanguage: copy.lang,
        publisher: { "@id": orgId },
      },
      {
        "@type": "SoftwareApplication",
        "@id": appId,
        name: SITE_NAME,
        alternateName: copy.chrome.tagline,
        url: pageUrl,
        description: copy.jsonLd.description,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: copy.jsonLd.appSubCategory,
        operatingSystem: "Web, macOS",
        inLanguage: copy.lang,
        image: OG_IMAGE,
        softwareHelp: `${pageUrl}#faq`,
        featureList: copy.features.groups.flatMap((g) => g.items.map((i) => i.title)),
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: copy.jsonLd.priceCurrency,
          availability: "https://schema.org/InStock",
        },
        publisher: { "@id": orgId },
        isPartOf: { "@id": siteId },
      },
      {
        "@type": "FAQPage",
        "@id": `${pageUrl}#faq`,
        url: pageUrl,
        inLanguage: copy.lang,
        mainEntity: copy.faq.items.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

/** Themes page: a CollectionPage plus breadcrumbs so the theme list is machine-readable too */
function themesGraph(themes: { name: string; tag: string }[]) {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "CollectionPage",
        "@id": absoluteUrl("/themes#page"),
        url: absoluteUrl("/themes"),
        name: `${SITE_NAME} 公众号排版主题`,
        description: `${SITE_NAME} 内置的 ${themes.length} 套微信公众号排版主题，含完整样张与适用场景。`,
        inLanguage: "zh-CN",
        isPartOf: { "@id": absoluteUrl("/#website") },
        mainEntity: {
          "@type": "ItemList",
          numberOfItems: themes.length,
          itemListElement: themes.map((t, i) => ({
            "@type": "ListItem",
            position: i + 1,
            name: `${t.name}（${t.tag}）`,
          })),
        },
      },
      {
        "@type": "BreadcrumbList",
        itemListElement: [
          { "@type": "ListItem", position: 1, name: "首页", item: SITE_URL },
          { "@type": "ListItem", position: 2, name: "排版主题", item: absoluteUrl("/themes") },
        ],
      },
    ],
  };
}

/**
 * React outputs a script's text child as-is (no HTML escaping), which is exactly what JSON-LD needs;
 * the catch is that `</script>` inside a string would close the tag early, so every `<` becomes <.
 */
function Script({ data }: { data: object }) {
  return (
    <script type="application/ld+json">{JSON.stringify(data).replaceAll("<", "\\u003c")}</script>
  );
}

export function LandingJsonLd({ copy, locale }: { copy: LandingCopy; locale: LandingLocale }) {
  return <Script data={landingGraph(copy, locale)} />;
}

export function ThemesJsonLd({ themes }: { themes: { name: string; tag: string }[] }) {
  return <Script data={themesGraph(themes)} />;
}
