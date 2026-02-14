import { render, screen } from "@testing-library/react"
import useSWR from "swr"
import { describe, expect, it } from "vitest"
import { Providers } from "../providers"

function SWRConsumer() {
  const { data } = useSWR<string | null>("test-key", () => null)
  return <div data-testid="swr-consumer">{data ?? "no data"}</div>
}

describe("Providers", () => {
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
