const attempts = new Map<string, { count: number; resetAt: number }>();

// Clean up stale entries periodically
setInterval(() => {
  const now = Date.now();
  for (const [key, val] of attempts) {
    if (now > val.resetAt) attempts.delete(key);
  }
}, 60_000);

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
