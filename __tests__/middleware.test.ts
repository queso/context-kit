import { afterEach, beforeEach, describe, expect, it, jest, mock, spyOn } from "bun:test"
import { NextRequest } from "next/server"
import { resetRateLimiter } from "@/lib/rate-limiter"
import { config, middleware, runtime } from "../middleware"

type Env = ReturnType<typeof import("@/lib/env").getEnv>

/** Default mock env values satisfying the full Env shape */
const defaultMockEnv: Env = {
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  LOG_LEVEL: "info",
  SITE_URL: "http://localhost:3000",
  CORS_ORIGIN: "",
  RATE_LIMIT_RPM: 60,
}

function mockEnv(overrides: Partial<Env> = {}): Env {
  return { ...defaultMockEnv, ...overrides }
}

// Spy on the real env and logger modules (module mocks are process-global in bun:test and would
// leak into env.test.ts / logger.test.ts). Named imports inside middleware.ts see the spies.
// Spies are (re)created fresh before every test and restored after, so no state or call history
// leaks between tests.
const envMod = await import("@/lib/env")
const loggerMod = await import("@/lib/logger")

let getEnv: ReturnType<typeof spyOn<typeof envMod, "getEnv">>

beforeEach(() => {
  // The limiter is module-level state; reset it explicitly rather than re-importing the module.
  resetRateLimiter()
  getEnv = spyOn(envMod, "getEnv").mockReturnValue(defaultMockEnv)
  const noopLogger = { info: mock(), error: mock(), warn: mock(), debug: mock() }
  spyOn(loggerMod, "getLogger").mockReturnValue(
    noopLogger as unknown as ReturnType<typeof loggerMod.getLogger>,
  )
})

afterEach(() => {
  mock.restore()
})

describe("middleware exports", () => {
  it("should export middleware function", async () => {
    expect(typeof middleware).toBe("function")
  })

  it("should export config with API matcher", async () => {
    expect(config).toBeDefined()
    expect(config.matcher).toEqual(["/api/:path*"])
  })

  it("should export runtime as nodejs", async () => {
    expect(runtime).toBe("nodejs")
  })
})

describe("CORS handling", () => {
  it("should NOT set Access-Control-Allow-Origin when CORS_ORIGIN is empty", async () => {
    getEnv.mockReturnValue(mockEnv())

    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull()
  })

  it("should set CORS headers when CORS_ORIGIN is set", async () => {
    getEnv.mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeDefined()
    expect(response.headers.get("Access-Control-Allow-Headers")).toBeDefined()
  })

  it("should set Access-Control-Allow-Credentials when CORS_ORIGIN is specific origin", async () => {
    getEnv.mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Credentials")).toBe("true")
  })

  it("should NOT set Access-Control-Allow-Credentials when CORS_ORIGIN is wildcard", async () => {
    getEnv.mockReturnValue(mockEnv({ CORS_ORIGIN: "*" }))

    const request = new NextRequest(new URL("http://localhost/api/test"))
    const response = await middleware(request)

    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("*")
    expect(response.headers.get("Access-Control-Allow-Credentials")).toBeNull()
  })

  it("should handle OPTIONS preflight with 204 and CORS headers", async () => {
    getEnv.mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const request = new NextRequest(new URL("http://localhost/api/test"), {
      method: "OPTIONS",
    })
    const response = await middleware(request)

    expect(response.status).toBe(204)
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com")
    expect(response.headers.get("Access-Control-Allow-Methods")).toBeDefined()
  })
})

