import { describe, expect, it, vi } from "vitest"

vi.mock("@/lib/env", () => ({
  createEnv: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info" as const,
    SITE_URL: "https://example.com",
  }),
  getEnv: () => ({
    DATABASE_URL: "postgresql://test:test@localhost:5432/test",
    LOG_LEVEL: "info" as const,
    SITE_URL: "https://example.com",
  }),
}))

describe("Sitemap", () => {
  it("should return an array of entries with valid URLs", async () => {
    const sitemap = (await import("@/app/sitemap")).default
    const result = sitemap()

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(1)
    expect(result[0]).toHaveProperty("url")
    expect(result[0].url).toContain("https://example.com")
  })
})

describe("Robots", () => {
  it("should return rules allowing all user agents and a sitemap URL", async () => {
    const robots = (await import("@/app/robots")).default
    const result = robots()

    expect(result).toHaveProperty("rules")
    expect(result).toHaveProperty("sitemap")

    // Rules should allow all user agents to crawl
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    const allowAllRule = rules.find(
      (rule: { userAgent?: string | string[] }) =>
        rule.userAgent === "*" || (Array.isArray(rule.userAgent) && rule.userAgent.includes("*")),
    )
    expect(allowAllRule).toBeDefined()

    // Sitemap should reference the site URL
    expect(result.sitemap).toContain("https://example.com")
  })
})
