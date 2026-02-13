import { describe, expect, it } from "vitest"
import { createEnv } from "@/lib/env"

describe("createEnv", () => {
  const validEnv = {
    DATABASE_URL: "postgresql://user:pass@localhost:5432/mydb",
  }

  describe("happy path", () => {
    it("should return typed env values when all required vars are set", () => {
      const env = createEnv(validEnv)

      expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/mydb")
    })

    it("should accept all valid LOG_LEVEL values", () => {
      for (const level of ["debug", "info", "warn", "error"] as const) {
        const env = createEnv({ ...validEnv, LOG_LEVEL: level })
        expect(env.LOG_LEVEL).toBe(level)
      }
    })

    it("should return SITE_URL when explicitly set", () => {
      const env = createEnv({ ...validEnv, SITE_URL: "https://example.com" })
      expect(env.SITE_URL).toBe("https://example.com")
    })
  })

  describe("defaults", () => {
    it("should default LOG_LEVEL to info when not set", () => {
      const env = createEnv(validEnv)
      expect(env.LOG_LEVEL).toBe("info")
    })

    it("should default SITE_URL to http://localhost:3000 when not set", () => {
      const env = createEnv(validEnv)
      expect(env.SITE_URL).toBe("http://localhost:3000")
    })
  })

  describe("validation errors", () => {
    it("should throw when DATABASE_URL is missing", () => {
      expect(() => createEnv({})).toThrow(/DATABASE_URL/)
    })

    it("should throw when LOG_LEVEL is an invalid value", () => {
      expect(() => createEnv({ ...validEnv, LOG_LEVEL: "verbose" })).toThrow()
    })
  })
})
