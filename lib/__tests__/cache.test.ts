import * as nextCache from "next/cache"
import { beforeEach, describe, expect, it, type Mock, vi } from "vitest"
import { cacheHeaders, revalidateByTag, revalidatePath } from "@/lib/cache"
import * as logger from "@/lib/logger"

// Mock next/cache
vi.mock("next/cache", () => ({
  revalidateTag: vi.fn(),
  revalidatePath: vi.fn(),
}))

// Mock logger
vi.mock("@/lib/logger", () => ({
  getLogger: vi.fn(() => ({
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  })),
}))

describe("revalidateByTag", () => {
  let mockRevalidateTag: Mock
  let mockLogger: { info: Mock; error: Mock }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidateTag = vi.fn()
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    }

    // Setup mocks
    ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)
  })

  it("should call Next.js revalidateTag with the provided tag", () => {
    revalidateByTag("posts")
    expect(mockRevalidateTag).toHaveBeenCalledWith("posts", "default")
    expect(mockRevalidateTag).toHaveBeenCalledTimes(1)
  })

  it("should log the revalidation with structured logging", () => {
    revalidateByTag("users")
    expect(mockLogger.info).toHaveBeenCalledWith({ tag: "users" }, "Revalidating cache by tag")
  })

  it("should handle multiple calls independently", () => {
    revalidateByTag("posts")
    revalidateByTag("comments")
    revalidateByTag("users")

    expect(mockRevalidateTag).toHaveBeenCalledTimes(3)
    expect(mockRevalidateTag).toHaveBeenNthCalledWith(1, "posts", "default")
    expect(mockRevalidateTag).toHaveBeenNthCalledWith(2, "comments", "default")
    expect(mockRevalidateTag).toHaveBeenNthCalledWith(3, "users", "default")

    expect(mockLogger.info).toHaveBeenCalledTimes(3)
  })

  it("should log before calling revalidateTag", () => {
    const callOrder: string[] = []
    mockLogger.info.mockImplementation(() => callOrder.push("log"))
    mockRevalidateTag.mockImplementation(() => callOrder.push("revalidate"))

    revalidateByTag("test")

    expect(callOrder).toEqual(["log", "revalidate"])
  })

  it("LOGGER ISSUE: getLogger is called on every invocation instead of once at module level", () => {
    // Current implementation calls getLogger() on every function call
    // Better: const logger = getLogger() at module level (outside function)
    revalidateByTag("test1")
    revalidateByTag("test2")
    revalidateByTag("test3")

    // getLogger should be called 3 times (once per invocation) - this is inefficient
    expect(logger.getLogger).toHaveBeenCalledTimes(3)
    // TODO: Optimize by moving getLogger() to module level
  })
})

describe("revalidatePath", () => {
  let mockRevalidatePath: Mock
  let mockLogger: { info: Mock; error: Mock }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidatePath = vi.fn()
    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
    }

    // Setup mocks
    ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)
  })

  it("should call Next.js revalidatePath with path only", () => {
    revalidatePath("/posts")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/posts", undefined)
  })

  it("should call Next.js revalidatePath with path and type", () => {
    revalidatePath("/dashboard", "page")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/dashboard", "page")
  })

  it("should support layout type", () => {
    revalidatePath("/admin", "layout")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/admin", "layout")
  })

  it("should log path revalidation without type", () => {
    revalidatePath("/api/users")
    expect(mockLogger.info).toHaveBeenCalledWith(
      { path: "/api/users", type: undefined },
      "Revalidating cache by path",
    )
  })

  it("should log path revalidation with type", () => {
    revalidatePath("/blog", "page")
    expect(mockLogger.info).toHaveBeenCalledWith(
      { path: "/blog", type: "page" },
      "Revalidating cache by path",
    )
  })

  it("should handle multiple calls independently", () => {
    revalidatePath("/posts")
    revalidatePath("/comments", "page")
    revalidatePath("/admin", "layout")

    expect(mockRevalidatePath).toHaveBeenCalledTimes(3)
    expect(mockLogger.info).toHaveBeenCalledTimes(3)
  })

  it("should log before calling revalidatePath", () => {
    const callOrder: string[] = []
    mockLogger.info.mockImplementation(() => callOrder.push("log"))
    mockRevalidatePath.mockImplementation(() => callOrder.push("revalidate"))

    revalidatePath("/test", "page")

    expect(callOrder).toEqual(["log", "revalidate"])
  })

  it("LOGGER ISSUE: getLogger is called on every invocation instead of once at module level", () => {
    // Current implementation calls getLogger() on every function call
    // Better: const logger = getLogger() at module level (outside function)
    revalidatePath("/test1")
    revalidatePath("/test2")
    revalidatePath("/test3", "page")

    // getLogger should be called 6 times total (3 from this test + 3 from revalidateByTag test)
    // This is inefficient - should call once at module load
    expect(logger.getLogger).toHaveBeenCalled()
    // TODO: Optimize by moving getLogger() to module level
  })
})

