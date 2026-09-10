import { afterAll, afterEach, beforeEach, describe, expect, it, mock, spyOn } from "bun:test"
import { createHash } from "node:crypto"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { createDb, type DbInstance } from "@/db"
import { runMigrations, runMigrationsOrExit } from "@/db/migrate"

// Spy on the real logger module (module mocks are process-global in bun:test and would leak
// into other test files). Named imports inside migrate.ts see the spy. See __tests__/middleware.test.ts.
// The spy is re-created before every test and restored after, per the documented convention.
const loggerMod = await import("@/lib/logger")
const noopLogger = { info: mock(), error: mock(), warn: mock(), debug: mock() }

beforeEach(() => {
  spyOn(loggerMod, "getLogger").mockReturnValue(
    noopLogger as unknown as ReturnType<typeof loggerMod.getLogger>,
  )
})

afterEach(() => {
  mock.restore()
})

const tempRoot = mkdtempSync(join(tmpdir(), "context-kit-migrate-"))
const openInstances: DbInstance[] = []

function openSqlite(name: string): DbInstance {
  const instance = createDb(`sqlite:${join(tempRoot, name)}`)
  openInstances.push(instance)
  return instance
}

/** Builds a migrations folder containing one journal entry and its matching SQL file. */
function makeMigrationsFolder(dirName: string, sqlContent: string, tag = "0000_init"): string {
  const dir = join(tempRoot, dirName)
  mkdirSync(join(dir, "meta"), { recursive: true })
  writeFileSync(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "sqlite",
      entries: [{ idx: 0, version: "7", when: Date.now(), tag, breakpoints: true }],
    }),
  )
  writeFileSync(join(dir, `${tag}.sql`), sqlContent)
  return dir
}

/** An empty directory with no `meta/_journal.json` -- the "no migrations folder" case. */
function makeEmptyFolder(dirName: string): string {
  const dir = join(tempRoot, dirName)
  mkdirSync(dir, { recursive: true })
  return dir
}

/** A migrations folder with a single Postgres migration creating `tableName`. */
function makePostgresMigrationsFolder(dirName: string, tableName: string): string {
  const dir = join(tempRoot, dirName)
  const tag = `0000_${tableName}`
  mkdirSync(join(dir, "meta"), { recursive: true })
  writeFileSync(
    join(dir, "meta", "_journal.json"),
    JSON.stringify({
      version: "7",
      dialect: "postgresql",
      entries: [{ idx: 0, version: "7", when: Date.now(), tag, breakpoints: true }],
    }),
  )
  writeFileSync(join(dir, `${tag}.sql`), `CREATE TABLE ${tableName} (id serial primary key);`)
  return dir
}

/**
 * Builds an Error shaped like drizzle-orm's `DrizzleQueryError`: message `Failed query: <sql>`
 * with the driver's own error (carrying the Postgres `code`) on `.cause`. This is what
 * `instance.db.execute()` rejects with on the postgres branch of `countApplied`, since that path
 * goes through drizzle rather than a raw client.
 */
function wrappedQueryError(query: string, cause: Error): Error {
  return Object.assign(new Error(`Failed query: ${query}\nparams: `), { cause })
}

/**
 * Pulls the literal SQL text out of a drizzle `sql` template result (a `SQL` instance) without
 * going through a dialect-specific `toQuery()`. Used to assert which query a stub's `db.execute`
 * was called with.
 */
function sqlText(query: unknown): string {
  const chunks = (query as { queryChunks?: unknown[] }).queryChunks ?? []
  return chunks
    .map((chunk) => {
      const value = (chunk as { value?: unknown }).value
      return Array.isArray(value) ? value.join("") : ""
    })
    .join("")
}

/**
 * A fake postgres.js `ReservedSql` connection: callable as a tagged template like the real thing,
 * recording "lock" or "unlock" into `order` (a caller-shared array, so ordering against a
 * migrator that also pushes into it can be asserted) for whichever `pg_advisory_*` call it saw,
 * plus a `release` mock. Every call resolves `[]`, matching what a real `select pg_advisory_*`
 * query returns for the purposes of `withPostgresMigrationLock`, which never reads the result.
 */
function makeFakeReserved(order: string[]) {
  const release = mock()
  const reserved = Object.assign(
    (strings: TemplateStringsArray, ..._values: unknown[]) => {
      const text = strings.join("")
      if (text.includes("pg_advisory_unlock")) order.push("unlock")
      else if (text.includes("pg_advisory_lock")) order.push("lock")
      return Promise.resolve([])
    },
    { release },
  )
  return reserved
}

