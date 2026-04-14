const attempts = new Map<string, { count: number; resetAt: number }>();

// Clean up stale entries periodically
if (typeof globalThis !== "undefined") {
  // Avoid duplicate intervals in dev with hot reload
  const g = globalThis as unknown as { _rateLimitCleanup?: ReturnType<typeof setInterval> };
  if (!g._rateLimitCleanup) {
    g._rateLimitCleanup = setInterval(() => {
      const now = Date.now();
      for (const [key, val] of attempts) {
        if (now > val.resetAt) attempts.delete(key);
      }
    }, 60_000);
  }
}

export function rateLimit(
  key: string,
  { maxAttempts = 5, windowMs = 15 * 60 * 1000 } = {}
): { success: boolean; remaining: number } {
  const now = Date.now();
  const entry = attempts.get(key);

  if (!entry || now > entry.resetAt) {
    attempts.set(key, { count: 1, resetAt: now + windowMs });
    return { success: true, remaining: maxAttempts - 1 };
  }

  if (entry.count >= maxAttempts) {
    return { success: false, remaining: 0 };
  }

  entry.count++;
  return { success: true, remaining: maxAttempts - entry.count };
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
