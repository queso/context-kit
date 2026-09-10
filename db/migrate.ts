import { existsSync } from "node:fs"
import { join, resolve } from "node:path"
import { sql } from "drizzle-orm"
import { migrate as migrateSqlite } from "drizzle-orm/libsql/migrator"
import { migrate as migratePostgres } from "drizzle-orm/postgres-js/migrator"
import { type DbInstance, getInstance } from "@/db"
import { getLogger } from "@/lib/logger"

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
  } catch {
    return 0
  }
}

/**
 * Applies pending migrations from `db/migrations/<dialect>` (resolved from the project root).
 * A missing or empty migrations folder is a no-op.
 */
export async function runMigrations(instance: DbInstance = getInstance()): Promise<void> {
  const logger = getLogger()
  const migrationsFolder = resolve(process.cwd(), "db/migrations", instance.dialect)

  if (!existsSync(join(migrationsFolder, "meta", "_journal.json"))) {
    logger.info({ migrationsFolder }, "No migrations folder found; skipping")
    return
  }

  await instance.ready
  const before = await countApplied(instance)

  if (instance.dialect === "sqlite") {
    await migrateSqlite(instance.db, { migrationsFolder })
  } else {
    await migratePostgres(instance.db, { migrationsFolder })
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
export async function runMigrationsOrExit(): Promise<void> {
  try {
    await runMigrations()
  } catch (error) {
    getLogger().error({ error }, "Database migration failed on startup")
    process.exit(1)
  }
}

if (import.meta.main) {
  runMigrationsOrExit().then(() => process.exit(0))
}
