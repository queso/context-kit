import { render, screen } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import Page from "../page"

describe("Home Page", () => {
  it("renders the heading", () => {
    render(<Page />)
    expect(
      screen.getByRole("heading", {
        name: "To get started, edit the page.tsx file.",
      }),
    ).toBeInTheDocument()
  })

  it("renders the Next.js logo", () => {
    render(<Page />)
    expect(screen.getByAltText("Next.js logo")).toBeInTheDocument()
  })

  it("renders navigation links", () => {
    render(<Page />)
    expect(screen.getByRole("link", { name: /templates/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /learning/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /deploy now/i })).toBeInTheDocument()
    expect(screen.getByRole("link", { name: /documentation/i })).toBeInTheDocument()
  })
})
