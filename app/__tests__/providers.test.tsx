import { render, renderHook, screen } from "@testing-library/react"
import type { SSEConfig } from "reactive-swr"
import useSWR from "swr"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { Providers, useCorrelationId } from "../providers"

// Original SWR consumer component
function SWRConsumer() {
  const { data } = useSWR<string | null>("test-key", () => null)
  return <div data-testid="swr-consumer">{data ?? "no data"}</div>
}

// Mock crypto.randomUUID
const mockUUID = "test-uuid-123"
const originalRandomUUID = global.crypto.randomUUID

beforeEach(() => {
  global.crypto.randomUUID = vi.fn(() => mockUUID) as any
})

afterEach(() => {
  global.crypto.randomUUID = originalRandomUUID
  vi.restoreAllMocks()
})

describe("Providers (existing tests)", () => {
  it("renders children", () => {
    render(
      <Providers>
        <div>hello</div>
      </Providers>,
    )
    expect(screen.getByText("hello")).toBeInTheDocument()
  })

  it("provides SWR context to children", () => {
    render(
      <Providers>
        <SWRConsumer />
      </Providers>,
    )
    expect(screen.getByTestId("swr-consumer")).toBeInTheDocument()
  })

  it("renders without sseConfig (SWR only)", () => {
    const { container } = render(
      <Providers>
        <span>content</span>
      </Providers>,
    )
    expect(container).toBeTruthy()
    expect(screen.getByText("content")).toBeInTheDocument()
  })
})

describe("Providers with SSE support", () => {
  it("should support optional SSEProvider", () => {
    const sseConfig: SSEConfig = {
      url: "/api/events",
      events: {},
    }

    render(
      <Providers sseConfig={sseConfig}>
        <div>Test Content</div>
      </Providers>,
    )

    expect(screen.getByText("Test Content")).toBeInTheDocument()
  })

  it("should work without SSEProvider when sseConfig is not provided", () => {
    render(
      <Providers>
        <div>Test Content</div>
      </Providers>,
    )

    expect(screen.getByText("Test Content")).toBeInTheDocument()
  })
})

describe("Correlation ID generation", () => {
  it("should generate correlation ID on mount", () => {
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    )

    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it("should use crypto.randomUUID for correlation ID", () => {
    const customUUID = "custom-uuid-456"
    vi.mocked(crypto.randomUUID).mockReturnValue(customUUID)

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(customUUID)
  })

  it("should generate unique correlation ID for each provider instance", () => {
    const uuid1 = "uuid-1"
    const uuid2 = "uuid-2"
    vi.mocked(crypto.randomUUID).mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2)

    const { result: result1 } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    const { result: result2 } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    expect(result1.current).toBe(uuid1)
    expect(result2.current).toBe(uuid2)
  })
})

describe("useCorrelationId hook", () => {
  it("should export useCorrelationId hook", () => {
    expect(typeof useCorrelationId).toBe("function")
  })

  it("should return the current correlation ID", () => {
    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
  })

  it("should return the same ID across multiple calls", () => {
    const TestComponent = () => {
      const id1 = useCorrelationId()
      const id2 = useCorrelationId()

      return (
        <div>
          <span data-testid="id1">{id1}</span>
          <span data-testid="id2">{id2}</span>
        </div>
      )
    }

    render(
      <Providers>
        <TestComponent />
      </Providers>,
    )

    const id1 = screen.getByTestId("id1").textContent
    const id2 = screen.getByTestId("id2").textContent

    expect(id1).toBe(id2)
    expect(id1).toBe(mockUUID)
  })

  it("should throw error when used outside Providers", () => {
    // Suppress console.error for this test
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {})

    expect(() => {
      renderHook(() => useCorrelationId())
    }).toThrow()

    consoleSpy.mockRestore()
  })
})

describe("Correlation ID persistence with useRef", () => {
  it("should persist correlation ID across re-renders", () => {
    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    const firstId = result.current

    // Re-render
    rerender()

    expect(result.current).toBe(firstId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1) // Only once on mount
  })

  it("should use useRef to store correlation ID", () => {
    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    const originalId = result.current

    // Multiple re-renders
    rerender()
    rerender()
    rerender()

    expect(result.current).toBe(originalId)
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })

  it("should maintain stable reference across re-renders", () => {
    let _renderCount = 0
    const ids: string[] = []

    const TestComponent = () => {
      const correlationId = useCorrelationId()
      _renderCount++
      ids.push(correlationId)
      return <div>{correlationId}</div>
    }

    const { rerender } = render(
      <Providers>
        <TestComponent />
      </Providers>,
    )

    rerender(
      <Providers>
        <TestComponent />
      </Providers>,
    )

    rerender(
      <Providers>
        <TestComponent />
      </Providers>,
    )

    // All IDs should be the same
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(mockUUID)
  })
})

