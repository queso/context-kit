import { defineConfig } from "drizzle-kit"
import { DEFAULT_SQLITE_URL, parseDatabaseUrl } from "@/db/url"

// Dialect, schema, and migrations folder all follow DATABASE_URL, so the same config drives
// `drizzle-kit generate|push|studio` for either database.
const parsed = parseDatabaseUrl(process.env.DATABASE_URL ?? DEFAULT_SQLITE_URL)

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
