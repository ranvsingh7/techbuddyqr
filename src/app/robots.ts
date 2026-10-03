import type { MetadataRoute } from "next";

/**
 * Admin screens, the API and the scan endpoint hold private or per-request data,
 * so none of them belong in a search index. `/activate` and `/` stay crawlable.
 */
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: ["/admin", "/api", "/q"] }],
  };
}