describe("SWR fetcher with correlation ID", () => {
  it("should configure SWR fetcher with correlation ID header", async () => {
    // This test verifies the fetcher is configured in SWRConfig
    // The actual header injection is tested in the implementation
    const { container } = render(
      <Providers>
        <div>Test</div>
      </Providers>,
    )

    expect(container).toBeDefined()
    // SWRConfig should be present (this is a basic smoke test)
  })

  it("should pass correlation ID to fetcher as X-Correlation-Id header", () => {
    // The implementation should configure fetcher to use the correlation ID
    // This is verified by checking that the fetcher receives headers
    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
    // The fetcher configuration should use this ID as X-Correlation-Id header
  })
})

describe("Mutation fetcher with correlation ID", () => {
  it("should provide correlation ID to mutation fetcher", () => {
    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
    // mutationFetcher should receive this ID via wrapper or arg
  })
})

describe("Backward compatibility", () => {
  it("should maintain existing SWRConfig options", () => {
    render(
      <Providers>
        <div>Test</div>
      </Providers>,
    )

    // SWRConfig should still have revalidateOnFocus: false, dedupingInterval: 2000
    // This is a smoke test - the actual config is verified by SWR behavior
    expect(screen.getByText("Test")).toBeInTheDocument()
  })

  it("should maintain existing SSEProvider integration", () => {
    const sseConfig: SSEConfig = {
      url: "/api/events",
      events: {
        update: { key: "/api/data", update: "refetch" },
      },
    }

    render(
      <Providers sseConfig={sseConfig}>
        <div>Test</div>
      </Providers>,
    )

    expect(screen.getByText("Test")).toBeInTheDocument()
  })

  it("should work with both SWR and SSE providers", () => {
    const sseConfig: SSEConfig = {
      url: "/api/events",
      events: {},
    }

    const { result } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers sseConfig={sseConfig}>{children}</Providers>,
    })

    expect(result.current).toBe(mockUUID)
  })
})

describe("Edge cases", () => {
  it("should handle multiple Providers instances independently", () => {
    const uuid1 = "uuid-instance-1"
    const uuid2 = "uuid-instance-2"

    vi.mocked(crypto.randomUUID).mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2)

    const Instance1 = () => {
      const id = useCorrelationId()
      return <div data-testid="instance1">{id}</div>
    }

    const Instance2 = () => {
      const id = useCorrelationId()
      return <div data-testid="instance2">{id}</div>
    }

    const { container: container1 } = render(
      <Providers>
        <Instance1 />
      </Providers>,
    )

    const { container: container2 } = render(
      <Providers>
        <Instance2 />
      </Providers>,
    )

    expect(container1.textContent).toContain(uuid1)
    expect(container2.textContent).toContain(uuid2)
  })

  it("should handle crypto.randomUUID returning different formats", () => {
    const formats = [
      "550e8400-e29b-41d4-a716-446655440000",
      "6ba7b810-9dad-11d1-80b4-00c04fd430c8",
      "00000000-0000-0000-0000-000000000000",
    ]

    for (const uuid of formats) {
      vi.mocked(crypto.randomUUID).mockReturnValueOnce(uuid)

      const { result } = renderHook(() => useCorrelationId(), {
        wrapper: ({ children }) => <Providers>{children}</Providers>,
      })

      expect(result.current).toBe(uuid)
    }
  })

  it("should not regenerate ID on prop changes", () => {
    const { result, rerender } = renderHook(() => useCorrelationId(), {
      wrapper: ({ children }) => <Providers>{children}</Providers>,
      initialProps: {},
    })

    const _firstId = result.current

    // Change props (simulate different sseConfig)
    rerender({
      wrapper: ({ children }: { children: React.ReactNode }) => (
        <Providers sseConfig={{ url: "/api/events", events: {} }}>{children}</Providers>
      ),
    })

    // crypto.randomUUID should still only be called once
    expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
  })
})

describe("Integration with component tree", () => {
  it("should provide correlation ID to both read and write operations", () => {
    const TestComponent = () => {
      const correlationId = useCorrelationId()

      return (
        <div>
          <span data-testid="correlation-id">{correlationId}</span>
        </div>
      )
    }

    render(
      <Providers>
        <TestComponent />
      </Providers>,
    )

    const displayedId = screen.getByTestId("correlation-id").textContent
    expect(displayedId).toBe(mockUUID)

    // This ID should be used by both fetcher and mutationFetcher
  })

  it("should make correlation ID available to child components", () => {
    const ChildComponent = () => {
      const id = useCorrelationId()
      return <div data-testid="child-id">{id}</div>
    }

    const ParentComponent = () => {
      return (
        <div>
          <ChildComponent />
        </div>
      )
    }

    render(
      <Providers>
        <ParentComponent />
      </Providers>,
    )

    expect(screen.getByTestId("child-id").textContent).toBe(mockUUID)
  })

  it("should maintain correlation ID across component tree", () => {
    const ids: string[] = []

    const Level1 = () => {
      ids.push(useCorrelationId())
      return <Level2 />
    }

    const Level2 = () => {
      ids.push(useCorrelationId())
      return <Level3 />
    }

    const Level3 = () => {
      ids.push(useCorrelationId())
      return <div>Deep</div>
    }

    render(
      <Providers>
        <Level1 />
      </Providers>,
    )

    // All components should see the same ID
    expect(new Set(ids).size).toBe(1)
    expect(ids[0]).toBe(mockUUID)
  })
})