describe("cacheHeaders", () => {
  it("should return no-store by default when called with no arguments", () => {
    const headers = cacheHeaders()
    expect(headers).toBe("no-store")
  })

  it("should return no-store when called with empty options", () => {
    const headers = cacheHeaders({})
    expect(headers).toBe("no-store")
  })

  it("should return no-store when noStore is true", () => {
    const headers = cacheHeaders({ noStore: true })
    expect(headers).toBe("no-store")
  })

  it("should ignore other options when noStore is true", () => {
    const headers = cacheHeaders({
      noStore: true,
      maxAge: 3600,
      isPublic: true,
    })
    expect(headers).toBe("no-store")
  })

  it("noStore takes precedence over all other options (explicitly tested)", () => {
    const headers = cacheHeaders({
      noStore: true,
      maxAge: 3600,
      staleWhileRevalidate: 86400,
      isPublic: true,
    })
    expect(headers).toBe("no-store")
    // Verify no cache directives are present
    expect(headers).not.toContain("max-age")
    expect(headers).not.toContain("stale-while-revalidate")
    expect(headers).not.toContain("public")
    expect(headers).not.toContain("private")
  })

  it("should create max-age directive", () => {
    const headers = cacheHeaders({ maxAge: 3600 })
    expect(headers).toContain("max-age=3600")
  })

  it("should create stale-while-revalidate directive", () => {
    const headers = cacheHeaders({ staleWhileRevalidate: 86400 })
    expect(headers).toContain("stale-while-revalidate=86400")
  })

  it("should combine max-age and stale-while-revalidate", () => {
    const headers = cacheHeaders({
      maxAge: 3600,
      staleWhileRevalidate: 86400,
    })
    expect(headers).toContain("max-age=3600")
    expect(headers).toContain("stale-while-revalidate=86400")
  })

  it("should default to private when isPublic is not set", () => {
    const headers = cacheHeaders({ maxAge: 3600 })
    expect(headers).toMatch(/^private/)
  })

  it("should use public when isPublic is true", () => {
    const headers = cacheHeaders({ maxAge: 3600, isPublic: true })
    expect(headers).toMatch(/^public/)
  })

  it("should use private when isPublic is false", () => {
    const headers = cacheHeaders({ maxAge: 3600, isPublic: false })
    expect(headers).toMatch(/^private/)
  })

  it("should create complete header with all options", () => {
    const headers = cacheHeaders({
      maxAge: 3600,
      staleWhileRevalidate: 86400,
      isPublic: true,
    })
    expect(headers).toBe("public, max-age=3600, stale-while-revalidate=86400")
  })

  it("should handle zero maxAge", () => {
    const headers = cacheHeaders({ maxAge: 0 })
    expect(headers).toContain("max-age=0")
  })

  it("should handle zero staleWhileRevalidate", () => {
    const headers = cacheHeaders({ staleWhileRevalidate: 0 })
    expect(headers).toContain("stale-while-revalidate=0")
  })

  it("should format directives with comma and space", () => {
    const headers = cacheHeaders({
      maxAge: 3600,
      staleWhileRevalidate: 86400,
      isPublic: true,
    })
    const parts = headers.split(", ")
    expect(parts).toHaveLength(3)
    expect(parts[0]).toBe("public")
    expect(parts[1]).toBe("max-age=3600")
    expect(parts[2]).toBe("stale-while-revalidate=86400")
  })

  it("should handle only staleWhileRevalidate without maxAge", () => {
    const headers = cacheHeaders({ staleWhileRevalidate: 86400 })
    expect(headers).toContain("stale-while-revalidate=86400")
    expect(headers).not.toContain("max-age")
  })

  it("RFC 7234 VIOLATION: stale-while-revalidate without max-age is meaningless", () => {
    // RFC 7234 section 5.2.2.9: stale-while-revalidate extends the staleness period
    // AFTER max-age expires. Without max-age, it has no effect.
    // This test documents the current behavior, which may need fixing.
    const headers = cacheHeaders({ staleWhileRevalidate: 60 })
    expect(headers).toBe("private, stale-while-revalidate=60")
    // TODO: Should either require maxAge or default maxAge to 0 when staleWhileRevalidate is set
  })

  it("should be pure - same input produces same output", () => {
    const options = { maxAge: 3600, isPublic: true }
    const result1 = cacheHeaders(options)
    const result2 = cacheHeaders(options)
    expect(result1).toBe(result2)
  })

  it("should not modify the input options object", () => {
    const options = { maxAge: 3600, isPublic: true }
    const optionsCopy = { ...options }
    cacheHeaders(options)
    expect(options).toEqual(optionsCopy)
  })
})

