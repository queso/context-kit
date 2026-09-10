import { afterAll, describe, expect, it } from "bun:test"
import { existsSync, mkdtempSync, rmSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { sql } from "drizzle-orm"
import { createDb, type DbInstance, getInstance } from "@/db"

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

describe("createDb (sqlite ready guard)", () => {
  it("applies the busy_timeout pragma before the first query even if ready is never awaited", async () => {
    const path = join(tempRoot, "unready-pragma", "t.sqlite")
    const instance = open(`sqlite:${path}`)
    if (instance.dialect !== "sqlite") throw new Error("expected a sqlite instance")

    // Deliberately not awaiting instance.ready here: db.$client must guarantee it internally.
    const result = await instance.db.$client.execute("PRAGMA busy_timeout")
    expect(result.rows[0]?.[0]).toBe(5000)
  })

  it("lets a Drizzle query run immediately without the caller awaiting ready", async () => {
    const path = join(tempRoot, "unready-query", "t.sqlite")
    const instance = open(`sqlite:${path}`)
    if (instance.dialect !== "sqlite") throw new Error("expected a sqlite instance")

    const result = await instance.db.run(sql`select 1`)
    expect(result).toBeDefined()
  })

  it("reapplies the busy_timeout pragma after reconnect() drops the connection", async () => {
    const path = join(tempRoot, "reconnect-pragma", "t.sqlite")
    const instance = open(`sqlite:${path}`)
    if (instance.dialect !== "sqlite") throw new Error("expected a sqlite instance")

    await instance.ready
    expect(await pragma(instance, "busy_timeout")).toBe(5000)

    instance.db.$client.reconnect()

    // Deliberately not awaiting instance.ready here: db.$client must reapply the pragma itself.
    const result = await instance.db.$client.execute("PRAGMA busy_timeout")
    expect(result.rows[0]?.[0]).toBe(5000)
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

describe("getInstance singleton", () => {
  // Only the tests below touch the module-level singleton; the flag keeps the cleanup from lazily
  // opening a connection against the ambient DATABASE_URL when nothing here created one.
  let singletonOpened = false

  afterAll(async () => {
    // Leave the singleton closed and evicted so other test files that touch `db`/`getInstance()`
    // start fresh rather than inheriting a closed connection from this describe block.
    if (singletonOpened) await getInstance().close()
  })

  it("reuses the same instance across calls until closed, then reconnects on next call", async () => {
    singletonOpened = true
    const first = getInstance()
    expect(getInstance()).toBe(first)

    await first.close()

    const second = getInstance()
    expect(second).not.toBe(first)
    await expect(second.ping()).resolves.toBeUndefined()
  })
})
