import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/** 站点地图：目前只有落地页与主题展示页两张可收录页面 */
export default function sitemap(): MetadataRoute.Sitemap {
  const lastModified = new Date();
  return [
    {
      url: absoluteUrl("/"),
      lastModified,
      changeFrequency: "weekly",
      priority: 1,
    },
    {
      url: absoluteUrl("/themes"),
      lastModified,
      changeFrequency: "monthly",
      priority: 0.8,
    },
  ];
}
