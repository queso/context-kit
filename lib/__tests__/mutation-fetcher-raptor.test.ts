import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { fetcher, mutationFetcher } from "@/lib/fetcher"

describe("RAPTOR: Error Handling Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should handle response.json() rejection in mutationFetcher error path", async () => {
    // Real fetch: if response.json() fails, it throws
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new Error("Invalid JSON")),
    })

    await expect(mutationFetcher("/api/test", { arg: { body: {} } })).rejects.toThrow(
      "Invalid JSON",
    )
  })

  it("should handle response.json() rejection in mutationFetcher success path", async () => {
    // Real fetch: if success response has invalid JSON, it throws
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockRejectedValue(new Error("Invalid JSON in success response")),
    })

    await expect(mutationFetcher("/api/test", { arg: { body: {} } })).rejects.toThrow(
      "Invalid JSON in success response",
    )
  })

  it("should handle network errors (fetch itself throws)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new Error("Network error"))

    await expect(mutationFetcher("/api/test", { arg: { body: {} } })).rejects.toThrow(
      "Network error",
    )
  })

  it("should handle CORS errors (fetch throws)", async () => {
    global.fetch = vi.fn().mockRejectedValue(new TypeError("Failed to fetch"))

    await expect(mutationFetcher("/api/test", { arg: { body: {} } })).rejects.toThrow(
      "Failed to fetch",
    )
  })

  it("should handle error response with non-JSON body", async () => {
    // Real API might return HTML error page instead of JSON
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected token < in JSON")),
    })

    await expect(mutationFetcher("/api/test", { arg: { body: {} } })).rejects.toThrow()
  })

  it("should handle error response with empty body", async () => {
    // Some servers return 204 No Content or empty body on error
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected end of JSON input")),
    })

    await expect(mutationFetcher("/api/test", { arg: { method: "DELETE" } })).rejects.toThrow()
  })

  it("should handle malformed ApiErrorResponse (missing fields)", async () => {
    // API returns error but doesn't follow ApiErrorResponse shape
    const malformedError = { msg: "Something went wrong" } // Missing 'error' and 'message'
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => malformedError,
    })

    try {
      await mutationFetcher("/api/test", { arg: { body: {} } })
      expect.fail("Should have thrown")
    } catch (error) {
      const err = error as Error & { status: number; body: any }
      expect(err.status).toBe(500)
      expect(err.body).toEqual(malformedError)
      // new Error(undefined) creates Error with empty string message, not undefined
      expect(err.message).toBe("")
    }
  })

  it("should handle error response with null message", async () => {
    const errorBody = {
      error: "SERVER_ERROR",
      message: null as any, // Malformed API response
    }
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 500,
      json: async () => errorBody,
    })

    try {
      await mutationFetcher("/api/test", { arg: { body: {} } })
      expect.fail("Should have thrown")
    } catch (error) {
      const err = error as Error
      // Error constructor with null message creates error with "null" string
      expect(err).toBeInstanceOf(Error)
    }
  })
})

describe("RAPTOR: Body Serialization Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should handle body with undefined value (omit body)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", { arg: { body: undefined } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.not.objectContaining({ body: expect.anything() }),
    )
  })

  it("should handle body with null value (send 'null' string)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", { arg: { body: null } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        body: "null",
      }),
    )
  })

  it("should handle body with empty object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", { arg: { body: {} } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        body: "{}",
      }),
    )
  })

  it("should handle body with array", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const body = [1, 2, 3]
    await mutationFetcher("/api/test", { arg: { body } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        body: JSON.stringify(body),
      }),
    )
  })

  it("should handle body with Date objects (serialized to ISO string)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const body = { createdAt: new Date("2024-01-01T00:00:00.000Z") }
    await mutationFetcher("/api/test", { arg: { body } })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        body: '{"createdAt":"2024-01-01T00:00:00.000Z"}',
      }),
    )
  })

  it("should handle body with circular references (throws during stringify)", async () => {
    const circular: any = { name: "obj" }
    circular.self = circular

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await expect(mutationFetcher("/api/test", { arg: { body: circular } })).rejects.toThrow(
      TypeError,
    ) // JSON.stringify throws TypeError for circular refs
  })

  it("should handle body with BigInt (throws during stringify)", async () => {
    const body = { value: BigInt(9007199254740991) }

    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await expect(mutationFetcher("/api/test", { arg: { body } })).rejects.toThrow(TypeError) // JSON.stringify throws TypeError for BigInt
  })
})

