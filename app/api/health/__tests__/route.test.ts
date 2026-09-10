import { afterAll, afterEach, describe, expect, it, jest, spyOn } from "bun:test"
import { logger } from "@/lib/logger"

// Spy on the real @/db module (importing it is side-effect free: it's a lazy singleton) instead
// of mock.module, which is process-global and would leak into db/__tests__/index.test.ts and
// db/__tests__/url.test.ts, which exercise the real module in the same test run.
const dbMod = await import("@/db")
const pingSpy = spyOn(dbMod, "ping")

const { GET } = await import("@/app/api/health/route")

// Silence log output without replacing the logger module.
const infoSpy = spyOn(logger, "info").mockImplementation(() => undefined)
const errorSpy = spyOn(logger, "error").mockImplementation(() => undefined)

// jest.clearAllTimers() throws under bun:test when fake timers are not active, so track it.
let fakeTimersActive = false

function useFakeTimers() {
  jest.useFakeTimers()
  fakeTimersActive = true
}

describe("GET /api/health", () => {
  afterEach(() => {
    pingSpy.mockReset()
    if (fakeTimersActive) {
      jest.clearAllTimers()
      jest.useRealTimers()
      fakeTimersActive = false
    }
  })

  afterAll(() => {
    pingSpy.mockRestore()
    infoSpy.mockRestore()
    errorSpy.mockRestore()
  })

  it("should return 200 with healthy status when DB is reachable", async () => {
    pingSpy.mockResolvedValueOnce(undefined)

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(200)
    expect(body.status).toBe("healthy")
    expect(body.database).toBe("connected")
  })

  it("should return 503 with unhealthy status when DB query fails", async () => {
    pingSpy.mockRejectedValueOnce(new Error("Connection refused"))

    const response = await GET()
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("SERVICE_UNAVAILABLE")
    expect(body.message).toBe("Connection refused")
    expect(body.details.status).toBe("unhealthy")
    expect(body.details.database).toBe("disconnected")
  })

  it("should include latency as a number in milliseconds", async () => {
    pingSpy.mockResolvedValueOnce(undefined)

    const response = await GET()
    const body = await response.json()

    expect(typeof body.latency).toBe("number")
    expect(body.latency).toBeGreaterThanOrEqual(0)
  })

  it("should include a timestamp as an ISO 8601 string", async () => {
    pingSpy.mockResolvedValueOnce(undefined)

    const response = await GET()
    const body = await response.json()

    expect(typeof body.timestamp).toBe("string")
    // Verify it parses as a valid date and round-trips to ISO format
    const parsed = new Date(body.timestamp)
    expect(parsed.toISOString()).toBe(body.timestamp)
  })

  it("should return 503 when DB query exceeds the 5-second timeout", async () => {
    useFakeTimers()

    // Simulate a query that never resolves (hangs forever)
    pingSpy.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          setTimeout(() => resolve(), 10_000)
        }),
    )

    const responsePromise = GET()

    // Advance time past the 5-second timeout
    jest.advanceTimersByTime(6_000)

    const response = await responsePromise
    const body = await response.json()

    expect(response.status).toBe(503)
    expect(body.error).toBe("SERVICE_UNAVAILABLE")
    expect(body.details.status).toBe("unhealthy")
    expect(body.details.database).toBe("disconnected")
  })
})
