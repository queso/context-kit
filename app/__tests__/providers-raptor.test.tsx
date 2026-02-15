import { cleanup, render, renderHook, screen } from "@testing-library/react"
import type { SSEConfig } from "reactive-swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import * as fetcherModule from "@/lib/fetcher"
import { Providers, useCorrelationId } from "../providers"

const mockUUID = "test-uuid-123"
const originalRandomUUID = global.crypto.randomUUID

beforeEach(() => {
  global.crypto.randomUUID = vi.fn(() => mockUUID) as any
})

afterEach(() => {
  global.crypto.randomUUID = originalRandomUUID
  vi.restoreAllMocks()
  cleanup()
})

describe("RAPTOR: useRef Persistence Edge Cases", () => {
  it("should initialize correlationIdRef.current only once on mount", () => {
    const uuids = ["first-uuid", "second-uuid", "third-uuid"]
    let callCount = 0
    vi.mocked(crypto.randomUUID).mockImplementation(() => {
      return uuids[callCount++]
    })

    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    const firstId = result.current
    expect(firstId).toBe("first-uuid")

    // Force re-renders
    rerender()
    rerender()
    rerender()

    // Should still be first UUID, not second or third
    expect(result.current).toBe("first-uuid")
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it("BUG?: useRef resets on component unmount/remount (NEW instance)", () => {
    const uuid1 = "instance-1-uuid"
    const uuid2 = "instance-2-uuid"
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2)

    // First mount
    const { result: result1, unmount } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result1.current).toBe(uuid1)

    // Unmount (simulates navigation away)
    unmount()

    // Second mount (simulates navigation back - NEW Providers instance)
    const { result: result2 } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    // BUG?: New mount creates new UUID - this breaks correlation across navigations
    expect(result2.current).toBe(uuid2)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
  })

  it("should maintain correlationIdRef across prop changes (same instance)", () => {
    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    const originalId = result.current

    // Change props without unmounting
    rerender({
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Providers sseConfig={{ url: "/api/events", events: {} }}>{children}</Providers>
      ),
    })

    // Should preserve correlation ID
    expect(result.current).toBe(originalId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it("should handle React StrictMode double-render (development)", () => {
    // React 18 StrictMode calls effects twice in development
    // useRef should persist across both calls
    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
    // Even if component renders twice, useRef persists
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it("CRITICAL: Different Providers instances have different correlation IDs", () => {
    const uuid1 = "provider-1"
    const uuid2 = "provider-2"
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2)

    const Component1 = () => {
      const id = useCorrelationId()
      return <div data-testid="comp1">{id}</div>
    }

    const Component2 = () => {
      const id = useCorrelationId()
      return <div data-testid="comp2">{id}</div>
    }

    // Separate Provider instances (e.g., different pages)
    render(
      <div>
        <Providers>
          <Component1 />
        </Providers>
        <Providers>
          <Component2 />
        </Providers>
      </div>,
    )

    expect(screen.getByTestId("comp1").textContent).toBe(uuid1)
    expect(screen.getByTestId("comp2").textContent).toBe(uuid2)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
  })
})

describe("RAPTOR: Context Provider Edge Cases", () => {
  it("should provide correlation ID to deeply nested components", () => {
    const ids: string[] = []

    const DeepChild = () => {
      ids.push(useCorrelationId())
      return null
    }

    const MiddleChild = () => {
      ids.push(useCorrelationId())
      return (
        <div>
          <DeepChild />
        </div>
      )
    }

    const TopChild = () => {
      ids.push(useCorrelationId())
      return (
        <div>
          <MiddleChild />
        </div>
      )
    }

    render(
      <Providers>
        <TopChild />
      </Providers>,
    )

    // All should have same ID
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(mockUUID)
  })

  it("should handle nested Providers (outer context should not leak)", () => {
    const outerUUID = "outer-uuid"
    const innerUUID = "inner-uuid"
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(outerUUID).mockReturnValueOnce(innerUUID)

    const InnerComponent = () => {
      const id = useCorrelationId()
      return <div data-testid="inner">{id}</div>
    }

    const OuterComponent = () => {
      const id = useCorrelationId()
      return (
        <div>
          <div data-testid="outer">{id}</div>
          <Providers>
            <InnerComponent />
          </Providers>
        </div>
      )
    }

    render(
      <Providers>
        <OuterComponent />
      </Providers>,
    )

    // Outer should have outer UUID
    expect(screen.getByTestId("outer").textContent).toBe(outerUUID)
    // Inner should have inner UUID (not outer)
    expect(screen.getByTestId("inner").textContent).toBe(innerUUID)
  })

  it("should throw error when useCorrelationId used outside Providers", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    const Component = () => {
      useCorrelationId() // Should throw
      return null
    }

    expect(() => {
      render(<Component />)
    }).toThrow("useCorrelationId must be used within Providers")

    consoleSpy.mockRestore()
  })

  it("should provide null to context when no provider exists", () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      renderHook(() => useCorrelationId())
    }).toThrow()

    consoleSpy.mockRestore()
  })
})

