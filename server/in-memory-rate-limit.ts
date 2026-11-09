type RateLimitResult = {
  success: boolean;
  reset: number;
};

type RateLimitEntry = {
  count: number;
  reset: number;
};

export function createInMemoryRateLimiter(
  maximum: number,
  windowMs: number,
  maximumKeys = 10_000,
): (key: string) => Promise<RateLimitResult> {
  if (!Number.isInteger(maximum) || maximum < 1) {
    throw new Error("Rate-limit maximum must be a positive integer.");
  }
  if (!Number.isFinite(windowMs) || windowMs < 1) {
    throw new Error("Rate-limit window must be a positive duration.");
  }
  if (!Number.isInteger(maximumKeys) || maximumKeys < 1) {
    throw new Error("Rate-limit key capacity must be a positive integer.");
  }

  const entries = new Map<string, RateLimitEntry>();
  return async (key) => {
    const now = Date.now();
    for (const [entryKey, entry] of entries) {
      if (entry.reset <= now) entries.delete(entryKey);
    }

    const existing = entries.get(key);
    if (existing && existing.reset > now) {
      if (existing.count >= maximum) {
        return { success: false, reset: existing.reset };
      }
      existing.count += 1;
      return { success: true, reset: existing.reset };
    }

    if (entries.size >= maximumKeys) {
      const earliestReset = Math.min(...Array.from(entries.values(), (entry) => entry.reset));
      return { success: false, reset: earliestReset };
    }

    const reset = now + windowMs;
    entries.set(key, { count: 1, reset });
    return { success: true, reset };
  };
}
