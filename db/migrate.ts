import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { sql } from "drizzle-orm"
import { migrate as migrateSqlite } from "drizzle-orm/libsql/migrator"
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator"
import { type DbInstance, getInstance, type PostgresDb, type SqliteDb } from "@/db"
import { getLogger } from "@/lib/logger"

/** Cap on how far `isMissingTableError` walks `error.cause` chains, in case one cycles back. */
const MAX_CAUSE_DEPTH = 8

/**
 * True when `error` indicates the migrations table (or the schema it lives in) does not exist
 * yet -- the expected state on a fresh database, not a real failure. Postgres reports this as
 * SQLSTATE 42P01 ("undefined_table") once the `drizzle` schema exists, or 3F000
 * ("invalid_schema_name") on a database where that schema has never been created; libsql/sqlite
 * reports it as a "no such table" message with no code.
 *
 * The postgres branch of `countApplied` queries through drizzle (`instance.db.execute`), which
 * wraps driver errors in `DrizzleQueryError` -- its message is `Failed query: <sql>` and the
 * driver's own error, carrying the Postgres `code`, lives on `.cause`. So this walks the cause
 * chain rather than only inspecting the top-level error. Anything else (connection refused, auth
 * failure, timeout, ...) is a genuine error and must not be treated as zero rows.
 */
function isMissingTableError(error: unknown, depth = 0): boolean {
  if (depth > MAX_CAUSE_DEPTH) return false
  if (!(error instanceof Error)) return false
  const code = (error as { code?: unknown }).code
  if (code === "42P01" || code === "3F000") return true
  // Only libsql/sqlite errors are matched by message; Postgres errors always carry a SQLSTATE, and
  // messages like `database "x" does not exist` (3D000) or `role "x" does not exist` (28000) are
  // real failures that must not be mistaken for a fresh database.
  if (code === undefined && /no such table/i.test(error.message)) return true
  if (error.cause instanceof Error) return isMissingTableError(error.cause, depth + 1)
  return false
}

/** Number of rows in drizzle's migrations table, or 0 when it does not exist yet. */
async function countApplied(instance: DbInstance): Promise<number> {
  try {
    if (instance.dialect === "sqlite") {
      const result = await instance.db.$client.execute(
        "select count(*) as count from __drizzle_migrations",
      )
      return Number(result.rows[0]?.count ?? 0)
    }
    const rows = await instance.db.execute<{ count: string | number }>(
      sql`select count(*) as count from drizzle.__drizzle_migrations`,
    )
    return Number(rows[0]?.count ?? 0)
  } catch (error) {
    if (isMissingTableError(error)) return 0
    throw error
  }
}

/** The migrator functions `runMigrations` dispatches to, one per dialect. Overridable in tests. */
export interface Migrators {
  sqlite: (db: SqliteDb, config: { migrationsFolder: string }) => Promise<void>
  postgres: (db: PostgresDb, config: { migrationsFolder: string }) => Promise<void>
}

const defaultMigrators: Migrators = { sqlite: migrateSqlite, postgres: migratePostgres }

/**
 * Session-level advisory lock key guarding startup migrations on Postgres, so that when several
 * replicas boot against the same database at once, only one of them actually runs the migrator
 * while the others block until it releases. This is a fixed, arbitrary bigint; nothing else in
 * the app takes an advisory lock, so there is no key to collide with.
 */
const MIGRATION_LOCK_KEY = 7_242_109_001

/**
 * Runs `fn` while holding a Postgres session-level advisory lock (`pg_advisory_lock`), so
 * concurrent `runMigrations` calls against the same database -- e.g. several replicas starting at
 * once -- serialize instead of racing `countApplied` and the migrator (the migrator on its own
 * takes no lock, so two instances can otherwise read the same "before" count and both try to
 * apply the same pending migrations).
 *
 * postgres.js pools connections, and `pg_advisory_lock`/`pg_advisory_unlock` are scoped to the
 * physical connection that took the lock, so the lock and unlock must run on the same dedicated
 * connection: `$client.reserve()` checks one out of the pool for the whole call, and it is
 * released back to the pool only after `pg_advisory_unlock` has run on it in the `finally`. Any
 * other replica calling this at the same time blocks inside `pg_advisory_lock` until this one
 * unlocks, then proceeds -- its own `countApplied`/migrator calls run against an already-migrated
 * database and become no-ops.
 */
async function withPostgresMigrationLock<T>(
  instance: Extract<DbInstance, { dialect: "postgres" }>,
  fn: () => Promise<T>,
): Promise<T> {
  const reserved = await instance.db.$client.reserve()
  try {
    await reserved`select pg_advisory_lock(${MIGRATION_LOCK_KEY})`
    try {
      return await fn()
    } finally {
      await reserved`select pg_advisory_unlock(${MIGRATION_LOCK_KEY})`
    }
  } finally {
    // Always hand the connection back, even if locking or unlocking rejected (the server-side
    // lock dies with the session, but the pool slot would otherwise leak).
    reserved.release()
  }
}

interface RunMigrationsOptions {
  migrationsFolder?: string
  migrators?: Migrators
}

/**
 * Applies pending migrations from `db/migrations/<dialect>` (resolved from the project root).
 * A missing or empty migrations folder is a no-op.
 */
export async function runMigrations(
  instance: DbInstance = getInstance(),
  options: RunMigrationsOptions = {},
): Promise<void> {
  const logger = getLogger()
  const migrationsFolder =
    options.migrationsFolder ?? resolve(process.cwd(), "db/migrations", instance.dialect)
  const migrators = options.migrators ?? defaultMigrators

  if (!existsSync(join(migrationsFolder, "meta", "_journal.json"))) {
    logger.info({ migrationsFolder }, "No migrations folder found; skipping")
    return
  }

  await instance.ready

  let applied: number
  if (instance.dialect === "sqlite") {
    const before = await countApplied(instance)
    await migrators.sqlite(instance.db, { migrationsFolder })
    applied = (await countApplied(instance)) - before
  } else {
    applied = await withPostgresMigrationLock(instance, async () => {
      const before = await countApplied(instance)
      await migrators.postgres(instance.db, { migrationsFolder })
      return (await countApplied(instance)) - before
    })
  }

  if (applied > 0) {
    logger.info({ applied, dialect: instance.dialect }, `Applied ${applied} migrations`)
  } else {
    logger.info({ dialect: instance.dialect }, "No pending migrations")
  }
}

/**
 * Runs pending migrations and exits the process on failure. Used at server start
 * (`instrumentation.ts`) so the app refuses to serve against a database it could not migrate.
 */
export async function runMigrationsOrExit(
  instance: DbInstance = getInstance(),
  options: RunMigrationsOptions = {},
): Promise<void> {
  try {
    await runMigrations(instance, options)
  } catch (error) {
    getLogger().error({ error }, "Database migration failed on startup")
    process.exit(1)
  }
}

if (import.meta.main) {
  runMigrationsOrExit().then(() => process.exit(0))
}
