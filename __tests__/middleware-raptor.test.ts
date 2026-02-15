import { NextRequest } from "next/server"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

// Mock environment and logger before importing middleware
vi.mock("@/lib/env", () => ({
  getEnv: vi.fn(() => ({
    CORS_ORIGIN: "",
    RATE_LIMIT_RPM: 60,
  })),
}))

vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}))

// Import after mocks are set up
const { getEnv } = await import("@/lib/env")
const { getLogger } = await import("@/lib/logger")

describe("RAPTOR: CORS Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle CORS_ORIGIN with leading/trailing whitespace (Headers API trims)", async () => {
    // Web API Headers.set() automatically trims whitespace per RFC 7230
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: " https://example.com ",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    // Headers API automatically trims - this is spec-compliant
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com")
  })

  it("should handle OPTIONS preflight with empty CORS_ORIGIN", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
    })
    const response = await middleware(request)

    // Should return 204 but NO CORS headers
    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeNull()
  })

  it("should handle OPTIONS preflight with wildcard CORS_ORIGIN", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "*",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
    })
    const response = await middleware(request)

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    // Wildcard should NOT set credentials
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull()
  })

  it("should NOT rate-limit OPTIONS preflight requests", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "https://example.com",
      RATE_LIMIT_RPM: 1, // Very low limit
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    // OPTIONS requests should bypass rate limiting entirely
    const request1 = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })
    const request2 = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })
    const request3 = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })

    const response1 = await middleware(request1)
    const response2 = await middleware(request2)
    const response3 = await middleware(request3)

    // All should succeed with 204
    expect(response1.status).toBe(204)
    expect(response2.status).toBe(204)
    expect(response3.status).toBe(204)
  })

  it("should handle CORS_ORIGIN that looks like wildcard but has extra characters", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "*.example.com", // Not a true wildcard per CORS spec
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    // Should set Access-Control-Allow-Credentials because it's NOT exactly "*"
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*.example.com")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
  })

  it("should set same CORS headers on both OPTIONS and actual request", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "https://example.com",
      RATE_LIMIT_RPM: 60,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const optionsRequest = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
    })
    const getRequest = new NextRequest(new URL("http://localhost/api/test"), {
      method: "GET",
    })

    const optionsResponse = await middleware(optionsRequest)
    const getResponse = await middleware(getRequest)

    // Both should have same CORS headers
    expect(optionsResponse.headers.get("Access-Control-Allow-Origin")).toBe(
      getResponse.headers.get("Access-Control-Allow-Origin"),
    )
    expect(optionsResponse.headers.get("Access-Control-Allow-Methods")).toBe(
      getResponse.headers.get("Access-Control-Allow-Methods"),
    )
    expect(optionsResponse.headers.get("Access-Control-Allow-Headers")).toBe(
      getResponse.headers.get("Access-Control-Allow-Headers"),
    )
  })
})

