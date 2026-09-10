import { describe, expect, it } from "bun:test"
import { hasSupportedScheme, parseDatabaseUrl } from "@/db/url"

describe("parseDatabaseUrl", () => {
  it("parses a relative sqlite path", () => {
    expect(parseDatabaseUrl("sqlite:./data/dev.sqlite")).toEqual({
      dialect: "sqlite",
      path: "./data/dev.sqlite",
    })
  })

  it("parses an absolute sqlite path", () => {
    expect(parseDatabaseUrl("sqlite:/abs/path.sqlite")).toEqual({
      dialect: "sqlite",
      path: "/abs/path.sqlite",
    })
  })

  it("strips the authority slashes from sqlite:// forms", () => {
    expect(parseDatabaseUrl("sqlite://./relative")).toEqual({
      dialect: "sqlite",
      path: "./relative",
    })
    expect(parseDatabaseUrl("sqlite:///abs/path.sqlite")).toEqual({
      dialect: "sqlite",
      path: "/abs/path.sqlite",
    })
  })

  it("parses the in-memory form", () => {
    expect(parseDatabaseUrl("sqlite::memory:")).toEqual({ dialect: "sqlite", path: ":memory:" })
  })

  it("returns the postgres dialect for postgres:// and postgresql:// URLs", () => {
    const url = "postgres://user:pass@localhost:5432/db"
    expect(parseDatabaseUrl(url)).toEqual({ dialect: "postgres", url })

    const aliased = "postgresql://user:pass@localhost:5432/db"
    expect(parseDatabaseUrl(aliased)).toEqual({ dialect: "postgres", url: aliased })
  })

  it("throws for unsupported schemes, naming both supported ones", () => {
    expect(() => parseDatabaseUrl("mysql://user:pass@localhost:3306/db")).toThrow(
      /sqlite:[\s\S]*postgres:/,
    )
    expect(() => parseDatabaseUrl("not-a-url")).toThrow(/sqlite:[\s\S]*postgres:/)
  })

  it("throws for an empty sqlite path", () => {
    expect(() => parseDatabaseUrl("sqlite:")).toThrow(/empty sqlite path/)
  })
})

describe("hasSupportedScheme", () => {
  it("accepts sqlite, postgres, and postgresql schemes case-insensitively", () => {
    expect(hasSupportedScheme("sqlite::memory:")).toBe(true)
    expect(hasSupportedScheme("postgres://x")).toBe(true)
    expect(hasSupportedScheme("PostgreSQL://x")).toBe(true)
  })

  it("rejects other schemes and bare paths", () => {
    expect(hasSupportedScheme("mysql://x")).toBe(false)
    expect(hasSupportedScheme("./data/dev.sqlite")).toBe(false)
  })
})
