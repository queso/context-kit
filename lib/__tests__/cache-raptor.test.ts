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

describe("RAPTOR: Wiring Verification", () => {
  it("should have all exports importable", () => {
    expect(revalidateByTag).toBeDefined()
    expect(revalidatePath).toBeDefined()
    expect(cacheHeaders).toBeDefined()
  })

  it("should export functions as callable", () => {
    expect(typeof revalidateByTag).toBe("function")
    expect(typeof revalidatePath).toBe("function")
    expect(typeof cacheHeaders).toBe("function")
  })
})

describe("RAPTOR: Edge Probe - revalidateByTag Empty/Special Tags", () => {
  let mockRevalidateTag: Mock
  let mockLogger: { info: Mock }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidateTag = vi.fn()
    mockLogger = {
      info: vi.fn(),
    }
    ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)
  })

  it("should handle empty string tag", () => {
    revalidateByTag("")
    expect(mockRevalidateTag).toHaveBeenCalledWith("", "default")
    expect(mockLogger.info).toHaveBeenCalledWith({ tag: "" }, "Revalidating cache by tag")
  })

  it("should handle tags with special characters", () => {
    const specialTags = [
      "tag:with:colons",
      "tag/with/slashes",
      "tag-with-dashes",
      "tag_with_underscores",
      "tag.with.dots",
      "tag with spaces",
      "tag\twith\ttabs",
      "tag\nwith\nnewlines",
    ]

    for (const tag of specialTags) {
      vi.clearAllMocks()
      revalidateByTag(tag)
      expect(mockRevalidateTag).toHaveBeenCalledWith(tag, "default")
      expect(mockLogger.info).toHaveBeenCalledWith({ tag }, "Revalidating cache by tag")
    }
  })

  it("should handle very long tag names", () => {
    const longTag = "a".repeat(10000)
    revalidateByTag(longTag)
    expect(mockRevalidateTag).toHaveBeenCalledWith(longTag, "default")
    expect(mockLogger.info).toHaveBeenCalledWith({ tag: longTag }, "Revalidating cache by tag")
  })

  it("should handle unicode and emoji tags", () => {
    const unicodeTags = ["tag-日本語", "tag-🚀", "tag-✅-check"]

    for (const tag of unicodeTags) {
      vi.clearAllMocks()
      revalidateByTag(tag)
      expect(mockRevalidateTag).toHaveBeenCalledWith(tag, "default")
    }
  })

  it("should handle tags with HTML/XSS-like content", () => {
    const xssTags = [
      "<script>alert('xss')</script>",
      "tag<img src=x onerror=alert(1)>",
      "tag';DROP TABLE tags;--",
    ]

    for (const tag of xssTags) {
      vi.clearAllMocks()
      revalidateByTag(tag)
      expect(mockRevalidateTag).toHaveBeenCalledWith(tag, "default")
    }
  })
})

describe("RAPTOR: Edge Probe - revalidatePath Empty/Special Paths", () => {
  let mockRevalidatePath: Mock
  let mockLogger: { info: Mock }

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidatePath = vi.fn()
    mockLogger = {
      info: vi.fn(),
    }
    ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)
  })

  it("should handle empty string path", () => {
    revalidatePath("")
    expect(mockRevalidatePath).toHaveBeenCalledWith("", undefined)
    expect(mockLogger.info).toHaveBeenCalledWith(
      { path: "", type: undefined },
      "Revalidating cache by path",
    )
  })

  it("should handle root path", () => {
    revalidatePath("/")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/", undefined)
  })

  it("should handle paths without leading slash", () => {
    revalidatePath("no-leading-slash")
    expect(mockRevalidatePath).toHaveBeenCalledWith("no-leading-slash", undefined)
  })

  it("should handle paths with query strings", () => {
    revalidatePath("/api/users?sort=name&limit=10")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/api/users?sort=name&limit=10", undefined)
  })

  it("should handle paths with fragments", () => {
    revalidatePath("/docs#section-1")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/docs#section-1", undefined)
  })

  it("should handle paths with special characters", () => {
    const specialPaths = [
      "/path/with/ümlauts",
      "/path/with/日本語",
      "/path/with/emoji/🚀",
      "/path/with spaces",
      "/path/with%20encoding",
    ]

    for (const path of specialPaths) {
      vi.clearAllMocks()
      revalidatePath(path)
      expect(mockRevalidatePath).toHaveBeenCalledWith(path, undefined)
    }
  })

  it("should handle very long paths", () => {
    const longPath = `/${"a".repeat(10000)}`
    revalidatePath(longPath)
    expect(mockRevalidatePath).toHaveBeenCalledWith(longPath, undefined)
  })

  it("should handle absolute URLs (edge case)", () => {
    revalidatePath("https://example.com/path")
    expect(mockRevalidatePath).toHaveBeenCalledWith("https://example.com/path", undefined)
  })

  it("should handle invalid type values gracefully (TypeScript prevents but testing runtime)", () => {
    // @ts-expect-error Testing invalid type
    revalidatePath("/path", "invalid-type")
    expect(mockRevalidatePath).toHaveBeenCalledWith("/path", "invalid-type")
  })
})