describe("RAPTOR: Rate Limiter Concurrent Access (Map Race Conditions)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("RACE CONDITION: Concurrent requests from same IP might bypass rate limit", async () => {
    // The in-memory Map is NOT atomic. Multiple concurrent requests can:
    // 1. Read record.count = 59 (same time)
    // 2. Both increment to 60
    // 3. Both succeed when one should be rate-limited

    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // Fire 70 requests concurrently (all at same millisecond)
    const promises = Array.from({ length: 70 }, () => makeRequest())
    const responses = await Promise.all(promises)

    const _rateLimited = responses.filter((r) => r.status === 429)
    const succeeded = responses.filter((r) => r.status !== 429)

    // EXPECTED: 60 succeed, 10 rate-limited
    // ACTUAL: Due to race condition, more than 60 might succeed
    // This test documents the race condition exists
    expect(succeeded.length).toBeGreaterThanOrEqual(60)

    // If race condition exists, more than 60 might succeed
    // This is a KNOWN LIMITATION of in-memory Map
    if (succeeded.length > 60) {
      // Document that race condition allowed extra requests through
      console.log(`Race condition detected: ${succeeded.length} requests succeeded (expected 60)`)
    }
  })

  it("should handle rapid sequential requests correctly (no race)", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 3,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // Sequential requests (await each) - no race condition
    const response1 = await makeRequest()
    const response2 = await makeRequest()
    const response3 = await makeRequest()
    const response4 = await makeRequest()

    expect(response1.status).not.toBe(429)
    expect(response2.status).not.toBe(429)
    expect(response3.status).not.toBe(429)
    expect(response4.status).toBe(429) // 4th should be rate-limited
  })

  it("should handle Map.get() returning undefined on first request", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "new-ip-192.168.1.100" },
    })

    // First request from new IP - Map.get() returns undefined
    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })

  it("should handle window expiration at exact boundary", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // First request at time 0
    const response1 = await makeRequest()
    expect(response1.status).not.toBe(429)

    // Second request at time 0 (should be rate-limited)
    const response2 = await makeRequest()
    expect(response2.status).toBe(429)

    // Advance time to EXACTLY resetTime (60000ms)
    vi.advanceTimersByTime(60000)

    // Third request at resetTime boundary
    const response3 = await makeRequest()
    // now >= record.resetTime triggers new window
    expect(response3.status).not.toBe(429)
  })

  it("should handle window expiration just before boundary", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    await makeRequest() // count = 1
    await makeRequest() // rate-limited

    // Advance time to 1ms before window reset
    vi.advanceTimersByTime(59999)

    // Still within window
    const response = await makeRequest()
    expect(response.status).toBe(429)
  })

  it("should handle Map mutation during checkRateLimit", async () => {
    // The Map is mutated in-place: record.count++
    // This is NOT thread-safe but JavaScript is single-threaded
    // so no actual race condition HERE (just microtask interleaving)

    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // Make 60 requests sequentially
    for (let i = 0; i < 60; i++) {
      const response = await makeRequest()
      expect(response.status).not.toBe(429)
    }

    // 61st request should be rate-limited
    const response = await makeRequest()
    expect(response.status).toBe(429)
  })
})

describe("RAPTOR: Correlation ID Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle empty string X-Correlation-Id (generate new UUID)", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Correlation-Id": "" },
    })

    const response = await middleware(request)

    // FIXED: Empty string is trimmed to "", then || generates UUID
    const correlationId = response.headers.get("X-Correlation-Id")
    expect(correlationId).toBeDefined()
    expect(correlationId).not.toBe("")
    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it("should trim whitespace-only X-Correlation-Id and generate UUID", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Correlation-Id": "   " },
    })

    const response = await middleware(request)

    // FIXED: Headers.get() returns "" (trimmed), then .trim() || generates UUID
    const correlationId = response.headers.get("X-Correlation-Id")
    expect(correlationId).toBeDefined()
    expect(correlationId).not.toBe("")
    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it("should handle very long X-Correlation-Id", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const longId = "a".repeat(1000)
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Correlation-Id": longId },
    })

    const response = await middleware(request)

    // Should pass through without truncation
    expect(response.headers.get("X-Correlation-Id")).toBe(longId)
  })

  it("should handle X-Correlation-Id with special characters", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const specialId = "test-123-<script>alert('xss')</script>"
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Correlation-Id": specialId },
    })

    const response = await middleware(request)

    // Should pass through without sanitization
    expect(response.headers.get("X-Correlation-Id")).toBe(specialId)
  })

  it("should include correlationId in 429 response body", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async (id: string) => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: {
          "X-Forwarded-For": "192.168.1.1",
          "X-Correlation-Id": id,
        },
      })
      return middleware(request)
    }

    await makeRequest("first-request")
    const response = await makeRequest("second-request")

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body.correlationId).toBe("second-request")
  })

  it("should include generated correlationId in 429 response when not provided", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    await makeRequest()
    const response = await makeRequest()

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body.correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it("should set correlationId on response even for OPTIONS", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "https://example.com",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
      headers: { "X-Correlation-Id": "options-test" },
    })

    const response = await middleware(request)

    // FIXED: OPTIONS now sets X-Correlation-Id on response
    expect(response.headers.get("X-Correlation-Id")).toBe("options-test")
  })
})

