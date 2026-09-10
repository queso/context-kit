import { afterEach, beforeEach, describe, expect, it, jest } from "bun:test"
import {
  checkRateLimit,
  getRateLimitRetryAfter,
  RATE_LIMIT_WINDOW_MS,
  rateLimiterSize,
  resetRateLimiter,
} from "@/lib/rate-limiter"

beforeEach(() => {
  resetRateLimiter()
})

describe("checkRateLimit", () => {
  it("allows up to the limit within a window", () => {
    expect(checkRateLimit("1.1.1.1", 3)).toBe(true)
    expect(checkRateLimit("1.1.1.1", 3)).toBe(true)
    expect(checkRateLimit("1.1.1.1", 3)).toBe(true)
  })

  it("rejects the request after the limit is reached", () => {
    checkRateLimit("1.1.1.1", 2)
    checkRateLimit("1.1.1.1", 2)

    expect(checkRateLimit("1.1.1.1", 2)).toBe(false)
  })

  it("tracks separate budgets per key", () => {
    checkRateLimit("1.1.1.1", 1)

    expect(checkRateLimit("1.1.1.1", 1)).toBe(false)
    expect(checkRateLimit("2.2.2.2", 1)).toBe(true)
  })

  describe("with fake timers", () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.clearAllTimers()
      jest.useRealTimers()
    })

    it("resets the window after RATE_LIMIT_WINDOW_MS elapses", () => {
      checkRateLimit("1.1.1.1", 1)
      expect(checkRateLimit("1.1.1.1", 1)).toBe(false)

      jest.advanceTimersByTime(RATE_LIMIT_WINDOW_MS)

      expect(checkRateLimit("1.1.1.1", 1)).toBe(true)
    })
  })
})

describe("getRateLimitRetryAfter", () => {
  it("returns 60 for a key with no recorded requests", () => {
    expect(getRateLimitRetryAfter("unknown")).toBe(60)
  })

  it("returns at least 1 second until the window resets", () => {
    checkRateLimit("1.1.1.1", 1)

    expect(getRateLimitRetryAfter("1.1.1.1")).toBeGreaterThanOrEqual(1)
  })

  describe("with fake timers", () => {
    beforeEach(() => {
      jest.useFakeTimers()
    })

    afterEach(() => {
      jest.clearAllTimers()
      jest.useRealTimers()
    })

    it("counts down toward 1 as the window elapses", () => {
      checkRateLimit("1.1.1.1", 1)

      jest.advanceTimersByTime(RATE_LIMIT_WINDOW_MS - 1000)

      expect(getRateLimitRetryAfter("1.1.1.1")).toBe(1)
    })
  })
})

describe("resetRateLimiter", () => {
  it("clears recorded state so the next request starts a fresh window", () => {
    checkRateLimit("1.1.1.1", 1)
    expect(checkRateLimit("1.1.1.1", 1)).toBe(false)

    resetRateLimiter()

    expect(checkRateLimit("1.1.1.1", 1)).toBe(true)
  })
})

describe("expired entry eviction", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  it("drops entries for keys that stopped sending once their window has expired", () => {
    checkRateLimit("1.1.1.1", 5)
    checkRateLimit("2.2.2.2", 5)
    expect(rateLimiterSize()).toBe(2)

    jest.advanceTimersByTime(RATE_LIMIT_WINDOW_MS + 1)
    // A request from a third key triggers the sweep; the two idle keys are gone.
    checkRateLimit("3.3.3.3", 5)

    expect(rateLimiterSize()).toBe(1)
  })
})
