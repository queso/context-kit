import { afterAll, afterEach, beforeEach, describe, expect, it, mock } from "bun:test"
import { fetcher } from "@/lib/fetcher"
// `globalThis.fetch` assignments leak across files (bun runs every test file in one process); see
// test/fetch-mock.ts for the shared mock/restore helpers.
import { captureRejection, mockFetch, restoreFetch } from "@/test/fetch-mock"

afterAll(() => {
  restoreFetch()
})

describe("fetcher", () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  afterEach(() => {
    mock.restore()
  })

  it("should fetch data without headers", async () => {
    const mockData = { id: 1, name: "Test" }
    mockFetch({
      ok: true,
      json: async () => mockData,
    })

    const result = await fetcher<typeof mockData>("/api/test")

    expect(fetch).toHaveBeenCalledWith("/api/test")
    expect(result).toEqual(mockData)
  })

  it("should fetch data with custom headers", async () => {
    const mockData = { id: 1, name: "Test" }
    const customHeaders = {
      "X-Custom-Header": "value",
      Authorization: "Bearer token",
    }
    mockFetch({
      ok: true,
      json: async () => mockData,
    })

    const result = await fetcher<typeof mockData>("/api/test", customHeaders)

    expect(fetch).toHaveBeenCalledWith("/api/test", { headers: customHeaders })
    expect(result).toEqual(mockData)
  })

  it("should fetch data with correlation ID header", async () => {
    const mockData = { id: 1, name: "Test" }
    mockFetch({
      ok: true,
      json: async () => mockData,
    })

    await fetcher("/api/test", { "X-Correlation-Id": "abc-123" })

    expect(fetch).toHaveBeenCalledWith("/api/test", {
      headers: { "X-Correlation-Id": "abc-123" },
    })
  })

  it("should return parsed JSON with different data types", async () => {
    const testCases = [
      { data: { count: 42 } },
      { data: [1, 2, 3] },
      { data: "string value" },
      { data: true },
      { data: null },
    ]

    for (const { data } of testCases) {
      mockFetch({
        ok: true,
        json: async () => data,
      })

      const result = await fetcher("/api/test")
      expect(result).toEqual(data)
    }
  })

  it("should handle complex nested objects", async () => {
    const complexData = {
      user: {
        id: 1,
        profile: {
          name: "John",
          tags: ["developer", "tester"],
        },
      },
      metadata: {
        timestamp: "2026-02-16T00:00:00Z",
      },
    }
    mockFetch({
      ok: true,
      json: async () => complexData,
    })

    const result = await fetcher("/api/users/1")
    expect(result).toEqual(complexData)
  })

  it("should throw error with status on 404 response", async () => {
    mockFetch({
      ok: false,
      status: 404,
    })

    await expect(fetcher("/api/test")).rejects.toThrow("Fetch failed")
    await expect(fetcher("/api/test")).rejects.toHaveProperty("status", 404)
  })

  it("should throw error with status on 400 response", async () => {
    mockFetch({
      ok: false,
      status: 400,
    })

    const error = await captureRejection(fetcher("/api/test"))
    expect(error).toBeInstanceOf(Error)
    expect((error as Error & { status: number }).status).toBe(400)
    expect((error as Error & { status: number }).message).toBe("Fetch failed")
  })

  it("should throw error with status on 401 response", async () => {
    mockFetch({
      ok: false,
      status: 401,
    })

    await expect(fetcher("/api/test")).rejects.toMatchObject({
      message: "Fetch failed",
      status: 401,
    })
  })

  it("should throw error with status on 403 response", async () => {
    mockFetch({
      ok: false,
      status: 403,
    })

    await expect(fetcher("/api/test")).rejects.toMatchObject({
      message: "Fetch failed",
      status: 403,
    })
  })

  it("should throw error with status on 500 response", async () => {
    mockFetch({
      ok: false,
      status: 500,
    })

    const error = await captureRejection(fetcher("/api/test"))
    expect(error).toBeInstanceOf(Error)
    expect((error as Error & { status: number }).status).toBe(500)
  })

  it("should throw error with status on 502 response", async () => {
    mockFetch({
      ok: false,
      status: 502,
    })

    await expect(fetcher("/api/test")).rejects.toMatchObject({
      message: "Fetch failed",
      status: 502,
    })
  })

  it("should throw error with status on 503 response", async () => {
    mockFetch({
      ok: false,
      status: 503,
    })

    await expect(fetcher("/api/test")).rejects.toMatchObject({
      message: "Fetch failed",
      status: 503,
    })
  })

  it("should handle different URLs correctly", async () => {
    const urls = ["/api/users", "/api/posts/123", "/api/nested/path/item"]

    for (const url of urls) {
      mockFetch({
        ok: true,
        json: async () => ({ success: true }),
      })

      await fetcher(url)
      expect(fetch).toHaveBeenLastCalledWith(url)
    }
  })

  it("should merge multiple custom headers", async () => {
    const headers = {
      "X-Correlation-Id": "abc-123",
      Authorization: "Bearer token",
      "X-Custom-Header": "value",
    }
    mockFetch({
      ok: true,
      json: async () => ({}),
    })

    await fetcher("/api/test", headers)

    expect(fetch).toHaveBeenCalledWith("/api/test", { headers })
  })

  it("should throw with proper error shape", async () => {
    mockFetch({
      ok: false,
      status: 404,
    })

    const error = await captureRejection(fetcher("/api/test"))
    expect(error).toBeInstanceOf(Error)
    const err = error as Error & { status: number }
    expect(err).toHaveProperty("message")
    expect(err).toHaveProperty("status")
    expect(typeof err.message).toBe("string")
    expect(typeof err.status).toBe("number")
  })
})
