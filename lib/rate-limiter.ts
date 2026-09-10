// In-memory rate limiting (use Redis in production for distributed rate limiting)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>()
export const RATE_LIMIT_WINDOW_MS = 60000 // 60 seconds

/** Clears all rate-limit state. Exists so tests can reset the in-memory limiter between cases. */
export function resetRateLimiter(): void {
  rateLimitMap.clear()
}

export function checkRateLimit(ip: string, limit: number): boolean {
  const now = Date.now()
  const record = rateLimitMap.get(ip)

  if (!record || now >= record.resetTime) {
    // New window or expired window
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
