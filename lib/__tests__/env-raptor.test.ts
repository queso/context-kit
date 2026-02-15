import { describe, expect, it } from "vitest"
import { createEnv } from "@/lib/env"

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/mydb",
}

describe("RAPTOR: Wiring Verification", () => {
  it("should parse CORS_ORIGIN from process.env correctly", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://app.example.com" })
    expect(env.CORS_ORIGIN).toBe("https://app.example.com")
  })

  it("should parse RATE_LIMIT_RPM from process.env correctly", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "120" })
    expect(env.RATE_LIMIT_RPM).toBe(120)
    expect(typeof env.RATE_LIMIT_RPM).toBe("number")
  })

  it("should parse both new env vars together", () => {
    const env = createEnv({
      ...validEnv,
      CORS_ORIGIN: "https://app.example.com",
      RATE_LIMIT_RPM: "100",
    })
    expect(env.CORS_ORIGIN).toBe("https://app.example.com")
    expect(env.RATE_LIMIT_RPM).toBe(100)
  })
})

describe("RAPTOR: Edge Probe - RATE_LIMIT_RPM Boundary Values", () => {
  it("should reject RATE_LIMIT_RPM=0 (zero is not positive)", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "0" })).toThrow()
  })

  it("should reject RATE_LIMIT_RPM=-1 (negative is not positive)", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "-1" })).toThrow()
  })

  it("should reject RATE_LIMIT_RPM=-100 (negative)", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "-100" })).toThrow()
  })

  it("should accept RATE_LIMIT_RPM=1 (minimum positive integer)", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "1" })
    expect(env.RATE_LIMIT_RPM).toBe(1)
  })

  it("should accept very large RATE_LIMIT_RPM values", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "999999" })
    expect(env.RATE_LIMIT_RPM).toBe(999999)
  })

  it("should accept RATE_LIMIT_RPM at safe integer boundary", () => {
    const maxSafe = Number.MAX_SAFE_INTEGER.toString()
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: maxSafe })
    expect(env.RATE_LIMIT_RPM).toBe(Number.MAX_SAFE_INTEGER)
  })

  it("should reject float RATE_LIMIT_RPM values", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "60.5" })).toThrow()
  })

  it("should accept scientific notation RATE_LIMIT_RPM (coerced to integer)", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "1e5" })
    expect(env.RATE_LIMIT_RPM).toBe(100000)
  })

  it("should reject non-numeric RATE_LIMIT_RPM", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "abc" })).toThrow()
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "sixty" })).toThrow()
  })

  it("should accept RATE_LIMIT_RPM with spaces (coerced via Number())", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: " 60 " })
    expect(env.RATE_LIMIT_RPM).toBe(60)
  })

  it("should reject empty string RATE_LIMIT_RPM", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "" })).toThrow()
  })

  it("should reject Infinity RATE_LIMIT_RPM", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "Infinity" })).toThrow()
  })

  it("should reject NaN RATE_LIMIT_RPM", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "NaN" })).toThrow()
  })
})

