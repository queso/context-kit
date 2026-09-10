import { afterEach, beforeEach, describe, expect, it, type Mock, mock, spyOn } from "bun:test"
import { render, renderHook, screen, waitFor } from "@testing-library/react"
import type { SSEConfig } from "reactive-swr"
import useSWR from "swr"
import { Providers, useCorrelationId } from "../providers"

function SWRConsumer() {
  const { data } = useSWR<string | null>("test-key", () => null)
  return <div data-testid="swr-consumer">{data ?? "no data"}</div>
}

type UUID = ReturnType<typeof crypto.randomUUID>

const mockUUID = "test-uuid-123" as UUID

let randomUUID: Mock<typeof crypto.randomUUID>

beforeEach(() => {
  randomUUID = spyOn(crypto, "randomUUID").mockReturnValue(mockUUID)
})

afterEach(() => {
  mock.restore()
})

describe("Providers", () => {
  describe("Basic rendering", () => {
    it("renders children correctly", () => {
      render(
        <Providers>
          <div>hello</div>
        </Providers>,
      )
      expect(screen.getByText("hello")).toBeInTheDocument()
    })

    it("provides SWR context to children", async () => {
      render(
        <Providers>
          <SWRConsumer />
        </Providers>,
      )
      await waitFor(() => {
        expect(screen.getByTestId("swr-consumer")).toBeInTheDocument()
      })
    })

    it("wraps children with SSEProvider when sseConfig is provided", () => {
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
  })

  describe("Correlation ID generation", () => {
    it("generates a correlation ID on mount using crypto.randomUUID", () => {
      render(
        <Providers>
          <div>Test</div>
        </Providers>,
      )

      expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
    })

    it("persists the same correlation ID across re-renders", () => {
      const { result, rerender } = renderHook(() => useCorrelationId(), {
        wrapper: ({ children }) => <Providers>{children}</Providers>,
      })

      const firstId = result.current

      rerender()
      rerender()
      rerender()

      expect(result.current).toBe(firstId)
      expect(crypto.randomUUID).toHaveBeenCalledTimes(1)
    })

    it("generates unique correlation IDs for separate Providers instances", () => {
      const uuid1 = "uuid-instance-1" as UUID
      const uuid2 = "uuid-instance-2" as UUID

      randomUUID.mockReturnValueOnce(uuid1).mockReturnValueOnce(uuid2)

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
    it("returns the current correlation ID", () => {
      const { result } = renderHook(() => useCorrelationId(), {
        wrapper: ({ children }) => <Providers>{children}</Providers>,
      })

      expect(result.current).toBe(mockUUID)
    })

    it("returns the same ID when called multiple times in a component", () => {
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

    it("throws error when used outside Providers context", () => {
      const consoleSpy = spyOn(console, "error").mockImplementation(() => {})

      expect(() => {
        renderHook(() => useCorrelationId())
      }).toThrow("useCorrelationId must be used within Providers")

      consoleSpy.mockRestore()
    })

    it("provides the same correlation ID to nested child components", () => {
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

      expect(new Set(ids).size).toBe(1)
      expect(ids[0]).toBe(mockUUID)
    })
  })
})
