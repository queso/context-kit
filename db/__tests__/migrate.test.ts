import { afterAll, describe, expect, it, mock, spyOn } from "bun:test"
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDb, type DbInstance } from "@/db"
import { runMigrations, runMigrationsOrExit } from "@/db/migrate"

// Spy on the real logger module (module mocks are process-global in bun:test and would leak
// into other test files). Named imports inside migrate.ts see the spy. See __tests__/middleware.test.ts.
const loggerMod = await import("@/lib/logger")
const noopLogger = { info: mock(), error: mock(), warn: mock(), debug: mock() }
spyOn(loggerMod, "getLogger").mockReturnValue(
  noopLogger as unknown as ReturnType<typeof loggerMod.getLogger>,
)

afterAll(() => {
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

    await runMigrations(instance, { migrationsFolder })

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