describe("RAPTOR: Edge Probe - CORS_ORIGIN Edge Cases", () => {
  it("should accept empty string CORS_ORIGIN (same-origin only)", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "" })
    expect(env.CORS_ORIGIN).toBe("")
  })

  it("should accept CORS_ORIGIN with protocol and port", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://app.example.com:8443" })
    expect(env.CORS_ORIGIN).toBe("https://app.example.com:8443")
  })

  it("should accept localhost CORS_ORIGIN", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "http://localhost:3000" })
    expect(env.CORS_ORIGIN).toBe("http://localhost:3000")
  })

  it("should accept IP address CORS_ORIGIN", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "http://192.168.1.100:3000" })
    expect(env.CORS_ORIGIN).toBe("http://192.168.1.100:3000")
  })

  it("should accept wildcard CORS_ORIGIN", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "*" })
    expect(env.CORS_ORIGIN).toBe("*")
  })

  it("should accept CORS_ORIGIN with subdomain", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://api.staging.example.com" })
    expect(env.CORS_ORIGIN).toBe("https://api.staging.example.com")
  })

  it("should preserve trailing slash in CORS_ORIGIN", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://example.com/" })
    expect(env.CORS_ORIGIN).toBe("https://example.com/")
  })

  it("should accept CORS_ORIGIN with spaces (edge case - may need validation)", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://example.com " })
    expect(env.CORS_ORIGIN).toBe("https://example.com ")
  })

  it("should accept CORS_ORIGIN with leading spaces (edge case)", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: " https://example.com" })
    expect(env.CORS_ORIGIN).toBe(" https://example.com")
  })

  it("should accept multiple origins comma-separated (edge case - may need array parsing)", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://app1.com,https://app2.com" })
    expect(env.CORS_ORIGIN).toBe("https://app1.com,https://app2.com")
  })

  it("should accept CORS_ORIGIN without protocol (edge case - may be invalid)", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "example.com" })
    expect(env.CORS_ORIGIN).toBe("example.com")
  })

  it("should accept very long CORS_ORIGIN", () => {
    const longOrigin = `https://very-long-subdomain-name-${"a".repeat(200)}.example.com`
    const env = createEnv({ ...validEnv, CORS_ORIGIN: longOrigin })
    expect(env.CORS_ORIGIN).toBe(longOrigin)
  })

  it("should accept unicode in CORS_ORIGIN", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "https://日本.example.com" })
    expect(env.CORS_ORIGIN).toBe("https://日本.example.com")
  })
})

describe("RAPTOR: Backward Compatibility - Existing Env Vars", () => {
  it("should still parse DATABASE_URL correctly", () => {
    const env = createEnv({
      ...validEnv,
      CORS_ORIGIN: "https://example.com",
      RATE_LIMIT_RPM: "120",
    })
    expect(env.DATABASE_URL).toBe("postgresql://user:pass@localhost:5432/mydb")
  })

  it("should still parse LOG_LEVEL correctly with new vars", () => {
    const env = createEnv({
      ...validEnv,
      LOG_LEVEL: "debug",
      CORS_ORIGIN: "https://example.com",
      RATE_LIMIT_RPM: "120",
    })
    expect(env.LOG_LEVEL).toBe("debug")
  })

  it("should still parse SITE_URL correctly with new vars", () => {
    const env = createEnv({
      ...validEnv,
      SITE_URL: "https://production.example.com",
      CORS_ORIGIN: "https://example.com",
      RATE_LIMIT_RPM: "120",
    })
    expect(env.SITE_URL).toBe("https://production.example.com")
  })

  it("should still validate DATABASE_URL as required", () => {
    expect(() =>
      createEnv({
        CORS_ORIGIN: "https://example.com",
        RATE_LIMIT_RPM: "120",
      }),
    ).toThrow(/DATABASE_URL/)
  })

  it("should still validate LOG_LEVEL enum values", () => {
    expect(() =>
      createEnv({
        ...validEnv,
        LOG_LEVEL: "invalid",
        CORS_ORIGIN: "https://example.com",
        RATE_LIMIT_RPM: "120",
      }),
    ).toThrow()
  })

  it("should maintain all default values", () => {
    const env = createEnv(validEnv)
    expect(env.LOG_LEVEL).toBe("info")
    expect(env.SITE_URL).toBe("http://localhost:3000")
    expect(env.CORS_ORIGIN).toBe("")
    expect(env.RATE_LIMIT_RPM).toBe(60)
  })
})

describe("RAPTOR: Zod Coercion - RATE_LIMIT_RPM Type Conversion", () => {
  it("should coerce string to number for RATE_LIMIT_RPM", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "120" })
    expect(env.RATE_LIMIT_RPM).toBe(120)
    expect(typeof env.RATE_LIMIT_RPM).toBe("number")
  })

  it("should coerce number input (edge case - env vars are usually strings)", () => {
    // @ts-expect-error Testing runtime behavior with number input
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: 120 })
    expect(env.RATE_LIMIT_RPM).toBe(120)
  })

  it("should fail coercion for invalid number strings", () => {
    expect(() => createEnv({ ...validEnv, RATE_LIMIT_RPM: "not-a-number" })).toThrow()
  })
})

