import { prisma } from "@/lib/prisma";

export async function rateLimit(
  key: string,
  { maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}
): Promise<{ success: boolean; remaining: number }> {
  const now = new Date();

  // Try to find an existing entry
  const entry = await prisma.rateLimitEntry.findUnique({ where: { key } });

  if (!entry || now >= entry.resetAt) {
    // Expired or no entry — start a new window
    await prisma.rateLimitEntry.upsert({
      where: { key },
      update: { count: 1, resetAt: new Date(Date.now() + windowMs) },
      create: { key, count: 1, resetAt: new Date(Date.now() + windowMs) },
    });
    return { success: true, remaining: maxAttempts - 1 };
  }

  if (entry.count >= maxAttempts) {
    return { success: false, remaining: 0 };
  }

  // Increment count
  await prisma.rateLimitEntry.update({
    where: { key },
    data: { count: { increment: 1 } },
  });

  return { success: true, remaining: maxAttempts - (entry.count + 1) };
}

/**
 * Extract client IP from request headers.
 * Falls back to a unique-per-request identifier to prevent all unknown IPs
 * from sharing a single rate limit bucket.
 */
export function getClientIpFromHeaders(h: Headers): string {
  // In Vercel/Cloudflare, use platform-provided headers first
  const vercelIp = h.get("x-vercel-forwarded-for");
  if (vercelIp) return vercelIp.split(",")[0].trim();

  const realIp = h.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = h.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();

  // If no IP can be determined, use a restrictive fallback
  // rather than "unknown" which would share a single bucket
  return "no-ip-" + Date.now().toString(36);
}
