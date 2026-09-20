import type { MetadataRoute } from "next";
import { CHANGELOG } from "@/features/changelog/data";
import { absoluteUrl } from "@/lib/site";

/** 站点地图：落地页、主题展示页、更新日志三张可收录页面 */
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
    {
      url: absoluteUrl("/changelog"),
      // 日志最新一条的日期就是这页上次变动的时间
      lastModified: new Date(CHANGELOG[0].date),
      changeFrequency: "weekly",
      priority: 0.5,
    },
  ];
}
