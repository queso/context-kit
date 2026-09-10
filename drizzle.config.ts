import { defineConfig } from "drizzle-kit"
import { parseDatabaseUrl } from "@/db/url"
import { getEnv } from "@/lib/env"

// Dialect, schema, and migrations folder all follow DATABASE_URL, so the same config drives
// `drizzle-kit generate|push|studio` for either database. Going through getEnv() keeps the
// production rule (DATABASE_URL required) so a production `db:push` cannot fall back to SQLite.
const parsed = parseDatabaseUrl(getEnv().DATABASE_URL)

export default parsed.dialect === "sqlite"
  ? defineConfig({
      dialect: "sqlite",
      schema: "./db/schema/sqlite.ts",
      out: "./db/migrations/sqlite",
      dbCredentials: { url: `file:${parsed.path}` },
    })
  : defineConfig({
      dialect: "postgresql",
      schema: "./db/schema/postgres.ts",
      out: "./db/migrations/postgres",
      dbCredentials: { url: parsed.url },
    })
