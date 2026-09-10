import { mkdirSync } from "node:fs"
import { dirname } from "node:path"
import {
  type Client,
  createClient,
  type InArgs,
  type InStatement,
  type TransactionMode,
} from "@libsql/client"
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

/**
 * Wraps a raw libsql `Client` so every query-executing method waits for the current readiness
 * promise before delegating to the raw client. `currentReady` is read at call time (not
 * captured once) so a promise swapped in after `reconnect()` is picked up by the next query.
 * `close`/`closed`/`protocol` pass through unchanged since they don't touch pragma setup.
 * `reconnect()` delegates to `onReconnect` in addition to the raw client so the caller can
 * reapply connection-scoped setup that a reopened connection drops.
 */
function withReadyGuard(
  client: Client,
  currentReady: () => Promise<void>,
  onReconnect: () => void,
): Client {
  async function guarded<T>(run: () => Promise<T>): Promise<T> {
    await currentReady()
    return run()
  }

  return {
    execute(stmtOrSql: InStatement | string, args?: InArgs) {
      return guarded(() =>
        typeof stmtOrSql === "string" ? client.execute(stmtOrSql, args) : client.execute(stmtOrSql),
      )
    },
    batch(stmts, mode) {
      return guarded(() => client.batch(stmts, mode))
    },
    migrate(stmts) {
      return guarded(() => client.migrate(stmts))
    },
    transaction(mode?: TransactionMode) {
      return guarded(() => (mode === undefined ? client.transaction() : client.transaction(mode)))
    },
    executeMultiple(sqlText) {
      return guarded(() => client.executeMultiple(sqlText))
    },
    sync() {
      return guarded(() => client.sync())
    },
    close() {
      client.close()
    },
    reconnect() {
      client.reconnect()
      onReconnect()
    },
    get closed() {
      return client.closed
    },
    get protocol() {
      return client.protocol
    },
  }
}

// ---------------------------------------------------------------------------------------------
// SQLite (`@libsql/client`). Kept in one function so swapping drivers touches only this block.
// ---------------------------------------------------------------------------------------------
function createSqliteInstance(path: string): DbInstance {
  const inMemory = path === SQLITE_MEMORY_PATH
  if (!inMemory) mkdirSync(dirname(path), { recursive: true })

  const rawClient = createClient({ url: inMemory ? SQLITE_MEMORY_PATH : `file:${path}` })

  // libsql's execute is async, so pragmas cannot run synchronously on open. Pragmas must run on
  // the raw client: running them through the ready-guarded client below would deadlock (the
  // guard awaits the current readiness promise, and that promise awaits the pragma queries).
  //
  // `busy_timeout` is connection-scoped: `@libsql/client`'s file/sqlite3 client keeps a small
  // pool of connections, and `reconnect()` closes every connection in that pool before the next
  // query opens a fresh one, which starts with SQLite's default (no) busy timeout. `applyPragmas`
  // is re-run after every `reconnect()` so a reopened connection gets the timeout back.
  // `journal_mode=WAL` is persisted in the database file itself, so it survives a reconnect on
  // its own, but re-running it here is harmless and keeps the pragma list in one place.
  function applyPragmas(): Promise<void> {
    return (async () => {
      // WAL lets readers proceed during writes; in-memory databases always report "memory".
      if (!inMemory) await rawClient.execute("PRAGMA journal_mode=WAL")
      // Wait up to 5s on a locked database instead of failing immediately with SQLITE_BUSY.
      await rawClient.execute("PRAGMA busy_timeout=5000")
    })()
  }

  // `current` always holds the in-flight (or most recently settled) setup promise. Reading it
  // through `currentReady()`/the `ready` getter below (rather than closing over a single promise)
  // means a promise swapped in after `reconnect()` is what queries and callers actually wait on.
  let current = applyPragmas()
  // Nothing awaits `current` unless it's assigned to the instance or ping()/runMigrations() are
  // called. Attach a no-op catch so a pragma failure doesn't surface as an unhandled rejection;
  // the promise returned by `currentReady()`/`ready` still rejects for anyone who does await it.
  current.catch(() => {})

  // Every query issued through `db` or `db.$client` waits for the pragmas above before running,
  // so request handlers that never call `await ready` still get WAL mode and the busy timeout.
  // On `reconnect()`, replace `current` with a fresh `applyPragmas()` call so the next query
  // waits for the reopened connection's setup instead of the original (already-settled) promise.
  const client = withReadyGuard(
    rawClient,
    () => current,
    () => {
      current = applyPragmas()
      current.catch(() => {})
    },
  )
  const db = drizzleSqlite(client, { schema: sqliteSchema })

  return {
    dialect: "sqlite",
    db,
    // A getter (not a plain field) so callers -- including `withEviction`'s wrapper below --
    // observe the promise `reconnect()` swaps in, not the one that existed at construction time.
    get ready() {
      return current
    },
    async ping() {
      await current
      await db.run(sql`select 1`)
    },
    async close() {
      rawClient.close()
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

/**
 * Wraps a `DbInstance` so its `close()` also evicts the cached singleton once the underlying
 * connection has actually closed. Without this, a caller that awaits `close()` and then touches
 * `db`/`getDb()`/`getInstance()` again gets the same closed instance back, and every subsequent
 * query fails instead of transparently reconnecting.
 *
 * `ready` is redefined as a getter forwarding to `instance.ready` rather than left to the object
 * spread below: a plain spread reads `instance.ready` once, at wrap time, and would freeze the
 * wrapper on whatever promise was current then -- masking any later swap (e.g. after a SQLite
 * `reconnect()`) behind a stale, already-settled promise.
 */
function withEviction(instance: DbInstance, evict: () => void): DbInstance {
  async function close(): Promise<void> {
    await instance.close()
    evict()
  }

  return instance.dialect === "sqlite"
    ? {
        ...instance,
        close,
        get ready() {
          return instance.ready
        },
      }
    : {
        ...instance,
        close,
        get ready() {
          return instance.ready
        },
      }
}

// ---------------------------------------------------------------------------------------------
// Lazy singleton. Nothing is opened until first use, so importing `@/db` during `next build` or
// in a test is side-effect free. Stored on globalThis so dev hot-reload reuses the connection.
//
// Invariant: `close()` on the returned instance evicts it from `globalForDb` once the underlying
// connection has closed, so the next `getInstance()`/`getDb()`/`db.*` call opens a fresh
// connection instead of reusing (and failing against) a closed one.
// ---------------------------------------------------------------------------------------------
const globalForDb = globalThis as unknown as { __contextKitDb?: DbInstance }

export function getInstance(): DbInstance {
  if (!globalForDb.__contextKitDb) {
    let instance: DbInstance
    const evict = () => {
      if (globalForDb.__contextKitDb === instance) delete globalForDb.__contextKitDb
    }
    instance = withEviction(createDb(getEnv().DATABASE_URL), evict)
    globalForDb.__contextKitDb = instance
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
