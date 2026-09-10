// Drizzle schema for the SQLite dialect.
//
// context-kit ships two schema modules (`db/schema/sqlite.ts` and `db/schema/postgres.ts`) so the
// same app can run on either database. `db/index.ts` imports both, so both files must exist. Edit
// the one your DATABASE_URL selects; leave the other as this empty template, or mirror every table
// into it (a `pgTable` twin in `postgres.ts`) if the app must run on either database.
//
// Example table -- uncomment, then run `bun run db:generate` to produce a migration:
//
// import { integer, sqliteTable, text } from "drizzle-orm/sqlite-core"
//
// export const todos = sqliteTable("todos", {
//   id: integer("id").primaryKey({ autoIncrement: true }),
//   title: text("title").notNull(),
//   completed: integer("completed", { mode: "boolean" }).notNull().default(false),
//   createdAt: integer("created_at", { mode: "timestamp" })
//     .notNull()
//     .$defaultFn(() => new Date()),
// })

// Keeps this file a module (and a valid, empty schema for drizzle-kit) until a table is added.
export {}
