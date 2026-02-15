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

describe("RAPTOR RE-PROBE: Functional Correctness Beyond P3 Issues", () => {
  describe("revalidateByTag - Actual Bugs", () => {
    let mockRevalidateTag: Mock
    let mockLogger: { info: Mock }

    beforeEach(() => {
      vi.clearAllMocks()
      mockRevalidateTag = vi.fn()
      mockLogger = { info: vi.fn() }
      ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
      ;(logger.getLogger as Mock).mockReturnValue(mockLogger)
    })

    it("should pass tag argument correctly without mutation", () => {
      const tag = "posts"
      revalidateByTag(tag)
      expect(mockRevalidateTag).toHaveBeenCalledWith("posts", "default")
      expect(mockRevalidateTag).toHaveBeenCalledWith(tag, "default")
    })

    it("should handle empty string tag correctly", () => {
      revalidateByTag("")
      expect(mockRevalidateTag).toHaveBeenCalledWith("", "default")
      expect(mockLogger.info).toHaveBeenCalledWith({ tag: "" }, "Revalidating cache by tag")
    })

    it("should propagate Next.js revalidateTag errors correctly", () => {
      const error = new Error("Next.js revalidation failed")
      mockRevalidateTag.mockImplementation(() => {
        throw error
      })

      expect(() => revalidateByTag("test")).toThrow("Next.js revalidation failed")
      expect(mockLogger.info).toHaveBeenCalled() // Log happens before error
    })

    it("should complete revalidation even if logger.info returns a value", () => {
      mockLogger.info.mockReturnValue("some return value")
      revalidateByTag("test")
      expect(mockRevalidateTag).toHaveBeenCalled()
    })
  })

  describe("revalidatePath - Actual Bugs", () => {
    let mockRevalidatePath: Mock
    let mockLogger: { info: Mock }

    beforeEach(() => {
      vi.clearAllMocks()
      mockRevalidatePath = vi.fn()
      mockLogger = { info: vi.fn() }
      ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
      ;(logger.getLogger as Mock).mockReturnValue(mockLogger)
    })

    it("should correctly pass undefined type to Next.js when not provided", () => {
      revalidatePath("/test")
      expect(mockRevalidatePath).toHaveBeenCalledWith("/test", undefined)
      // Verify it's actually undefined, not null or missing
      const calls = mockRevalidatePath.mock.calls
      expect(calls[0]).toHaveLength(2)
      expect(calls[0][1]).toBeUndefined()
    })

    it("should correctly pass type parameter to Next.js", () => {
      revalidatePath("/test", "page")
      expect(mockRevalidatePath).toHaveBeenCalledWith("/test", "page")

      vi.clearAllMocks()
      revalidatePath("/test", "layout")
      expect(mockRevalidatePath).toHaveBeenCalledWith("/test", "layout")
    })

    it("should propagate Next.js revalidatePath errors correctly", () => {
      const error = new Error("Path revalidation failed")
      mockRevalidatePath.mockImplementation(() => {
        throw error
      })

      expect(() => revalidatePath("/test")).toThrow("Path revalidation failed")
      expect(mockLogger.info).toHaveBeenCalled()
    })

    it("should handle empty string path correctly", () => {
      revalidatePath("")
      expect(mockRevalidatePath).toHaveBeenCalledWith("", undefined)
      expect(mockLogger.info).toHaveBeenCalledWith(
        { path: "", type: undefined },
        "Revalidating cache by path",
      )
    })
  })

  describe("cacheHeaders - Logic Bugs", () => {
    it("should handle explicit false for noStore correctly", () => {
      // Verify that noStore: false actually allows caching
      const headers = cacheHeaders({ noStore: false, maxAge: 60 })
      expect(headers).not.toBe("no-store")
      expect(headers).toContain("max-age=60")
    })

    it("should handle explicit false for isPublic correctly", () => {
      const headers = cacheHeaders({ isPublic: false, maxAge: 60 })
      expect(headers).toContain("private")
      expect(headers).not.toContain("public")
    })

    it("should handle both maxAge and staleWhileRevalidate as 0 correctly", () => {
      const headers = cacheHeaders({ maxAge: 0, staleWhileRevalidate: 0 })
      expect(headers).toBe("private, max-age=0, stale-while-revalidate=0")
    })

    it("should not add undefined to directive list", () => {
      // Edge case: ensure undefined values don't slip into output
      const headers = cacheHeaders({ maxAge: 60 })
      expect(headers).not.toContain("undefined")
      expect(headers).not.toContain("null")
    })

    it("should handle maxAge=0 correctly (not treat as falsy)", () => {
      // 0 is falsy in JS, but should still be added as a directive
      const headers = cacheHeaders({ maxAge: 0 })
      expect(headers).toContain("max-age=0")
      expect(headers).not.toBe("no-store")
    })

    it("should handle staleWhileRevalidate=0 correctly (not treat as falsy)", () => {
      // 0 is falsy in JS, but should still be added as a directive
      const headers = cacheHeaders({ staleWhileRevalidate: 0 })
      expect(headers).toContain("stale-while-revalidate=0")
      expect(headers).not.toBe("no-store")
    })

    it("should not mutate input options object", () => {
      const options = { maxAge: 60, isPublic: true }
      const originalOptions = { ...options }
      cacheHeaders(options)
      expect(options).toEqual(originalOptions)
    })

    it("should be deterministic - multiple calls with same input produce same output", () => {
      const options = { maxAge: 60, staleWhileRevalidate: 120, isPublic: true }
      const results = [cacheHeaders(options), cacheHeaders(options), cacheHeaders(options)]
      expect(results[0]).toBe(results[1])
      expect(results[1]).toBe(results[2])
    })

    it("should handle directive ordering consistently", () => {
      // public/private should always be first
      const publicHeaders = cacheHeaders({ maxAge: 60, isPublic: true })
      expect(publicHeaders.indexOf("public")).toBe(0)

      const privateHeaders = cacheHeaders({ maxAge: 60, isPublic: false })
      expect(privateHeaders.indexOf("private")).toBe(0)
    })

    it("should separate directives with exactly comma-space", () => {
      const headers = cacheHeaders({ maxAge: 60, staleWhileRevalidate: 120 })
      // Should be ", " not "," or " ,"
      expect(headers).toContain(", ")
      expect(headers).not.toMatch(/,[^ ]/) // No comma without space
      expect(headers).not.toMatch(/[^,] ,/) // No space-comma
    })
  })

  describe("RAPTOR: Boundary Conditions", () => {
    it("cacheHeaders should handle options with only isPublic (no cache duration)", () => {
      // isPublic alone without maxAge or staleWhileRevalidate
      const headers = cacheHeaders({ isPublic: true })
      expect(headers).toBe("no-store")
    })

    it("cacheHeaders should handle all undefined/missing options", () => {
      const headers = cacheHeaders({
        maxAge: undefined,
        staleWhileRevalidate: undefined,
        isPublic: undefined,
        noStore: undefined,
      })
      expect(headers).toBe("no-store")
    })

    it("should handle rapid successive calls to revalidateByTag", () => {
      const mockRevalidateTag = vi.fn()
      const mockLogger = { info: vi.fn() }
      ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
      ;(logger.getLogger as Mock).mockReturnValue(mockLogger)

      // Simulate rapid calls
      for (let i = 0; i < 100; i++) {
        revalidateByTag(`tag-${i}`)
      }

      expect(mockRevalidateTag).toHaveBeenCalledTimes(100)
      expect(mockLogger.info).toHaveBeenCalledTimes(100)
    })

    it("should handle rapid successive calls to revalidatePath", () => {
      const mockRevalidatePath = vi.fn()
      const mockLogger = { info: vi.fn() }
      ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
      ;(logger.getLogger as Mock).mockReturnValue(mockLogger)

      // Simulate rapid calls
      for (let i = 0; i < 100; i++) {
        revalidatePath(`/path-${i}`)
      }

      expect(mockRevalidatePath).toHaveBeenCalledTimes(100)
      expect(mockLogger.info).toHaveBeenCalledTimes(100)
    })
  })

  describe("RAPTOR: Type Coercion and String Handling", () => {
    it("cacheHeaders should handle numeric values correctly (not strings)", () => {
      // maxAge and staleWhileRevalidate are numbers, not strings
      const headers = cacheHeaders({ maxAge: 60, staleWhileRevalidate: 120 })
      expect(headers).toBe("private, max-age=60, stale-while-revalidate=120")
      // Verify no quotes around numbers
      expect(headers).not.toContain('"')
      expect(headers).not.toContain("'")
    })

    it("should handle maxAge as 0 vs undefined correctly", () => {
      const headersWithZero = cacheHeaders({ maxAge: 0 })
      const headersWithUndefined = cacheHeaders({ maxAge: undefined })

      expect(headersWithZero).toContain("max-age=0")
      expect(headersWithUndefined).toBe("no-store")
    })
  })

  describe("RAPTOR: Return Type Verification", () => {
    it("revalidateByTag should return void (undefined)", () => {
      const mockRevalidateTag = vi.fn()
      const mockLogger = { info: vi.fn() }
      ;(nextCache.revalidateTag as Mock).mockImplementation(mockRevalidateTag)
      ;(logger.getLogger as Mock).mockReturnValue(mockLogger)

      const result = revalidateByTag("test")
      expect(result).toBeUndefined()
    })

    it("revalidatePath should return void (undefined)", () => {
      const mockRevalidatePath = vi.fn()
      const mockLogger = { info: vi.fn() }
      ;(nextCache.revalidatePath as Mock).mockImplementation(mockRevalidatePath)
      ;(logger.getLogger as Mock).mockReturnValue(mockLogger)

      const result = revalidatePath("/test")
      expect(result).toBeUndefined()
    })

    it("cacheHeaders should always return a non-empty string", () => {
      const testCases = [
        {},
        { maxAge: 60 },
        { staleWhileRevalidate: 120 },
        { maxAge: 60, staleWhileRevalidate: 120 },
        { noStore: true },
        { isPublic: true },
        { maxAge: 0 },
      ]

      for (const options of testCases) {
        const result = cacheHeaders(options)
        expect(typeof result).toBe("string")
        expect(result.length).toBeGreaterThan(0)
      }
    })
  })
})
