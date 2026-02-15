import { describe, expect, it } from "vitest"

describe("Web API Headers behavior", () => {
  it("Headers.get() trims whitespace", () => {
    const headers = new Headers()
    headers.set("X-Test", "   value with spaces   ")

    // Headers.get() returns trimmed value
    expect(headers.get("X-Test")).toBe("value with spaces")
  })

  it("Headers.set() trims value whitespace", () => {
    const headers = new Headers()
    headers.set("X-Test", "   spaces   ")

    expect(headers.get("X-Test")).toBe("spaces")
  })

  it("Headers.set() with empty string after trim", () => {
    const headers = new Headers()
    headers.set("X-Test", "   ")

    // Whitespace-only becomes empty string
    expect(headers.get("X-Test")).toBe("")
  })
})