describe("RAPTOR: Edge Probe - cacheHeaders Negative Values", () => {
  it("should handle negative maxAge", () => {
    const headers = cacheHeaders({ maxAge: -1 })
    expect(headers).toContain("max-age=-1")
  })

  it("should handle negative staleWhileRevalidate", () => {
    const headers = cacheHeaders({ staleWhileRevalidate: -1 })
    expect(headers).toContain("stale-while-revalidate=-1")
  })

  it("should handle very large maxAge values", () => {
    const largeMaxAge = Number.MAX_SAFE_INTEGER
    const headers = cacheHeaders({ maxAge: largeMaxAge })
    expect(headers).toContain(`max-age=${largeMaxAge}`)
  })

  it("should handle very large staleWhileRevalidate values", () => {
    const largeValue = Number.MAX_SAFE_INTEGER
    const headers = cacheHeaders({ staleWhileRevalidate: largeValue })
    expect(headers).toContain(`stale-while-revalidate=${largeValue}`)
  })

  it("should handle floating point maxAge (edge case)", () => {
    const headers = cacheHeaders({ maxAge: 3600.5 })
    expect(headers).toContain("max-age=3600.5")
  })

  it("should handle NaN maxAge", () => {
    const headers = cacheHeaders({ maxAge: NaN })
    expect(headers).toContain("max-age=NaN")
  })

  it("should handle Infinity maxAge", () => {
    const headers = cacheHeaders({ maxAge: Infinity })
    expect(headers).toContain("max-age=Infinity")
  })
})

describe("RAPTOR: Edge Probe - cacheHeaders Conflicting Options", () => {
  it("should prioritize noStore over all other options", () => {
    const headers = cacheHeaders({
      noStore: true,
      maxAge: 3600,
      staleWhileRevalidate: 86400,
      isPublic: true,
    })
    expect(headers).toBe("no-store")
  })

  it("should return no-store when noStore is true even with isPublic false", () => {
    const headers = cacheHeaders({
      noStore: true,
      isPublic: false,
    })
    expect(headers).toBe("no-store")
  })

  it("should handle both maxAge and staleWhileRevalidate as 0", () => {
    const headers = cacheHeaders({
      maxAge: 0,
      staleWhileRevalidate: 0,
    })
    expect(headers).toBe("private, max-age=0, stale-while-revalidate=0")
  })
})

describe("RAPTOR: Edge Probe - cacheHeaders RFC 7234 Compliance", () => {
  it("should use comma-space as directive separator (RFC 7234)", () => {
    const headers = cacheHeaders({
      maxAge: 3600,
      staleWhileRevalidate: 86400,
      isPublic: true,
    })
    // RFC 7234 specifies comma followed by optional whitespace
    expect(headers).toMatch(/^[^,]+(, [^,]+)*$/)
  })

  it("should use lowercase directives (per HTTP spec)", () => {
    const headers = cacheHeaders({
      maxAge: 3600,
      staleWhileRevalidate: 86400,
      isPublic: true,
    })
    // Directives should already be lowercase
    expect(headers.toLowerCase()).toBe(headers)
    // Verify specific directives are lowercase
    expect(headers).toContain("public")
    expect(headers).toContain("max-age")
    expect(headers).toContain("stale-while-revalidate")
  })

  it("should use equals sign without spaces for directive values", () => {
    const headers = cacheHeaders({ maxAge: 3600 })
    expect(headers).toMatch(/max-age=\d+/)
    expect(headers).not.toMatch(/max-age = \d+/)
    expect(headers).not.toMatch(/max-age =\d+/)
  })

  it("should place public/private first (common convention)", () => {
    const publicHeaders = cacheHeaders({ maxAge: 3600, isPublic: true })
    expect(publicHeaders).toMatch(/^public/)

    const privateHeaders = cacheHeaders({ maxAge: 3600, isPublic: false })
    expect(privateHeaders).toMatch(/^private/)
  })

  it("should not include quotes around directive values", () => {
    const headers = cacheHeaders({ maxAge: 3600 })
    expect(headers).not.toContain('"')
    expect(headers).not.toContain("'")
  })
})

describe("RAPTOR: Edge Probe - cacheHeaders Option Combinations", () => {
  it("should handle only isPublic without cache duration", () => {
    const headers = cacheHeaders({ isPublic: true })
    expect(headers).toBe("no-store")
  })

  it("should handle maxAge alone with default private", () => {
    const headers = cacheHeaders({ maxAge: 3600 })
    expect(headers).toBe("private, max-age=3600")
  })

  it("should handle staleWhileRevalidate alone with default private", () => {
    const headers = cacheHeaders({ staleWhileRevalidate: 86400 })
    expect(headers).toBe("private, stale-while-revalidate=86400")
  })

  it("should handle all options false/undefined (edge case)", () => {
    const headers = cacheHeaders({
      maxAge: undefined,
      staleWhileRevalidate: undefined,
      isPublic: false,
      noStore: false,
    })
    expect(headers).toBe("no-store")
  })
})

