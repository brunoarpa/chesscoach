import type { MetadataRoute } from "next";
import { prisma } from "@/lib/prisma";
import { SITE_URL } from "@/lib/site";

// Re-crawl-friendly: rebuild the sitemap at most once a day rather than
// hitting the DB on every crawler request.
export const revalidate = 86400;

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const staticRoutes: MetadataRoute.Sitemap = [
    { url: `${SITE_URL}/`, changeFrequency: "daily", priority: 1 },
    { url: `${SITE_URL}/search`, changeFrequency: "daily", priority: 0.9 },
    { url: `${SITE_URL}/signup`, changeFrequency: "monthly", priority: 0.6 },
    { url: `${SITE_URL}/login`, changeFrequency: "monthly", priority: 0.4 },
    { url: `${SITE_URL}/contact`, changeFrequency: "yearly", priority: 0.3 },
    { url: `${SITE_URL}/terms`, changeFrequency: "yearly", priority: 0.2 },
    { url: `${SITE_URL}/privacy`, changeFrequency: "yearly", priority: 0.2 },
  ];

  // Public coach profiles: same filter the search page uses
  // (not suspended, has a chat or call price), with a usable username.
  const coaches = await prisma.user.findMany({
    where: {
      isSuspended: false,
      username: { not: null },
      OR: [{ coachChatPrice: { not: null } }, { coachCallPrice: { not: null } }],
    },
    select: { username: true, updatedAt: true },
  });

  const coachRoutes: MetadataRoute.Sitemap = coaches.map((coach) => ({
    url: `${SITE_URL}/profile/${coach.username}`,
    lastModified: coach.updatedAt,
    changeFrequency: "weekly",
    priority: 0.8,
  }));

  return [...staticRoutes, ...coachRoutes];
}