async function tableExists(instance: DbInstance, name: string): Promise<boolean> {
  if (instance.dialect !== "sqlite") throw new Error("expected a sqlite instance")
  await instance.ready
  const result = await instance.db.$client.execute(
    "select name from sqlite_master where type = 'table' and name = ?",
    [name],
  )
  return result.rows.length > 0
}

async function countRows(instance: DbInstance, table: string): Promise<number> {
  if (instance.dialect !== "sqlite") throw new Error("expected a sqlite instance")
  await instance.ready
  const result = await instance.db.$client.execute(`select count(*) as count from ${table}`)
  return Number(result.rows[0]?.count ?? 0)
}

afterAll(async () => {
  for (const instance of openInstances) await instance.close()
  rmSync(tempRoot, { recursive: true, force: true })
})

describe("runMigrations", () => {
  it("skips without touching the database when the migrations folder has no journal", async () => {
    const instance = openSqlite("no-journal.sqlite")
    const migrationsFolder = makeEmptyFolder("no-journal-migrations")

    noopLogger.info.mockClear()
    await runMigrations(instance, { migrationsFolder })

    expect(await tableExists(instance, "__drizzle_migrations")).toBe(false)
    expect(noopLogger.info).toHaveBeenCalledWith(
      expect.objectContaining({ migrationsFolder }),
      expect.stringContaining("No migrations folder found"),
    )
  })

  it("applies a fresh migration and records it in __drizzle_migrations", async () => {
    const instance = openSqlite("fresh.sqlite")
    const migrationsFolder = makeMigrationsFolder(
      "fresh-migrations",
      "CREATE TABLE widgets (id integer primary key, name text not null);",
    )

    // countApplied() runs before the migrator, and on a fresh database its count query hits a
    // table that does not exist yet -- this is the sqlite half of the bug this file covers:
    // isMissingTableError() must treat that "no such table" rejection as zero rows, not rethrow
    // it, or runMigrations() would never reach the migrator below.
    if (instance.dialect !== "sqlite") throw new Error("expected a sqlite instance")
    const executeSpy = spyOn(instance.db.$client, "execute")

    await runMigrations(instance, { migrationsFolder })

    expect(executeSpy.mock.calls[0]?.[0]).toBe("select count(*) as count from __drizzle_migrations")
    executeSpy.mockRestore()

    expect(await tableExists(instance, "widgets")).toBe(true)
    expect(await countRows(instance, "__drizzle_migrations")).toBe(1)
  })

  it("is a no-op on a second run against an already-migrated database", async () => {
    const instance = openSqlite("idempotent.sqlite")
    const migrationsFolder = makeMigrationsFolder(
      "idempotent-migrations",
      "CREATE TABLE gadgets (id integer primary key);",
    )

    await runMigrations(instance, { migrationsFolder })
    await runMigrations(instance, { migrationsFolder })

    expect(await countRows(instance, "__drizzle_migrations")).toBe(1)
  })

  it("propagates unexpected errors from countApplied instead of treating them as zero", async () => {
    const migrationsFolder = makeMigrationsFolder(
      "broken-migrations",
      "CREATE TABLE anything (id integer primary key);",
    )
    const brokenInstance = {
      dialect: "sqlite",
      db: {
        $client: {
          execute: () => Promise.reject(new Error("connection refused")),
        },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance

    await expect(runMigrations(brokenInstance, { migrationsFolder })).rejects.toThrow(
      "connection refused",
    )
  })
})

// Regression coverage for a fresh Postgres database: `instance.db.execute()` goes through
// drizzle-orm, which wraps the raw postgres error in `DrizzleQueryError`. The Postgres `code`
// lives on `.cause`, not on the wrapper itself, and on a database that has never run a migration
// the `drizzle` schema does not exist yet (3F000) rather than just the table (42P01). Both stub
// instances below use `dialect: "postgres"` with only `db.execute` implemented -- everything else
// `runMigrations` touches on that path (the migrator) is supplied via the `migrators` injection
// point, so the fix is exercised without a real Postgres connection.
describe("runMigrations (postgres error shapes)", () => {
  it("proceeds past a fresh-schema error (3F000) into the postgres migrator", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("schema-missing", "schema_missing_test")
    const cause = Object.assign(new Error('schema "drizzle" does not exist'), { code: "3F000" })
    const error = wrappedQueryError(
      "select count(*) as count from drizzle.__drizzle_migrations",
      cause,
    )
    const stub = {
      dialect: "postgres",
      db: {
        execute: () => Promise.reject(error),
        $client: { reserve: () => Promise.resolve(makeFakeReserved([])) },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance
    const postgresMigrator = mock(async () => {})
    const sqliteMigrator = mock(async () => {})

    await expect(
      runMigrations(stub, {
        migrationsFolder,
        migrators: { sqlite: sqliteMigrator, postgres: postgresMigrator },
      }),
    ).resolves.toBeUndefined()

    expect(postgresMigrator).toHaveBeenCalledTimes(1)
    expect(postgresMigrator).toHaveBeenCalledWith(stub.db, { migrationsFolder })
    expect(sqliteMigrator).not.toHaveBeenCalled()
  })

  it("proceeds past a missing-table error (42P01) into the postgres migrator", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("table-missing", "table_missing_test")
    const cause = Object.assign(
      new Error('relation "drizzle.__drizzle_migrations" does not exist'),
      { code: "42P01" },
    )
    const error = wrappedQueryError(
      "select count(*) as count from drizzle.__drizzle_migrations",
      cause,
    )
    const stub = {
      dialect: "postgres",
      db: {
        execute: () => Promise.reject(error),
        $client: { reserve: () => Promise.resolve(makeFakeReserved([])) },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance
    const postgresMigrator = mock(async () => {})

    await expect(
      runMigrations(stub, {
        migrationsFolder,
        migrators: { sqlite: mock(async () => {}), postgres: postgresMigrator },
      }),
    ).resolves.toBeUndefined()

    expect(postgresMigrator).toHaveBeenCalledWith(stub.db, { migrationsFolder })
  })

  it("does not treat a missing database (3D000) as fresh even though the message says 'does not exist'", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("missing-db", "missing_db_test")
    const cause = Object.assign(new Error('database "context_kit" does not exist'), {
      code: "3D000",
    })
    const error = wrappedQueryError(
      "select count(*) as count from drizzle.__drizzle_migrations",
      cause,
    )
    const stub = {
      dialect: "postgres",
      db: {
        execute: () => Promise.reject(error),
        $client: { reserve: () => Promise.resolve(makeFakeReserved([])) },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance
    const postgresMigrator = mock(async () => {})

    await expect(
      runMigrations(stub, {
        migrationsFolder,
        migrators: { sqlite: mock(async () => {}), postgres: postgresMigrator },
      }),
    ).rejects.toThrow("Failed query")
    expect(postgresMigrator).not.toHaveBeenCalled()
  })

  it("propagates a non-missing-table error wrapped by drizzle instead of treating it as zero rows", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("auth-failure", "auth_failure_test")
    const cause = Object.assign(new Error("password authentication failed"), { code: "28P01" })
    const error = wrappedQueryError(
      "select count(*) as count from drizzle.__drizzle_migrations",
      cause,
    )
    const stub = {
      dialect: "postgres",
      db: {
        execute: () => Promise.reject(error),
        $client: { reserve: () => Promise.resolve(makeFakeReserved([])) },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance
    const postgresMigrator = mock(async () => {})

    await expect(
      runMigrations(stub, {
        migrationsFolder,
        migrators: { sqlite: mock(async () => {}), postgres: postgresMigrator },
      }),
    ).rejects.toThrow("Failed query")

    expect(postgresMigrator).not.toHaveBeenCalled()
  })

  it("dispatches to the postgres migrator and not the sqlite one", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("dispatch", "dispatch_test")
    const execute = mock()
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ count: "1" }])
    const stub = {
      dialect: "postgres",
      db: { execute, $client: { reserve: () => Promise.resolve(makeFakeReserved([])) } },
      ready: Promise.resolve(),
    } as unknown as DbInstance
    const postgresMigrator = mock(async () => {})
    const sqliteMigrator = mock(async () => {})

    await runMigrations(stub, {
      migrationsFolder,
      migrators: { sqlite: sqliteMigrator, postgres: postgresMigrator },
    })

    expect(postgresMigrator).toHaveBeenCalledTimes(1)
    expect(postgresMigrator).toHaveBeenCalledWith(stub.db, { migrationsFolder })
    expect(sqliteMigrator).not.toHaveBeenCalled()

    const firstQuery = execute.mock.calls[0]?.[0]
    expect(sqlText(firstQuery)).toContain("drizzle.__drizzle_migrations")
  })
})

// Regression coverage for the startup-migration race: several replicas booting at once must not
// both read the same `countApplied` baseline and both run the migrator. `runMigrations` guards
// its Postgres database work with a session-level advisory lock taken on a connection reserved
// for the duration of the call (see `withPostgresMigrationLock` in migrate.ts). These tests use a
// fake reserved connection to assert the observable ordering without a real Postgres database;
// `runMigrations (real Postgres advisory lock)` below exercises the real thing.
describe("runMigrations (postgres advisory lock, stubbed)", () => {
  it("locks before the migrator runs and unlocks after, releasing the connection once", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("lock-order", "lock_order_test")
    const order: string[] = []
    const reserved = makeFakeReserved(order)
    const execute = mock()
      .mockResolvedValueOnce([{ count: "0" }])
      .mockResolvedValueOnce([{ count: "1" }])
    const stub = {
      dialect: "postgres",
      db: { execute, $client: { reserve: () => Promise.resolve(reserved) } },
      ready: Promise.resolve(),
    } as unknown as DbInstance
    const postgresMigrator = mock(async () => {
      order.push("migrate")
    })

    await runMigrations(stub, {
      migrationsFolder,
      migrators: { sqlite: mock(async () => {}), postgres: postgresMigrator },
    })

    expect(order).toEqual(["lock", "migrate", "unlock"])
    expect(reserved.release).toHaveBeenCalledTimes(1)
  })

  it("reports the migration error, not the unlock error, when both fail", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("lock-both-fail", "lock_both_fail_test")
    const release = mock()
    const reserved = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) =>
        strings.join("").includes("pg_advisory_unlock")
          ? Promise.reject(new Error("connection closed"))
          : Promise.resolve([]),
      { release },
    )
    const stub = {
      dialect: "postgres",
      db: {
        execute: mock().mockResolvedValueOnce([{ count: "0" }]),
        $client: { reserve: () => Promise.resolve(reserved) },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance

    await expect(
      runMigrations(stub, {
        migrationsFolder,
        migrators: {
          sqlite: mock(async () => {}),
          postgres: mock(async () => {
            throw new Error("migration failed")
          }),
        },
      }),
    ).rejects.toThrow("migration failed")
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("releases the connection even when the unlock statement itself rejects", async () => {
    const migrationsFolder = makePostgresMigrationsFolder(
      "lock-unlock-fail",
      "lock_unlock_fail_test",
    )
    const release = mock()
    const reserved = Object.assign(
      (strings: TemplateStringsArray, ..._values: unknown[]) =>
        strings.join("").includes("pg_advisory_unlock")
          ? Promise.reject(new Error("connection closed"))
          : Promise.resolve([]),
      { release },
    )
    const stub = {
      dialect: "postgres",
      db: {
        execute: mock()
          .mockResolvedValueOnce([{ count: "0" }])
          .mockResolvedValueOnce([{ count: "1" }]),
        $client: { reserve: () => Promise.resolve(reserved) },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance

    await expect(
      runMigrations(stub, {
        migrationsFolder,
        migrators: { sqlite: mock(async () => {}), postgres: mock(async () => {}) },
      }),
    ).rejects.toThrow("connection closed")
    expect(release).toHaveBeenCalledTimes(1)
  })

  it("still unlocks and releases the connection when the migrator rejects, and rethrows", async () => {
    const migrationsFolder = makePostgresMigrationsFolder("lock-error", "lock_error_test")
    const order: string[] = []
    const reserved = makeFakeReserved(order)
    const stub = {
      dialect: "postgres",
      db: {
        execute: mock().mockResolvedValueOnce([{ count: "0" }]),
        $client: { reserve: () => Promise.resolve(reserved) },
      },
      ready: Promise.resolve(),
    } as unknown as DbInstance
    const postgresMigrator = mock(async () => {
      order.push("migrate")
      throw new Error("migration failed")
    })

    await expect(
      runMigrations(stub, {
        migrationsFolder,
        migrators: { sqlite: mock(async () => {}), postgres: postgresMigrator },
      }),
    ).rejects.toThrow("migration failed")

    expect(order).toEqual(["lock", "migrate", "unlock"])
    expect(reserved.release).toHaveBeenCalledTimes(1)
  })
})

// Runs only against a real Postgres database (the CI Postgres job). CI has already run
// `bun run db:migrate` against the repo's own (empty) postgres journal before `bun test`, so the
// `drizzle` schema and `__drizzle_migrations` table may or may not exist yet when this runs --
// the point of this test is that it passes either way.
describe("runMigrations (real Postgres)", () => {
  const databaseUrl = process.env.DATABASE_URL
  const hasPostgres = databaseUrl?.startsWith("postgres") ?? false

  it.skipIf(!hasPostgres)(
    "applies and re-runs migrations against a real Postgres database",
    async () => {
      if (!databaseUrl) throw new Error("expected DATABASE_URL to be set")
      const tableName = `migrate_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const migrationsFolder = makePostgresMigrationsFolder(`real-${tableName}`, tableName)
      const instance = createDb(databaseUrl)
      if (instance.dialect !== "postgres") throw new Error("expected a postgres instance")

      try {
        await runMigrations(instance, { migrationsFolder })
        await expect(runMigrations(instance, { migrationsFolder })).resolves.toBeUndefined()

        const rows = await instance.db.execute<{ exists: boolean }>(
          sql`select to_regclass(${tableName}) is not null as exists`,
        )
        expect(rows[0]?.exists).toBe(true)
      } finally {
        await instance.db.execute(sql`drop table if exists ${sql.identifier(tableName)}`)
        await instance.close()
      }
    },
  )

  // Regression test for the race the advisory lock fixes: two instances (simulating two
  // replicas) run `runMigrations` concurrently against the same migrations folder, whose single
  // migration creates a uniquely named table WITHOUT `IF NOT EXISTS`. Without the lock, both
  // instances can read the same "before" count and both attempt to `CREATE TABLE` at once, and
  // the second one to reach that statement fails with a duplicate-table error (or, absent that
  // race, drizzle's own migrator applies the migration twice). With the lock, the second instance
  // blocks in `pg_advisory_lock` until the first releases, then finds the migration already
  // applied and does nothing.
  it.skipIf(!hasPostgres)(
    "serializes concurrent runMigrations calls so the migration is applied exactly once",
    async () => {
      if (!databaseUrl) throw new Error("expected DATABASE_URL to be set")
      const tableName = `migrate_lock_test_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`
      const migrationSql = `CREATE TABLE ${tableName} (id serial primary key);`
      const migrationsFolder = makePostgresMigrationsFolder(`real-lock-${tableName}`, tableName)
      const expectedHash = createHash("sha256").update(migrationSql).digest("hex")

      const a = createDb(databaseUrl)
      const b = createDb(databaseUrl)
      if (a.dialect !== "postgres" || b.dialect !== "postgres") {
        throw new Error("expected postgres instances")
      }

      try {
        await Promise.all([
          runMigrations(a, { migrationsFolder }),
          runMigrations(b, { migrationsFolder }),
        ])

        const existsRows = await a.db.execute<{ exists: boolean }>(
          sql`select to_regclass(${tableName}) is not null as exists`,
        )
        expect(existsRows[0]?.exists).toBe(true)

        const recordedRows = await a.db.execute<{ count: string }>(
          sql`select count(*) as count from drizzle.__drizzle_migrations where hash = ${expectedHash}`,
        )
        expect(Number(recordedRows[0]?.count)).toBe(1)
      } finally {
        await a.db.execute(sql`drop table if exists ${sql.identifier(tableName)}`)
        await a.close()
        await b.close()
      }
    },
  )
})

class ExitSignal extends Error {
  constructor(public code: number | undefined) {
    super(`process.exit(${code})`)
  }
}

describe("runMigrationsOrExit", () => {
  it("exits the process with code 1 when a migration fails", async () => {
    const instance = openSqlite("invalid-sql.sqlite")
    const migrationsFolder = makeMigrationsFolder("invalid-sql-migrations", "CREATE TABLE (;")

    const exitSpy = spyOn(process, "exit").mockImplementation((code?: number) => {
      throw new ExitSignal(code)
    })

    try {
      await expect(runMigrationsOrExit(instance, { migrationsFolder })).rejects.toThrow(ExitSignal)
      expect(exitSpy).toHaveBeenCalledWith(1)
    } finally {
      exitSpy.mockRestore()
    }
  })
})