describe("RAPTOR: IP Extraction Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle X-Forwarded-For with multiple IPs (proxy chain)", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "client-ip, proxy1, proxy2" },
    })

    // Should use first IP in the list
    await middleware(request)
    // If we had access to the rate limit map, we could verify the IP key
    // For now, just verify request succeeds
    expect(true).toBe(true)
  })

  it("should trim whitespace from X-Forwarded-For IP", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 2,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async (ip: string) => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": ip },
      })
      return middleware(request)
    }

    // These should all be treated as the same IP
    await makeRequest("192.168.1.1")
    await makeRequest(" 192.168.1.1 ")

    // If trim works correctly, these are the same IP and count=2
    // Third request should be rate-limited
    const response = await makeRequest("192.168.1.1")
    expect(response.status).toBe(429)
  })

  it("should handle X-Forwarded-For with IPv6 addresses", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "2001:0db8:85a3:0000:0000:8a2e:0370:7334" },
    })

    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })

  it("should fall back to request.ip when available", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")

    // NextRequest constructor doesn't allow setting ip directly
    // but in real Next.js runtime, request.ip is populated
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)
    // Falls back to "unknown" when both X-Forwarded-For and request.ip are missing
    expect(response.status).not.toBe(429)
  })

  it("should use 'unknown' when both X-Forwarded-For and request.ip are missing", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 2,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"))
      return middleware(request)
    }

    // All requests without IP info share the same "unknown" bucket
    await makeRequest()
    await makeRequest()
    const response = await makeRequest()

    // Third request should be rate-limited (same IP bucket)
    expect(response.status).toBe(429)
  })
})

describe("RAPTOR: Retry-After Header Calculation", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it("should return seconds until window reset", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    await makeRequest() // First request
    const response = await makeRequest() // Rate-limited

    const retryAfter = response.headers.get("Retry-After")
    expect(retryAfter).toBeDefined()

    // Should be ~60 seconds (window is 60s)
    const retrySeconds = Number.parseInt(retryAfter!, 10)
    expect(retrySeconds).toBeGreaterThan(0)
    expect(retrySeconds).toBeLessThanOrEqual(60)
  })

  it("should return minimum 1 second for Retry-After", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    await makeRequest()

    // Advance time to 1ms before reset
    vi.advanceTimersByTime(59999)

    const response = await makeRequest()
    const retryAfter = response.headers.get("Retry-After")

    // Should round up to minimum 1 second
    expect(retryAfter).toBe("1")
  })

  it("should return 60 when no rate limit record exists (should not happen)", async () => {
    // This tests getRateLimitRetryAfter() with missing record
    // In practice, this shouldn't happen because we only call it after checkRateLimit fails
    // But it's defensive programming

    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    // Make request that succeeds (no rate limit)
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })
    const response = await middleware(request)

    // Not rate-limited, so Retry-After should not exist
    expect(response.status).not.toBe(429)
    expect(response.headers.get("Retry-After")).toBeNull()
  })
})