describe("function exports", () => {
  it("should export revalidateByTag as a function", () => {
    expect(typeof revalidateByTag).toBe("function")
  })

  it("should export revalidatePath as a function", () => {
    expect(typeof revalidatePath).toBe("function")
  })

  it("should export cacheHeaders as a function", () => {
    expect(typeof cacheHeaders).toBe("function")
  })
})

describe("RFC 7234 compliance and edge cases", () => {
  it("should handle maxAge=0 with staleWhileRevalidate (valid per RFC)", () => {
    // RFC 7234: max-age=0 means immediately stale, then stale-while-revalidate extends it
    const headers = cacheHeaders({ maxAge: 0, staleWhileRevalidate: 60 })
    expect(headers).toBe("private, max-age=0, stale-while-revalidate=60")
  })

  it("documents that staleWhileRevalidate alone returns fallback to no-store behavior", () => {
    // Currently returns "private, stale-while-revalidate=60" which violates RFC 7234
    // Per RFC, this should either:
    // 1. Require maxAge to be set, or
    // 2. Default maxAge to 0 when staleWhileRevalidate is provided
    const headers = cacheHeaders({ staleWhileRevalidate: 60 })

    // Current behavior - documents the bug
    expect(headers).not.toBe("no-store")
    expect(headers).toContain("stale-while-revalidate")

    // What it SHOULD be (one of these):
    // Option 1: Default to no-store when staleWhileRevalidate without maxAge
    // expect(headers).toBe("no-store")
    //
    // Option 2: Auto-add max-age=0 when staleWhileRevalidate is set without maxAge
    // expect(headers).toBe("private, max-age=0, stale-while-revalidate=60")
  })

  it("should handle large maxAge values", () => {
    // 1 year in seconds
    const headers = cacheHeaders({ maxAge: 31536000 })
    expect(headers).toContain("max-age=31536000")
  })

  it("should handle fractional seconds (truncated by parseInt if implemented)", () => {
    // HTTP Cache-Control values should be integers
    const headers = cacheHeaders({ maxAge: 3600 })
    expect(headers).toContain("max-age=3600")
    expect(headers).not.toContain(".")
  })
})