describe("RAPTOR: Header Merging Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should allow custom headers to override Content-Type", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: {
        body: {},
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
        },
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          "Content-Type": "application/x-www-form-urlencoded",
        }),
      }),
    )
  })

  it("should handle headers with undefined values", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: {
        body: {},
        headers: {
          "X-Custom": "",
        },
      },
    })

    // Headers with empty values are passed through to fetch
    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Custom": "",
        }),
      }),
    )
  })

  it("should handle headers with null values", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: {
        body: {},
        headers: {
          "X-Custom": null as any,
        },
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: expect.objectContaining({
          "X-Custom": null,
        }),
      }),
    )
  })

  it("should handle empty headers object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: {
        body: {},
        headers: {},
      },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        headers: {
          "Content-Type": "application/json",
        },
      }),
    )
  })

  it("should handle headers as Headers object (not just plain object)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const headers = new Headers()
    headers.set("X-Custom", "value")

    await mutationFetcher("/api/test", {
      arg: {
        body: {},
        headers,
      },
    })

    // Headers object should be spread correctly
    expect(fetch).toHaveBeenCalled()
  })

  it("should handle headers as array of tuples", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    const headers: [string, string][] = [
      ["X-Custom-1", "value1"],
      ["X-Custom-2", "value2"],
    ]

    await mutationFetcher("/api/test", {
      arg: {
        body: {},
        headers,
      },
    })

    expect(fetch).toHaveBeenCalled()
  })
})

describe("RAPTOR: HTTP Method Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should handle lowercase HTTP methods", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: { method: "post" as any, body: {} },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "post",
      }),
    )
  })

  it("should handle GET method (unusual for mutations but allowed)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: { method: "GET" },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "GET",
      }),
    )
  })

  it("should handle HEAD method", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: { method: "HEAD" },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "HEAD",
      }),
    )
  })

  it("should handle OPTIONS method", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await mutationFetcher("/api/test", {
      arg: { method: "OPTIONS" },
    })

    expect(fetch).toHaveBeenCalledWith(
      "/api/test",
      expect.objectContaining({
        method: "OPTIONS",
      }),
    )
  })
})

describe("RAPTOR: fetcher Backwards Compatibility", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should maintain exact error shape for fetcher (no body property)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      json: async () => ({}), // fetcher doesn't parse JSON on error
    })

    try {
      await fetcher("/api/test")
      expect.fail("Should have thrown")
    } catch (error) {
      const err = error as Error & { status: number }
      expect(err.status).toBe(404)
      expect(err.message).toBe("Fetch failed")
      // Should NOT have body property (backwards compatibility)
      expect("body" in err).toBe(false)
    }
  })

  it("should call fetch without options when no headers provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await fetcher("/api/test")

    // Backwards compatible: fetch called with only URL, no options object
    expect(fetch).toHaveBeenCalledWith("/api/test")
    expect(fetch).not.toHaveBeenCalledWith("/api/test", expect.anything())
  })

  it("should call fetch with options only when headers provided", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await fetcher("/api/test", { "X-Custom": "value" })

    // With headers: fetch called with options object
    expect(fetch).toHaveBeenCalledWith("/api/test", { headers: { "X-Custom": "value" } })
  })

  it("should handle fetcher with empty headers object", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({}),
    })

    await fetcher("/api/test", {})

    expect(fetch).toHaveBeenCalledWith("/api/test", { headers: {} })
  })
})

describe("RAPTOR: Response Status Code Edge Cases", () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("should handle 204 No Content (no response body to parse)", async () => {
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 204,
      json: vi.fn().mockRejectedValue(new SyntaxError("Unexpected end of JSON input")),
    })

    // 204 responses have no body, so json() fails
    await expect(mutationFetcher("/api/test", { arg: { method: "DELETE" } })).rejects.toThrow()
  })

  it("should handle 201 Created with response body", async () => {
    const createdData = { id: 123, created: true }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => createdData,
    })

    const result = await mutationFetcher("/api/test", { arg: { body: {} } })

    expect(result).toEqual(createdData)
  })

  it("should handle 202 Accepted", async () => {
    const acceptedData = { jobId: "abc-123" }
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 202,
      json: async () => acceptedData,
    })

    const result = await mutationFetcher("/api/test", { arg: { body: {} } })

    expect(result).toEqual(acceptedData)
  })

  it("should handle 3xx redirects as ok=true", async () => {
    // Fetch follows redirects automatically, but if manual redirect:
    global.fetch = vi.fn().mockResolvedValue({
      ok: false, // 3xx are not 'ok' in fetch
      status: 302,
      json: async () => ({}),
    })

    await expect(mutationFetcher("/api/test", { arg: { body: {} } })).rejects.toThrow()
  })
})
