import { afterAll, describe, expect, it, mock, spyOn } from "bun:test"

// Spy on the real env module (a module mock would leak into env.test.ts). sitemap/robots read
// SITE_URL through getEnv(), so only that export is stubbed.
const envMod = await import("@/lib/env")
spyOn(envMod, "getEnv").mockReturnValue({
  ...envMod.createEnv({ DATABASE_URL: "sqlite::memory:" }),
  SITE_URL: "https://example.com",
})

afterAll(() => {
  mock.restore()
})

describe("Sitemap", () => {
  it("should return an array of entries with valid URLs", async () => {
    const sitemap = (await import("@/app/sitemap")).default
    const result = sitemap()

    expect(Array.isArray(result)).toBe(true)
    expect(result.length).toBeGreaterThanOrEqual(1)

    // Verify first entry is the home page with correct site URL
    expect(result[0]).toHaveProperty("url")
    expect(result[0].url).toBe("https://example.com")
    expect(result[0]).toHaveProperty("lastModified")
    expect(result[0].lastModified).toBeInstanceOf(Date)
  })
})

describe("Robots", () => {
  it("should return rules allowing all user agents and a sitemap URL", async () => {
    const robots = (await import("@/app/robots")).default
    const result = robots()

    expect(result).toHaveProperty("rules")
    expect(result).toHaveProperty("sitemap")

    // Rules should allow all user agents to crawl from root
    const rules = Array.isArray(result.rules) ? result.rules : [result.rules]
    const allowAllRule = rules.find(
      (rule: { userAgent?: string | string[]; allow?: string | string[] }) =>
        (rule.userAgent === "*" ||
          (Array.isArray(rule.userAgent) && rule.userAgent.includes("*"))) &&
        rule.allow === "/",
    )
    expect(allowAllRule).toBeDefined()
    expect(allowAllRule?.userAgent).toBe("*")
    expect(allowAllRule?.allow).toBe("/")

    // Sitemap should be the correct full URL
    expect(result.sitemap).toBe("https://example.com/sitemap.xml")
  })
})
