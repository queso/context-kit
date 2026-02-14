import { afterEach, describe, expect, it, vi } from "vitest"
import { fetcher } from "@/lib/fetcher"

describe("fetcher", () => {
  afterEach(() => {
    vi.restoreAllMocks()
  })

  it("returns parsed JSON on success", async () => {
    const data = { id: 1, name: "test" }
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(data),
      }),
    )

    const result = await fetcher<{ id: number; name: string }>("/api/test")
    expect(result).toEqual(data)
    expect(fetch).toHaveBeenCalledWith("/api/test")
  })

  it("throws an error with status on non-OK response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
      }),
    )

    try {
      await fetcher("/api/missing")
      expect.unreachable("should have thrown")
    } catch (err) {
      const error = err as Error & { status: number }
      expect(error.message).toBe("Fetch failed")
      expect(error.status).toBe(404)
    }
  })

  it("throws on 500 server error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
      }),
    )

    try {
      await fetcher("/api/broken")
      expect.unreachable("should have thrown")
    } catch (err) {
      const error = err as Error & { status: number }
      expect(error.status).toBe(500)
    }
  })
})
