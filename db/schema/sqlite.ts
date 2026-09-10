// Drizzle schema for the SQLite dialect.
//
// context-kit ships two schema modules (`db/schema/sqlite.ts` and `db/schema/postgres.ts`) so the
// same app can run on either database. An app that has picked its database keeps one file and
// deletes the other (plus the matching `db/migrations/<dialect>` folder). Until then, keep the
// two in sync: every table defined here needs a `pgTable` twin in `postgres.ts`.
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