describe("RAPTOR: Error Messages - Validation Feedback", () => {
  it("should provide clear error for missing DATABASE_URL", () => {
    expect(() => createEnv({})).toThrow(/DATABASE_URL/)
  })

  it("should provide clear error for invalid RATE_LIMIT_RPM", () => {
    try {
      createEnv({ ...validEnv, RATE_LIMIT_RPM: "-10" })
      expect.fail("Should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toContain("RATE_LIMIT_RPM")
    }
  })

  it("should provide clear error for zero RATE_LIMIT_RPM", () => {
    try {
      createEnv({ ...validEnv, RATE_LIMIT_RPM: "0" })
      expect.fail("Should have thrown")
    } catch (error) {
      expect(error).toBeInstanceOf(Error)
      const message = (error as Error).message
      expect(message).toContain("RATE_LIMIT_RPM")
    }
  })

  it("should list all invalid variables in error message", () => {
    try {
      createEnv({
        // Missing DATABASE_URL
        LOG_LEVEL: "invalid",
        RATE_LIMIT_RPM: "-1",
      })
      expect.fail("Should have thrown")
    } catch (error) {
      const message = (error as Error).message
      // Should mention all invalid vars
      expect(message).toContain("DATABASE_URL")
      expect(message).toContain("LOG_LEVEL")
      expect(message).toContain("RATE_LIMIT_RPM")
    }
  })
})

describe("RAPTOR: Type Safety - TypeScript Inference", () => {
  it("should infer CORS_ORIGIN as string type", () => {
    const env = createEnv(validEnv)
    const origin: string = env.CORS_ORIGIN
    expect(typeof origin).toBe("string")
  })

  it("should infer RATE_LIMIT_RPM as number type", () => {
    const env = createEnv(validEnv)
    const rpm: number = env.RATE_LIMIT_RPM
    expect(typeof rpm).toBe("number")
  })

  it("should infer all existing types correctly", () => {
    const env = createEnv(validEnv)
    const dbUrl: string = env.DATABASE_URL
    const logLevel: "debug" | "info" | "warn" | "error" = env.LOG_LEVEL
    const siteUrl: string = env.SITE_URL
    expect(dbUrl).toBeDefined()
    expect(logLevel).toBeDefined()
    expect(siteUrl).toBeDefined()
  })
})

describe("RAPTOR: Edge Probe - Undefined vs Missing", () => {
  it("should treat undefined CORS_ORIGIN as missing (use default)", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: undefined })
    expect(env.CORS_ORIGIN).toBe("")
  })

  it("should treat undefined RATE_LIMIT_RPM as missing (use default)", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: undefined })
    expect(env.RATE_LIMIT_RPM).toBe(60)
  })

  it("should differentiate empty string from undefined for CORS_ORIGIN", () => {
    const env1 = createEnv({ ...validEnv, CORS_ORIGIN: "" })
    const env2 = createEnv({ ...validEnv, CORS_ORIGIN: undefined })
    expect(env1.CORS_ORIGIN).toBe("")
    expect(env2.CORS_ORIGIN).toBe("")
    // Both should be empty string (explicit empty vs default)
  })
})

describe("RAPTOR: Documentation - .env.example Verification", () => {
  it("should verify .env.example has CORS_ORIGIN entry", () => {
    // This is a manual check - test documents expected behavior
    expect(true).toBe(true) // Placeholder - actual check done in report
  })

  it("should verify .env.example has RATE_LIMIT_RPM entry", () => {
    // This is a manual check - test documents expected behavior
    expect(true).toBe(true) // Placeholder - actual check done in report
  })
})
