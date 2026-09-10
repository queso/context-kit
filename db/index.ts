import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import { type Client, createClient } from "@libsql/client"
import { sql } from "drizzle-orm"
import { drizzle as drizzleSqlite, type LibSQLDatabase } from "drizzle-orm/libsql"
import { drizzle as drizzlePostgres, type PostgresJsDatabase } from "drizzle-orm/postgres-js"
import postgres from "postgres"
import * as postgresSchema from "@/db/schema/postgres"
import * as sqliteSchema from "@/db/schema/sqlite"
import { type Dialect, parseDatabaseUrl, SQLITE_MEMORY_PATH } from "@/db/url"
import { getEnv } from "@/lib/env"

export type SqliteDb = LibSQLDatabase<typeof sqliteSchema> & { $client: Client }
export type PostgresDb = PostgresJsDatabase<typeof postgresSchema> & { $client: postgres.Sql }

/** The Drizzle instance for whichever database DATABASE_URL points at. */
export type Db = SqliteDb | PostgresDb

interface InstanceBase {
  /** Resolves once connection setup (e.g. SQLite pragmas) has finished. */
  ready: Promise<void>
  /** Runs `select 1` and resolves when the database answers. */
  ping(): Promise<void>
  /** Closes the underlying connection (or pool). */
  close(): Promise<void>
}

export type DbInstance =
  | ({ dialect: "sqlite"; db: SqliteDb } & InstanceBase)
  | ({ dialect: "postgres"; db: PostgresDb } & InstanceBase)

// ---------------------------------------------------------------------------------------------
// SQLite (`@libsql/client`). Kept in one function so swapping drivers touches only this block.
// ---------------------------------------------------------------------------------------------
function createSqliteInstance(path: string): DbInstance {
  const inMemory = path === SQLITE_MEMORY_PATH
  if (!inMemory) mkdirSync(dirname(path), { recursive: true })

  const client = createClient({ url: inMemory ? SQLITE_MEMORY_PATH : `file:${path}` })
  const db = drizzleSqlite(client, { schema: sqliteSchema })

  // libsql's execute is async, so pragmas cannot run synchronously on open. `ready` is awaited by
  // ping() and runMigrations(); other callers should `await ready()` once before querying.
  const ready = (async () => {
    // WAL lets readers proceed during writes; in-memory databases always report "memory".
    if (!inMemory) await client.execute("PRAGMA journal_mode=WAL")
    // Wait up to 5s on a locked database instead of failing immediately with SQLITE_BUSY.
    await client.execute("PRAGMA busy_timeout=5000")
  })()

  return {
    dialect: "sqlite",
    db,
    ready,
    async ping() {
      await ready
      await db.run(sql`select 1`)
    },
    async close() {
      client.close()
    },
  }
}

// ---------------------------------------------------------------------------------------------
// PostgreSQL (`postgres` driver).
// ---------------------------------------------------------------------------------------------
function createPostgresInstance(url: string): DbInstance {
  const client = postgres(url)
  const db = drizzlePostgres(client, { schema: postgresSchema })

  return {
    dialect: "postgres",
    db,
    ready: Promise.resolve(),
    async ping() {
      await db.execute(sql`select 1`)
    },
    async close() {
      await client.end()
    },
  }
}

/**
 * Builds a database instance from an explicit URL. The app uses the lazy singleton below;
 * this is exported for tests and scripts that need their own connection.
 */
export function createDb(url: string): DbInstance {
  const parsed = parseDatabaseUrl(url)
  return parsed.dialect === "sqlite"
    ? createSqliteInstance(parsed.path)
    : createPostgresInstance(parsed.url)
}

// ---------------------------------------------------------------------------------------------
// Lazy singleton. Nothing is opened until first use, so importing `@/db` during `next build` or
// in a test is side-effect free. Stored on globalThis so dev hot-reload reuses the connection.
// ---------------------------------------------------------------------------------------------
const globalForDb = globalThis as unknown as { __contextKitDb?: DbInstance }

export function getInstance(): DbInstance {
  if (!globalForDb.__contextKitDb) {
    globalForDb.__contextKitDb = createDb(getEnv().DATABASE_URL)
  }
  return globalForDb.__contextKitDb
}

/** The Drizzle instance for the configured database (connects on first call). */
export function getDb(): Db {
  return getInstance().db
}

/** Which database DATABASE_URL points at (connects on first call). */
export function getDialect(): Dialect {
  return getInstance().dialect
}

/**
 * Resolves once the configured database is set up (SQLite pragmas applied). `runMigrations()`
 * awaits this at server start, so request handlers normally never need it; call it once in
 * scripts or tests that query `db` directly.
 */
export function ready(): Promise<void> {
  return getInstance().ready
}

/** Resolves when the configured database answers `select 1`; rejects otherwise. */
export function ping(): Promise<void> {
  return getInstance().ping()
}

/**
 * The application Drizzle instance. A proxy over the lazy singleton so `import { db } from "@/db"`
 * works at module top level without opening a connection at import time.
 */
export const db: Db = new Proxy({} as Db, {
  get(_target, prop) {
    const target = getDb()
    const value = Reflect.get(target, prop, target)
    return typeof value === "function" ? value.bind(target) : value
  },
  has(_target, prop) {
    return Reflect.has(getDb(), prop)
  },
  getPrototypeOf() {
    return Object.getPrototypeOf(getDb())
  },
})
