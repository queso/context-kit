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
 * reports it as a "no such table" message.
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
  if ((error as { code?: unknown }).code === "42P01") return true
  if ((error as { code?: unknown }).code === "3F000") return true
  if (/no such table|does not exist/i.test(error.message)) return true
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
  const before = await countApplied(instance)

  if (instance.dialect === "sqlite") {
    await migrators.sqlite(instance.db, { migrationsFolder })
  } else {
    await migrators.postgres(instance.db, { migrationsFolder })
  }

  const applied = (await countApplied(instance)) - before

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