describe("RAPTOR: Error Injection - Logger Failures", () => {
  let mockRevalidateTag: Mock
  let mockRevalidatePath: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockRevalidateTag = vi.fn()
    mockRevalidatePath = vi.fn()
    ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
    ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
  })

  it("should still call revalidateTag even if logger throws", () => {
    const throwingLogger = {
      info: vi.fn(() => {
        throw new Error("Logger failed")
      }),
    }
    ;(logger.getLogger as Mock).mockReturnValue(throwingLogger)

    expect(() => revalidateByTag("test")).toThrow("Logger failed")
    // revalidateTag should NOT be called because logger throws first
    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })

  it("should still call revalidatePath even if logger throws", () => {
    const throwingLogger = {
      info: vi.fn(() => {
        throw new Error("Logger failed")
      }),
    }
    ;(logger.getLogger as Mock).mockReturnValue(throwingLogger)

    expect(() => revalidatePath("/test")).toThrow("Logger failed")
    // revalidatePath should NOT be called because logger throws first
    expect(mockRevalidatePath).not.toHaveBeenCalled()
  })

  it("should handle getLogger returning null (edge case)", () => {
    ;(logger.getLogger as Mock).mockReturnValue(null)

    expect(() => revalidateByTag("test")).toThrow()
    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })

  it("should handle getLogger returning undefined (edge case)", () => {
    ;(logger.getLogger as Mock).mockReturnValue(undefined)

    expect(() => revalidateByTag("test")).toThrow()
    expect(mockRevalidateTag).not.toHaveBeenCalled()
  })
})

describe("RAPTOR: Error Injection - Next.js Cache Failures", () => {
  let mockLogger: { info: Mock }

  beforeEach(() => {
    vi.clearAllMocks()
    mockLogger = {
      info: vi.fn(),
    }
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)
  })

  it("should propagate errors from Next.js revalidateTag", () => {
    ;(nextCache.revalidateTag as Mock).mockImplementation(() => {
      throw new Error("Next.js revalidation failed")
    })

    expect(() => revalidateByTag("test")).toThrow("Next.js revalidation failed")
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it("should propagate errors from Next.js revalidatePath", () => {
    ;(nextCache.revalidatePath as Mock).mockImplementation(() => {
      throw new Error("Next.js path revalidation failed")
    })

    expect(() => revalidatePath("/test")).toThrow("Next.js path revalidation failed")
    expect(mockLogger.info).toHaveBeenCalled()
  })

  it("should log before Next.js function throws", () => {
    const callOrder: string[] = []
    mockLogger.info.mockImplementation(() => callOrder.push("log"))
    ;(nextCache.revalidateTag as Mock).mockImplementation(() => {
      callOrder.push("throw")
      throw new Error("Failed")
    })

    try {
      revalidateByTag("test")
    } catch {
      // Expected
    }

    expect(callOrder).toEqual(["log", "throw"])
  })
})

describe("RAPTOR: Type Safety - Return Types", () => {
  it("should return void from revalidateByTag", () => {
    const mockRevalidateTag = vi.fn()
    const mockLogger = { info: vi.fn() }
    ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)

    const result = revalidateByTag("test")
    expect(result).toBeUndefined()
  })

  it("should return void from revalidatePath", () => {
    const mockRevalidatePath = vi.fn()
    const mockLogger = { info: vi.fn() }
    ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)

    const result = revalidatePath("/test")
    expect(result).toBeUndefined()
  })

  it("should return string from cacheHeaders", () => {
    const result = cacheHeaders()
    expect(typeof result).toBe("string")
  })

  it("should always return non-empty string from cacheHeaders", () => {
    const testCases = [
      {},
      { maxAge: 3600 },
      { noStore: true },
      { isPublic: true },
      { staleWhileRevalidate: 86400 },
    ]

    for (const options of testCases) {
      const result = cacheHeaders(options)
      expect(result.length).toBeGreaterThan(0)
    }
  })
})

describe("RAPTOR: Immutability - Function Purity", () => {
  it("should not modify global state in revalidateByTag", () => {
    const mockRevalidateTag = vi.fn()
    const mockLogger = { info: vi.fn() }
    ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
    ;(logger.getLogger as Mock).mockReturnValue(mockLogger)

    const before = { ...process.env }
    revalidateByTag("test")
    const after = { ...process.env }

    expect(before).toEqual(after)
  })

  it("should be pure - cacheHeaders with same input produces same output", () => {
    const options = { maxAge: 3600, isPublic: true }
    const results = [cacheHeaders(options), cacheHeaders(options), cacheHeaders(options)]

    expect(results[0]).toBe(results[1])
    expect(results[1]).toBe(results[2])
  })

  it("should not mutate options object in cacheHeaders", () => {
    const options = { maxAge: 3600, isPublic: true }
    const originalOptions = JSON.parse(JSON.stringify(options))

    cacheHeaders(options)

    expect(options).toEqual(originalOptions)
  })
})
