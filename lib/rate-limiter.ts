// In-memory rate limiting (use Redis in production for distributed rate limiting)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
export const RATE_LIMIT_WINDOW_MS = 60000 // 60 seconds

// Keys that stop sending would otherwise stay in the map forever, so every new-window write
// also sweeps expired entries. Sweeping is O(n) per new window rather than per request; the
// rate-limit window bounds how often any one key can trigger it.
let nextSweepAt = 0

function sweepExpired(now: number): void {
  if (now < nextSweepAt) return
  for (const [key, record] of rateLimitMap) {
    if (now >= record.resetTime) rateLimitMap.delete(key)
  }
  nextSweepAt = now + RATE_LIMIT_WINDOW_MS
}

/** Number of keys currently tracked. Diagnostic; used by tests to observe eviction. */
export function rateLimiterSize(): number {
  return rateLimitMap.size
}

/** Clears all rate-limit state. Exists so tests can reset the in-memory limiter between cases. */
export function resetRateLimiter(): void {
  rateLimitMap.clear()
  nextSweepAt = 0
}

export function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)

  if (!record || now >= record.resetTime) {
    // New window or expired window
    sweepExpired(now)
    rateLimitMap.set(ip, {
      count: 1,
      resetTime: now + RATE_LIMIT_WINDOW_MS,
    })
    return true
  }

  if (record.count >= limit) {
    return false
  }

  // Note: record.count++ is non-atomic. Under high concurrency, more requests may pass than the limit. Use Redis for production rate limiting.
  record.count++
  return true
}

export function getRateLimitRetryAfter(ip: string): number {
  const record = rateLimitMap.get(ip)
  if (!record) return 60

  const now = Date.now()
  const secondsUntilReset = Math.ceil((record.resetTime - now) / 1000)
  return Math.max(1, secondsUntilReset)
}
