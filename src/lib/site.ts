// Canonical production origin, used for SEO metadata, sitemap and robots.
// Hardcoded to the real domain so a misconfigured NEXT_PUBLIC_APP_URL
// (e.g. localhost during a build) can never leak into the public sitemap.
// Note: www is canonical; the non-www apex 308-redirects to www on Vercel.
export const SITE_URL = "https://www.elochaser.com";
