// Drizzle schema for the PostgreSQL dialect.
//
// context-kit ships two schema modules (`db/schema/sqlite.ts` and `db/schema/postgres.ts`) so the
// same app can run on either database. `db/index.ts` imports both, so both files must exist. Edit
// the one your DATABASE_URL selects; leave the other as this empty template, or mirror every table
// into it (a `sqliteTable` twin in `sqlite.ts`) if the app must run on either database.
//
// Example table -- uncomment, then run `bun run db:generate` to produce a migration:
//
// import { boolean, pgTable, serial, text, timestamp } from "drizzle-orm/pg-core"
//
// export const todos = pgTable("todos", {
//   id: serial("id").primaryKey(),
//   title: text("title").notNull(),
//   completed: boolean("completed").notNull().default(false),
//   createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
// })

// Keeps this file a module (and a valid, empty schema for drizzle-kit) until a table is added.
export {}