describe("Rate limiting", () => {
  beforeEach(() => {
    jest.useFakeTimers()
  })

  afterEach(() => {
    jest.clearAllTimers()
    jest.useRealTimers()
  })

  it("should allow requests under rate limit", async () => {
    getEnv.mockReturnValue(mockEnv())

    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })

    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })

  it("should return 429 when rate limit exceeded", async () => {
    getEnv.mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 2 }))

    // Rate-limit state is reset via resetRateLimiter() in beforeEach.

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // First 2 requests should succeed
    await makeRequest()
    await makeRequest()

    // 3rd request should be rate limited
    const response = await makeRequest()
    expect(response.status).toBe(429)
  })

  it("should return ApiErrorResponse shape on 429", async () => {
    getEnv.mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 1 }))

    const request1 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })
    const request2 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })

    await middleware(request1)
    const response = await middleware(request2)

    expect(response.status).toBe(429)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(body).toHaveProperty("message")
  })

  it("should include Retry-After header on 429", async () => {
    getEnv.mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 1 }))

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    await makeRequest()
    const response = await makeRequest()

    expect(response.status).toBe(429)
    expect(response.headers.get("Retry-After")).toBeDefined()
  })

  it("should use X-Forwarded-For for IP identification", async () => {
    getEnv.mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 2 }))

    // Different IPs should have separate rate limits
    const request1 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.1" },
    })
    const request2 = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Forwarded-For": "192.168.1.2" },
    })

    const response1 = await middleware(request1)
    const response2 = await middleware(request2)

    expect(response1.status).not.toBe(429)
    expect(response2.status).not.toBe(429)
  })

  it("should fall back to unknown IP when X-Forwarded-For is missing", async () => {
    getEnv.mockReturnValue(mockEnv())

    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })

  it("should reset rate limit window after 60 seconds", async () => {
    getEnv.mockReturnValue(mockEnv({ RATE_LIMIT_RPM: 1 }))

    const makeRequest = async () => {
      const request = new NextRequest(new URL("http://localhost/api/test"), {
        headers: { "X-Forwarded-For": "192.168.1.1" },
      })
      return middleware(request)
    }

    // First request
    const response1 = await makeRequest()
    expect(response1.status).not.toBe(429)

    // Second request (should be rate limited)
    const response2 = await makeRequest()
    expect(response2.status).toBe(429)

    // Advance time by 60 seconds
    jest.advanceTimersByTime(60000)

    // Third request (should succeed after window reset)
    const response3 = await makeRequest()
    expect(response3.status).not.toBe(429)
  })
})

describe("Correlation ID", () => {
  it("should pass through existing X-Correlation-Id from request", async () => {
    getEnv.mockReturnValue(mockEnv())

    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: { "X-Correlation-Id": "existing-123" },
    })

    const response = await middleware(request)
    expect(response.headers.get("X-Correlation-Id")).toBe("existing-123")
  })

  it("should generate UUID when X-Correlation-Id is missing", async () => {
    getEnv.mockReturnValue(mockEnv())

    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)
    const correlationId = response.headers.get("X-Correlation-Id")

    expect(correlationId).toBeDefined()
    expect(correlationId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    )
  })

  it("should set X-Correlation-Id on response", async () => {
    getEnv.mockReturnValue(mockEnv())

    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)
    expect(response.headers.has("X-Correlation-Id")).toBe(true)
  })
})

describe("Error handling", () => {
  it("should return 500 with ApiErrorResponse shape when getEnv() throws", async () => {
    getEnv.mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    expect(response.status).toBe(500)
    const body = await response.json()
    expect(body).toHaveProperty("error")
    expect(body).toHaveProperty("message")
  })

  it("should return JSON response on env error", async () => {
    getEnv.mockImplementation(() => {
      throw new Error("Environment validation failed")
    })

    const request = new NextRequest(new URL("http://localhost/api/test"))

    const response = await middleware(request)

    expect(response.headers.get("Content-Type")).toContain("application/json")
  })
})

describe("Integration scenarios", () => {
  it("should handle complete request flow with all features", async () => {
    getEnv.mockReturnValue(mockEnv({ CORS_ORIGIN: "https://example.com" }))

    const request = new NextRequest(new URL("http://localhost/api/test"), {
      headers: {
        "X-Forwarded-For": "192.168.1.1",
        "X-Correlation-Id": "test-123",
      },
    })

    const response = await middleware(request)

    // CORS
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://example.com")

    // Correlation ID
    expect(response.headers.get("X-Correlation-Id")).toBe("test-123")

    // Not rate limited
    expect(response.status).not.toBe(429)
  })

  it("should handle POST request with body", async () => {
    getEnv.mockReturnValue(mockEnv())

    const request = new NextRequest(new URL("http://localhost/api/users"), {
      method: "POST",
      body: JSON.stringify({ name: "John" }),
    })

    const response = await middleware(request)
    expect(response.status).not.toBe(429)
  })
})
