import {
  GITHUB_URL,
  OG_IMAGE,
  SITE_DESCRIPTION,
  SITE_NAME,
  SITE_TAGLINE,
  SITE_URL,
  absoluteUrl,
} from "@/lib/site";
import { FAQ, FEATURE_GROUPS } from "../data";

/**
 * 结构化数据。用 @graph 把 WebSite / SoftwareApplication / FAQPage 串成一张图，
 * 各节点靠 @id 互相引用，避免重复描述同一个实体。
 */
function landingGraph() {
  const appId = absoluteUrl("/#app");
  const siteId = absoluteUrl("/#website");
  const orgId = absoluteUrl("/#publisher");

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
        name: `${SITE_NAME} · ${SITE_TAGLINE}`,
        description: SITE_DESCRIPTION,
        inLanguage: "zh-CN",
        publisher: { "@id": orgId },
      },
      {
        "@type": "SoftwareApplication",
        "@id": appId,
        name: SITE_NAME,
        alternateName: SITE_TAGLINE,
        url: SITE_URL,
        description: SITE_DESCRIPTION,
        applicationCategory: "BusinessApplication",
        applicationSubCategory: "文本编辑与排版",
        operatingSystem: "Web, macOS",
        inLanguage: "zh-CN",
        image: OG_IMAGE,
        softwareHelp: absoluteUrl("/#faq"),
        featureList: FEATURE_GROUPS.flatMap((g) => g.items.map((i) => i.title)),
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "CNY",
          availability: "https://schema.org/InStock",
        },
        publisher: { "@id": orgId },
        isPartOf: { "@id": siteId },
      },
      {
        "@type": "FAQPage",
        "@id": absoluteUrl("/#faq"),
        mainEntity: FAQ.map((item) => ({
          "@type": "Question",
          name: item.q,
          acceptedAnswer: { "@type": "Answer", text: item.a },
        })),
      },
    ],
  };
}

/** 主题页：一条 CollectionPage + 面包屑，让主题清单也能被结构化理解 */
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
 * React 会把 script 的文本子节点原样输出（不做 HTML 转义），正合 JSON-LD 所需；
 * 代价是字符串里的 `</script>` 会提前闭合标签，所以统一把 `<` 转成 \u003c。
 */
function Script({ data }: { data: object }) {
  return (
    <script type="application/ld+json">{JSON.stringify(data).replaceAll("<", "\\u003c")}</script>
  );
}

export function LandingJsonLd() {
  return <Script data={landingGraph()} />;
}

export function ThemesJsonLd({ themes }: { themes: { name: string; tag: string }[] }) {
  return <Script data={themesGraph(themes)} />;
}
