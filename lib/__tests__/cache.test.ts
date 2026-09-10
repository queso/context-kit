import { afterAll, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"

// Module mocks are process-global in bun:test, so only next/cache (which nothing else needs for
// real) is mocked this way. The mock must be registered before @/lib/cache is imported.
const revalidateTag = mock()
const nextRevalidatePath = mock()
mock.module("next/cache", () => ({
  revalidateTag,
  revalidatePath: nextRevalidatePath,
}))

// Spy on the real logger module rather than replacing it (logger.test.ts needs the real one).
const loggerMod = await import("@/lib/logger")
const noopLogger = { info: mock(), error: mock(), warn: mock(), debug: mock() }
spyOn(loggerMod, "getLogger").mockReturnValue(
  noopLogger as unknown as ReturnType<typeof loggerMod.getLogger>,
)

const { cacheHeaders, revalidateByTag, revalidatePath } = await import("@/lib/cache")

afterAll(() => {
  mock.restore()
})

describe("revalidateByTag", () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  it("should call Next.js revalidateTag with the provided tag", () => {
    revalidateByTag("posts")
    expect(revalidateTag).toHaveBeenCalledWith("posts", "default")
  })
})

describe("revalidatePath", () => {
  beforeEach(() => {
    mock.clearAllMocks()
  })

  it("should call Next.js revalidatePath with path only", () => {
    revalidatePath("/posts")
    expect(nextRevalidatePath).toHaveBeenCalledWith("/posts", undefined)
  })

  it("should call Next.js revalidatePath with path and type", () => {
    revalidatePath("/dashboard", "page")
    expect(nextRevalidatePath).toHaveBeenCalledWith("/dashboard", "page")
  })
})

describe("cacheHeaders", () => {
  describe("defaults and noStore", () => {
    it("should return no-store by default when called with no arguments", () => {
      expect(cacheHeaders()).toBe("no-store")
    })

    it("should return no-store when called with empty options", () => {
      expect(cacheHeaders({})).toBe("no-store")
    })

    it("noStore takes precedence over all other options", () => {
      const headers = cacheHeaders({
        noStore: true,
        maxAge: 3600,
        staleWhileRevalidate: 86400,
        isPublic: true,
      })
      expect(headers).toBe("no-store")
    })
  })

  describe("maxAge", () => {
    it("should set max-age directive", () => {
      expect(cacheHeaders({ maxAge: 3600 })).toBe("private, max-age=3600")
    })

    it("should handle maxAge=0", () => {
      expect(cacheHeaders({ maxAge: 0 })).toBe("private, max-age=0")
    })
  })

  describe("staleWhileRevalidate", () => {
    it("should set stale-while-revalidate directive", () => {
      expect(cacheHeaders({ staleWhileRevalidate: 86400 })).toBe(
        "private, stale-while-revalidate=86400",
      )
    })

    it("should handle staleWhileRevalidate=0", () => {
      expect(cacheHeaders({ staleWhileRevalidate: 0 })).toBe("private, stale-while-revalidate=0")
    })
  })

  describe("isPublic flag", () => {
    it("should default to private when isPublic is not set", () => {
      expect(cacheHeaders({ maxAge: 3600 })).toMatch(/^private/)
    })

    it("should use public when isPublic is true", () => {
      expect(cacheHeaders({ maxAge: 3600, isPublic: true })).toMatch(/^public/)
    })

    it("should use private when isPublic is false", () => {
      expect(cacheHeaders({ maxAge: 3600, isPublic: false })).toMatch(/^private/)
    })
  })

  describe("combined options", () => {
    it("should combine maxAge and staleWhileRevalidate", () => {
      const headers = cacheHeaders({
        maxAge: 3600,
        staleWhileRevalidate: 86400,
      })
      expect(headers).toBe("private, max-age=3600, stale-while-revalidate=86400")
    })

    it("should create complete header with all options", () => {
      const headers = cacheHeaders({
        maxAge: 3600,
        staleWhileRevalidate: 86400,
        isPublic: true,
      })
      expect(headers).toBe("public, max-age=3600, stale-while-revalidate=86400")
    })
  })
})
