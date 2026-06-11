import { prisma } from "@/lib/prisma";

export async function rateLimit(
  key: string,
  { maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}
): Promise<{ success: boolean; remaining: number }> {
  const now = new Date();

  // Each step below is a single conditional write, so concurrent requests
  // can't race past the cap the way a read-then-increment would.

  // 1. If a window exists but has expired, atomically restart it.
  const restarted = await prisma.rateLimitEntry.updateMany({
    where: { key, resetAt: { lte: now } },
    data: { count: 1, resetAt: new Date(now.getTime() + windowMs) },
  });
  if (restarted.count > 0) {
    return { success: true, remaining: maxAttempts - 1 };
  }

  // 2. Try to claim an attempt inside the live window, guarded on the cap.
  const incremented = await prisma.rateLimitEntry.updateMany({
    where: { key, resetAt: { gt: now }, count: { lt: maxAttempts } },
    data: { count: { increment: 1 } },
  });
  if (incremented.count > 0) {
    const entry = await prisma.rateLimitEntry.findUnique({ where: { key } });
    return { success: true, remaining: Math.max(0, maxAttempts - (entry?.count ?? maxAttempts)) };
  }

  // 3. Neither write matched: either no entry exists yet, or the cap is hit.
  const entry = await prisma.rateLimitEntry.findUnique({ where: { key } });
  if (entry && entry.resetAt > now) {
    return { success: false, remaining: 0 };
  }

  try {
    await prisma.rateLimitEntry.create({
      data: { key, count: 1, resetAt: new Date(now.getTime() + windowMs) },
    });
    return { success: true, remaining: maxAttempts - 1 };
  } catch {
    // Unique violation: another request created the entry between our check and
    // create. Retry the guarded increment once; if that also misses, the
    // concurrent burst already used the window's attempts.
    const retried = await prisma.rateLimitEntry.updateMany({
      where: { key, resetAt: { gt: now }, count: { lt: maxAttempts } },
      data: { count: { increment: 1 } },
    });
    return retried.count > 0
      ? { success: true, remaining: 0 }
      : { success: false, remaining: 0 };
  }
}

/**
 * Clear a rate-limit bucket, e.g. after a successful login so earlier failed
 * attempts don't count against the user's next session.
 */
export async function resetRateLimit(key: string): Promise<void> {
  await prisma.rateLimitEntry.deleteMany({ where: { key } });
}

/**
 * Extract client IP from request headers.
 *
 * NOTE: x-real-ip / x-forwarded-for are client-forgeable unless a trusted proxy
 * (Vercel, Cloudflare, nginx) overwrites them. IP-keyed limits are best-effort
 * abuse friction, not a security boundary — anything critical must also be
 * limited per-account.
 *
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
