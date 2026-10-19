import type { MetadataRoute } from "next";
import { absoluteUrl } from "@/lib/site";

/**
 * Only allow marketing pages. APIs, the editor and the OAuth consent page are worthless to search engines,
 * and /edit and /oauth carry user state, so indexing them is just noise.
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
