import { describe, expect, it } from "vitest"
import { createEnv } from "@/lib/env"

const validEnv = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/mydb",
}

describe("RAPTOR: Manual Edge Case Verification", () => {
  it("should document behavior with scientific notation RATE_LIMIT_RPM", () => {
    // Zod coerce.number() accepts scientific notation
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "1e5" })
    console.log("Scientific notation '1e5' produces:", env.RATE_LIMIT_RPM)
    expect(env.RATE_LIMIT_RPM).toBe(100000)
    // This is valid JavaScript number parsing, but may not be intended
  })

  it("should document behavior with spaces in RATE_LIMIT_RPM", () => {
    // Zod coerce.number() trims whitespace before parsing
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: " 60 " })
    console.log("Spaces ' 60 ' produces:", env.RATE_LIMIT_RPM)
    expect(env.RATE_LIMIT_RPM).toBe(60)
    // Whitespace is automatically trimmed - may or may not be intended
  })

  it("should document behavior with leading zeros", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "0060" })
    console.log("Leading zeros '0060' produces:", env.RATE_LIMIT_RPM)
    expect(env.RATE_LIMIT_RPM).toBe(60)
  })

  it("should document behavior with plus sign", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "+60" })
    console.log("Plus sign '+60' produces:", env.RATE_LIMIT_RPM)
    expect(env.RATE_LIMIT_RPM).toBe(60)
  })

  it("should verify CORS_ORIGIN whitespace handling", () => {
    const testCases = [
      { input: " https://example.com", expected: " https://example.com" },
      { input: "https://example.com ", expected: "https://example.com " },
      { input: " https://example.com ", expected: " https://example.com " },
    ]

    console.log("\n=== CORS_ORIGIN Whitespace Handling ===")
    for (const { input, expected } of testCases) {
      const env = createEnv({ ...validEnv, CORS_ORIGIN: input })
      console.log(`Input: "${input}" => "${env.CORS_ORIGIN}"`)
      expect(env.CORS_ORIGIN).toBe(expected)
    }
    console.log("⚠️ Whitespace is preserved - may break URL matching!")
  })

  it("should verify CORS_ORIGIN comma-separated handling", () => {
    const corsOrigin = "https://app1.com,https://app2.com"
    const env = createEnv({ ...validEnv, CORS_ORIGIN: corsOrigin })

    console.log("\n=== Multiple Origins ===")
    console.log(`Input: ${corsOrigin}`)
    console.log(`Stored as single string: ${env.CORS_ORIGIN}`)
    console.log("⚠️ No array parsing - consumer must split manually")
  })

  it("should verify CORS_ORIGIN without protocol", () => {
    const env = createEnv({ ...validEnv, CORS_ORIGIN: "example.com" })
    console.log("\n=== Origin Without Protocol ===")
    console.log(`Input: "example.com" => "${env.CORS_ORIGIN}"`)
    console.log("⚠️ Accepted but may not match CORS spec (needs protocol)")
  })

  it("should verify edge case: RATE_LIMIT_RPM=1 (very restrictive)", () => {
    const env = createEnv({ ...validEnv, RATE_LIMIT_RPM: "1" })
    console.log("\n=== Minimum Rate Limit ===")
    console.log(`RATE_LIMIT_RPM=1 => ${env.RATE_LIMIT_RPM} request per minute`)
    console.log("✓ Valid but extremely restrictive (1 req/min)")
  })
})