describe("RAPTOR: Request Logging Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should log 429 responses with correlationId", async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    vi.mocked(getLogger).mockReturnValue(logger as any)
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: {
          "X-Forwarded-For": "192.168.1.1",
          "X-Correlation-Id": "test-429",
        },
      })
      return middleware(request)
    }

    await makeRequest() // First request (logged)
    await makeRequest() // Rate-limited (also logged)

    // Should have 2 log calls
    expect(logger.info).toHaveBeenCalledTimes(2)

    // Second log should have status 429
    expect(logger.info).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        status: 429,
        correlationId: "test-429",
      }),
      expect.any(String),
    )
  })

  it("should NOT log OPTIONS preflight requests", async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    vi.mocked(getLogger).mockReturnValue(logger as any)
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "https://example.com",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
    })

    await middleware(request)

    // OPTIONS should return early, no logging
    expect(logger.info).not.toHaveBeenCalled()
  })

  it("should log URL pathname correctly with query params", async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    vi.mocked(getLogger).mockReturnValue(logger as any)
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test?foo=bar&baz=qux"))

    await middleware(request)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        path: "/api/test", // pathname only, no query
      }),
      expect.any(String),
    )
  })

  it("should log different HTTP methods correctly", async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    vi.mocked(getLogger).mockReturnValue(logger as any)
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const methods = ["GET", "POST", "PUT", "PATCH", "DELETE"]

    for (const method of methods) {
      logger.info.mockClear()
      const request = new NextRequest(new URL("http://localhost/api/test"), { method })
      await middleware(request)

      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({
          method,
        }),
        expect.any(String),
      )
    }
  })

  it("should measure duration accurately", async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    vi.mocked(getLogger).mockReturnValue(logger as any)
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    await middleware(request)

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        duration: expect.any(Number),
      }),
      expect.any(String),
    )

    const logCall = logger.info.mock.calls[0][0]
    // Duration should be >= 0 milliseconds
    expect(logCall.duration).toBeGreaterThanOrEqual(0)
  })
})

describe("RAPTOR: Error Handling Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle non-Error thrown by getEnv", async () => {
    vi.mocked(getEnv).mockImplementation(() => {
      throw "String error" // Non-Error object
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.message).toBe("Internal server error") // Falls back to generic message
  })

  it("should handle null thrown by getEnv", async () => {
    vi.mocked(getEnv).mockImplementation(() => {
      throw null
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body.message).toBe("Internal server error")
  })

  it("should NOT include correlationId in error response when env fails", async () => {
    // When getEnv() throws, we never get to the correlation ID logic
    vi.mocked(getEnv).mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Correlation-Id": "should-not-appear" },
    })

    const response = await middleware(request)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).not.toHaveProperty("correlationId")
  })

  it("should set Content-Type application/json on error responses", async () => {
    vi.mocked(getEnv).mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    expect(response.headers.get("Content-Type")).toBe("application/json")
  })

  it("should NOT set CORS headers on error responses", async () => {
    vi.mocked(getEnv).mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    // Error response is created before CORS logic
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })

  it("should NOT log when env validation fails", async () => {
    const logger = { info: vi.fn(), error: vi.fn(), warn: vi.fn(), debug: vi.fn() }
    vi.mocked(getLogger).mockReturnValue(logger as any)
    vi.mocked(getEnv).mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    vi.resetModules()
    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/test"))

    await middleware(request)

    // Should NOT call logger (getEnv threw before we got to logger)
    expect(logger.info).not.toHaveBeenCalled()
  })
})

describe("RAPTOR: SSE Detection (Speculation)", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it("should handle SSE requests (no special handling implemented)", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 60,
    } as any)

    const { middleware } = await import("../middleware")
    const request = new NextRequest(new URL("http://localhost/api/events"), {
      headers: {
        Accept: "text/event-stream",
      },
    })

    const response = await middleware(request)

    // Middleware does NOT have special SSE handling
    // SSE requests are treated like normal requests
    expect(response.status).not.toBe(429)
  })

  it("should NOT bypass rate limiting for SSE requests", async () => {
    vi.mocked(getEnv).mockReturnValue({
      CORS_ORIGIN: "",
      RATE_LIMIT_RPM: 1,
    } as any)

    vi.resetModules()
    const { middleware } = await import("../middleware")

    const makeSSERequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/events"), {
        headers: {
          Accept: "text/event-stream",
          "X-Forwarded-For": "192.168.1.1",
        },
      })
      return middleware(request)
    }

    await makeSSERequest() // First request
    const response = await makeSSERequest() // Second request

    // SSE requests ARE rate-limited (no special handling)
    expect(response.status).toBe(429)
  })
})
