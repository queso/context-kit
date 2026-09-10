// Drizzle schema for the PostgreSQL dialect.
//
// context-kit ships two schema modules (`db/schema/sqlite.ts` and `db/schema/postgres.ts`) so the
// same app can run on either database. An app that has picked its database keeps one file and
// deletes the other (plus the matching `db/migrations/<dialect>` folder). Until then, keep the
// two in sync: every table defined here needs a `sqliteTable` twin in `sqlite.ts`.
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
