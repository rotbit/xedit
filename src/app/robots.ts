import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * 只放行营销页面。接口、编辑器、OAuth 授权页对搜索引擎无价值，
 * 且 /edit 与 /oauth 带用户态，收录了反而是噪声。
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: ["/api/", "/edit", "/oauth/", "/s/", "/.well-known/"],
      },
    ],
    sitemap: absoluteUrl("/sitemap.xml"),
  };
}