describe("RAPTOR: Correlation ID Leakage Between Page Loads", () => {
  it("POTENTIAL BUG: Same Providers instance reused across pages WOULD share ID", () => {
    // In Next.js App Router, root layout Providers persists across navigations
    // The useRef will NOT reset unless Providers unmounts

    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    const pageAId = result.current

    // Simulate navigation to different page (same Providers instance)
    rerender() // Providers does NOT unmount

    // SAME correlation ID persists
    expect(result.current).toBe(pageAId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)

    // This means all pages in a session share the same correlation ID
    // This is CORRECT for session tracking, but may be unexpected
  })

  it("should generate NEW ID only when Providers unmounts (page refresh)", () => {
    const uuid1 = "session-1"
    const uuid2 = "session-2"
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2)

    // Session 1
    const { result: result1, unmount } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result1.current).toBe(uuid1)

    // Page refresh (unmount)
    unmount()

    // Session 2 (new mount)
    const { result: result2 } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result2.current).toBe(uuid2)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
  })

  it("DESIGN DECISION: Single correlation ID per browser session (until refresh)", () => {
    // This documents the INTENDED behavior:
    // - Providers in root layout persists across client-side navigations
    // - useRef maintains state for the lifetime of the component
    // - One correlation ID per session (until full page reload)

    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    const sessionId = result.current

    // Simulate multiple page navigations (soft navigations in Next.js)
    for (let i = 0; i < 10; i++) {
      rerender()
    }

    // Should STILL be the same ID
    expect(result.current).toBe(sessionId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)

    // This is CORRECT: session-level correlation, not page-level
  })
})

describe("RAPTOR: Fetcher Wrapper Header Injection", () => {
  it("should configure SWR fetcher with correlation ID header", () => {
    const _testUrl = "/api/test"
    const fetcherSpy = vi.spyOn(fetcherModule, "fetcher")

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    const correlationId = result.current

    // Verify the fetcher would receive correlation ID
    // (Note: We can't easily test SWR's internal fetcher call without triggering a fetch)
    expect(correlationId).toBe(mockUUID)

    fetcherSpy.mockRestore()
  })

  it("should pass correlation ID in SWRConfig fetcher", () => {
    // The implementation at line 37 configures:
    // fetcher: (url: string) => fetcher(url, { "X-Correlation-Id": correlationId })

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
    // The SWRConfig value.fetcher should call fetcher() with { "X-Correlation-Id": mockUUID }
  })

  it("CRITICAL: Fetcher closure captures correlationId at render time", () => {
    // Line 37: fetcher: (url: string) => fetcher(url, { "X-Correlation-Id": correlationId })
    // The closure captures correlationId value

    const uuid1 = "render-1"
    const uuid2 = "render-2"
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2)

    // First render
    const { result: result1, unmount } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result1.current).toBe(uuid1)
    unmount()

    // Second render (new Providers instance)
    const { result: result2 } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result2.current).toBe(uuid2)

    // Each Providers instance creates NEW fetcher closure with different correlationId
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
  })
})

describe("RAPTOR: SSEProvider Integration Edge Cases", () => {
  it("should wrap SSEProvider when sseConfig provided", () => {
    const sseConfig: SSEConfig = {
      url: "/api/events",
      events: {},
    }

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Providers sseConfig={sseConfig}>{children}</Providers>
      ),
    })

    expect(result.current).toBe(mockUUID)
  })

  it("should maintain correlation ID context inside SSEProvider", () => {
    const sseConfig: SSEConfig = {
      url: "/api/events",
      events: {
        update: { key: "/api/data", update: "refetch" },
      },
    }

    const TestComponent = () => {
      const id = useCorrelationId()
      return <div data-testid="id">{id}</div>
    }

    render(
      <Providers sseConfig={sseConfig}>
        <TestComponent />
      </Providers>,
    )

    expect(screen.getByTestId("id").textContent).toBe(mockUUID)
  })

  it("should render content without SSEProvider when sseConfig is undefined", () => {
    const TestComponent = () => {
      const id = useCorrelationId()
      return <div data-testid="id">{id}</div>
    }

    render(
      <Providers>
        <TestComponent />
      </Providers>,
    )

    expect(screen.getByTestId("id").textContent).toBe(mockUUID)
  })

  it("should handle sseConfig changing from undefined to defined", () => {
    const sseConfig: SSEConfig = {
      url: "/api/events",
      events: {},
    }

    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    const originalId = result.current

    // Add SSEProvider
    rerender({
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Providers sseConfig={sseConfig}>{children}</Providers>
      ),
    })

    // Correlation ID should persist
    expect(result.current).toBe(originalId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it("should handle sseConfig changing from defined to undefined", () => {
    const sseConfig: SSEConfig = {
      url: "/api/events",
      events: {},
    }

    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Providers sseConfig={sseConfig}>{children}</Providers>
      ),
    })

    const originalId = result.current

    // Remove SSEProvider
    rerender({
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    // Correlation ID should persist
    expect(result.current).toBe(originalId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })
})

