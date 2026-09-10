/**
 * DATABASE_URL parsing shared by the runtime (`db/index.ts`), env validation (`lib/env.ts`),
 * and drizzle-kit (`drizzle.config.ts`).
 *
 * Supported forms:
 *   sqlite:./data/dev.sqlite      relative file path
 *   sqlite:/abs/path.sqlite       absolute file path
 *   sqlite://./relative           URL-style with an authority slash pair
 *   sqlite::memory:               in-memory database
 *   postgres://user:pass@host/db  PostgreSQL (postgresql:// is accepted as an alias)
 */

export type Dialect = "sqlite" | "postgres"

export type ParsedDatabaseUrl =
  | { dialect: "sqlite"; path: string }
  | { dialect: "postgres"; url: string }

export const SUPPORTED_SCHEMES = ["sqlite:", "postgres:", "postgresql:"] as const

export const DEFAULT_SQLITE_URL = "sqlite:./data/dev.sqlite"

export const SQLITE_MEMORY_PATH = ":memory:"

export const UNSUPPORTED_SCHEME_MESSAGE =
  "DATABASE_URL must start with sqlite: (e.g. sqlite:./data/dev.sqlite) or postgres: / postgresql: (e.g. postgres://user:pass@host:5432/db)"

function schemeOf(url: string): string {
  const match = /^([a-z][a-z0-9+.-]*:)/i.exec(url)
  return match ? match[1].toLowerCase() : ""
}

/** True when `url` uses one of the schemes this project can connect to. */
export function hasSupportedScheme(url: string): boolean {
  return (SUPPORTED_SCHEMES as readonly string[]).includes(schemeOf(url))
}

/** Parses a DATABASE_URL into a dialect plus the driver-specific connection target. */
export function parseDatabaseUrl(url: string): ParsedDatabaseUrl {
  const scheme = schemeOf(url)

  if (scheme === "sqlite:") {
    let path = url.slice(scheme.length)
    // `sqlite://./relative` and `sqlite:///abs/path` carry an empty authority; drop the slashes.
    // Anything else after `//` is a host or credentials, which SQLite cannot open: fail loudly
    // instead of creating a stray local file named after the host.
    if (path.startsWith("//")) {
      path = path.slice(2)
      if (!(path.startsWith("/") || path.startsWith("./") || path === SQLITE_MEMORY_PATH)) {
        throw new Error(
          `${UNSUPPORTED_SCHEME_MESSAGE} (got "${url}": sqlite: URLs point at a local file and cannot carry a host or credentials)`,
        )
      }
    }
    if (path === "") throw new Error(`${UNSUPPORTED_SCHEME_MESSAGE} (got an empty sqlite path)`)
    return { dialect: "sqlite", path }
  }

  if (scheme === "postgres:" || scheme === "postgresql:") {
    return { dialect: "postgres", url }
  }

  throw new Error(`${UNSUPPORTED_SCHEME_MESSAGE} (got "${url}")`)
}
