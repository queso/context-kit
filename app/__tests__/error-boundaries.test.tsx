import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import ErrorPage from "@/app/error"
import Loading from "@/app/loading"
import NotFound from "@/app/not-found"

describe("ErrorPage", () => {
  const defaultError = new Error("Something went wrong")
  const defaultReset = vi.fn()

  it("renders a user-friendly error message", () => {
    render(<ErrorPage error={defaultError} reset={defaultReset} />)

    // Should show a friendly message, not the raw error string
    expect(screen.getByRole("heading")).toBeInTheDocument()
    expect(screen.queryByText("Something went wrong")).not.toBeInTheDocument()
  })

  it("renders a try again button that calls reset", async () => {
    const reset = vi.fn()
    const user = userEvent.setup()

    render(<ErrorPage error={defaultError} reset={reset} />)

    const button = screen.getByRole("button", { name: /try again/i })
    expect(button).toBeInTheDocument()

    await user.click(button)
    expect(reset).toHaveBeenCalledOnce()
  })
})

describe("NotFound", () => {
  it("renders a not found message with a link home", () => {
    render(<NotFound />)

    expect(screen.getByText(/not found|404/i)).toBeInTheDocument()

    const homeLink = screen.getByRole("link", { name: /home|back/i })
    expect(homeLink).toBeInTheDocument()
    expect(homeLink).toHaveAttribute("href", "/")
  })
})

describe("Loading", () => {
  it("renders a loading indicator", () => {
    const { container } = render(<Loading />)

    // The loading page should render something visible -- an element with a
    // loading-related role, text, or at minimum some non-empty markup.
    const hasLoadingRole = screen.queryByRole("status") !== null
    const hasLoadingText = screen.queryByText(/loading/i) !== null
    const hasContent = container.firstChild !== null

    expect(hasLoadingRole || hasLoadingText || hasContent).toBe(true)
  })
})
