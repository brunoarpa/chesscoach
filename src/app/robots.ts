import type { MetadataRoute } from "next";
import { SITE_URL } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      // Keep private / authenticated / transactional areas out of the index.
      disallow: [
        "/api/",
        "/admin",
        "/dashboard",
        "/wallet",
        "/lesson",
        "/review",
        "/profile/edit",
        "/setup-username",
        "/forgot-password",
        "/reset-password",
        "/verify-email",
      ],
    },
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