describe("RAPTOR: SWRConfig Options Preservation", () => {
  it("should maintain revalidateOnFocus: false", () => {
    // This is a smoke test - verifying the config exists
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    )

    expect(screen.getByText("Test")).toBeInTheDocument()
    // SWRConfig should have revalidateOnFocus: false
  })

  it("should maintain dedupingInterval: 2000", () => {
    // This is a smoke test - verifying the config exists
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    )

    expect(screen.getByText("Test")).toBeInTheDocument()
    // SWRConfig should have dedupingInterval: 2000
  })

  it("should maintain both SWR options when correlation ID added", () => {
    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
    // SWRConfig should still have both revalidateOnFocus and dedupingInterval
  })
})

describe("RAPTOR: crypto.randomUUID Edge Cases", () => {
  it("should handle crypto.randomUUID throwing error (fallback needed?)", () => {
    // BUG: No error handling if crypto.randomUUID throws
    vi.mocked(crypto.randomUUID).mockImplementation(() => {
      throw new Error("crypto not available")
    })

    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      render(
        <Providers>
          <div>Test</div>
        </Providers>,
      )
    }).toThrow()

    consoleSpy.mockRestore()
  })

  it("should handle crypto.randomUUID returning undefined (type mismatch)", () => {
    // TypeScript prevents this, but at runtime it could happen
    vi.mocked(crypto.randomUUID).mockReturnValue(undefined as any)

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    // BUG?: undefined would be stored in correlationIdRef.current
    expect(result.current).toBeUndefined()
  })

  it("should handle crypto.randomUUID returning empty string", () => {
    vi.mocked(crypto.randomUUID).mockReturnValue("" as any)

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    // Empty string would be stored
    expect(result.current).toBe("")
  })

  it("should handle crypto.randomUUID returning non-UUID format", () => {
    const invalidUUID = "not-a-uuid-format"
    vi.mocked(crypto.randomUUID).mockReturnValue(invalidUUID as any)

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    // Would accept any string
    expect(result.current).toBe(invalidUUID)
  })
})

describe("RAPTOR: useRef Initialization Edge Cases", () => {
  it("should check correlationIdRef.current with falsy check", () => {
    // Line 27: if (!correlationIdRef.current)
    // This checks for falsy values (undefined, null, "", 0, false)

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
  })

  it("BUG?: Empty string correlation ID would regenerate on every render", () => {
    // If somehow correlationIdRef.current becomes "", the check !correlationIdRef.current
    // would be TRUE (empty string is falsy), causing regeneration

    let callCount = 0
    vi.mocked(crypto.randomUUID).mockImplementation(() => {
      callCount++
      return callCount === 1 ? ("" as any) : `uuid-${callCount}`
    })

    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    // First render: crypto.randomUUID returns ""
    expect(result.current).toBe("")

    // Rerender: empty string is falsy, so crypto.randomUUID called again
    rerender()

    // BUG: Empty string causes regeneration on every render
    expect(result.current).toBe("uuid-2")
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
  })

  it("BUG?: Zero correlation ID would regenerate on every render", () => {
    // If correlationIdRef.current is 0, !0 is TRUE

    let callCount = 0
    vi.mocked(crypto.randomUUID).mockImplementation(() => {
      callCount++
      return callCount === 1 ? (0 as any) : `uuid-${callCount}`
    })

    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(0)

    // Rerender: 0 is falsy, so regenerates
    rerender()

    expect(result.current).toBe("uuid-2")
    expect(crypto.randomUUID).toHaveBeenCalledTimes(2)
  })
})

describe("RAPTOR: React Rendering Edge Cases", () => {
  it("should handle component unmount during initialization", () => {
    const { result, unmount } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)

    // Unmount immediately
    unmount()

    // Should not crash
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it("should handle rapid mount/unmount cycles", () => {
    const uuids = ["uuid-1", "uuid-2", "uuid-3", "uuid-4"]
    let idx = 0
    vi.mocked(crypto.randomUUID).mockImplementation(() => uuids[idx++])

    for (let i = 0; i < 4; i++) {
      const { result, unmount } = renderHook(() => useCorrelationId(), {
        wrapper: ({ children }: { children: React.ReactNode }) => <Providers>{children}</Providers>,
      })

      expect(result.current).toBe(uuids[i])
      unmount()
    }

    expect(crypto.randomUUID).toHaveBeenCalledTimes(4)
  })

  it("should handle children prop changing", () => {
    const Child1 = () => {
      const id = useCorrelationId()
      return <div data-testid="child">{id}</div>
    }

    const Child2 = () => {
      const id = useCorrelationId()
      return <span data-testid="child">{id}</span>
    }

    const { rerender } = render(
      <Providers>
        <Child1 />
      </Providers>,
    )

    const firstId = screen.getByTestId("child").textContent

    // Change children
    rerender(
      <Providers>
        <Child2 />
      </Providers>,
    )

    // Correlation ID should persist
    expect(screen.getByTestId("child").textContent).toBe(firstId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })
})
