import { afterAll, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { createDb, type DbInstance } from "@/db"

const tempRoot = mkdtempSync(join(tmpdir(), "context-kit-db-"))
const openInstances: DbInstance[] = []

function open(url: string): DbInstance {
  const instance = createDb(url)
  openInstances.push(instance)
  return instance
}

async function pragma(instance: DbInstance, name: string): Promise<unknown> {
  if (instance.dialect !== "sqlite") throw new Error("expected a sqlite instance")
  await instance.ready
  const result = await instance.db.$client.execute(`PRAGMA ${name}`)
  return result.rows[0]?.[0]
}

afterAll(async () => {
  for (const instance of openInstances) await instance.close()
  rmSync(tempRoot, { recursive: true, force: true })
})

describe("createDb (sqlite)", () => {
  const path = join(tempRoot, "nested", "t.sqlite")
  const instance = open(`sqlite:${path}`)

  it("creates the parent directory and the database file", async () => {
    await instance.ready
    expect(instance.dialect).toBe("sqlite")
    expect(existsSync(join(tempRoot, "nested"))).toBe(true)
    expect(existsSync(path)).toBe(true)
  })

  it("enables WAL journaling and a 5s busy timeout", async () => {
    expect(await pragma(instance, "journal_mode")).toBe("wal")
    expect(await pragma(instance, "busy_timeout")).toBe(5000)
  })

  it("answers ping()", async () => {
    await expect(instance.ping()).resolves.toBeUndefined()
  })

  it("supports the in-memory database without touching the filesystem", async () => {
    const memory = open("sqlite::memory:")
    expect(await pragma(memory, "journal_mode")).toBe("memory")
    await expect(memory.ping()).resolves.toBeUndefined()
  })
})

describe("createDb (postgres)", () => {
  const postgresUrl = process.env.DATABASE_URL ?? ""
  const hasPostgres = /^postgres(ql)?:/.test(postgresUrl)

  // Runs only when the test process is pointed at a real Postgres (the CI Postgres job).
  it.skipIf(!hasPostgres)("answers ping() against the configured database", async () => {
    const instance = open(postgresUrl)
    expect(instance.dialect).toBe("postgres")
    await expect(instance.ping()).resolves.toBeUndefined()
  })
})

describe("createDb (unsupported)", () => {
  it("throws a message naming both supported schemes", () => {
    expect(() => createDb("mysql://user:pass@localhost:3306/db")).toThrow(/sqlite:[\s\S]*postgres:/)
  })
})
