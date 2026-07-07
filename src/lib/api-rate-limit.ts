type RateLimitRule = {
  windowMs: number;
  maxRequests: number;
};

type RateLimitEntry = {
  count: number;
  resetAt: number;
};

const RATE_LIMITS = new Map<string, RateLimitEntry>();

export function hitRateLimit(key: string, rule: RateLimitRule) {
  const now = Date.now();
  const existing = RATE_LIMITS.get(key);

  if (!existing || now >= existing.resetAt) {
    RATE_LIMITS.set(key, {
      count: 1,
      resetAt: now + rule.windowMs,
    });

    return {
      limited: false,
      remaining: rule.maxRequests - 1,
      resetAt: now + rule.windowMs,
    };
  }

  if (existing.count >= rule.maxRequests) {
    return {
      limited: true,
      remaining: 0,
      resetAt: existing.resetAt,
    };
  }

  existing.count += 1;
  RATE_LIMITS.set(key, existing);

  return {
    limited: false,
    remaining: Math.max(0, rule.maxRequests - existing.count),
    resetAt: existing.resetAt,
  };
}
