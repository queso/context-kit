# db/ -- Database Schema and Migrations

## Source of Truth

`schema/<dialect>.ts` defines the database schema. Drizzle tables are dialect-specific, so the kit ships one schema module per dialect: `schema/sqlite.ts` (the default, on `@libsql/client`, embedded SQLite) and `schema/postgres.ts`. Edit the one your `DATABASE_URL` selects. Both modules must exist because `index.ts` imports both unconditionally; leave the unused one as the empty template it ships as (or mirror your tables into it if the app must run on either database).

`index.ts` exports the `db` instance, `getDb()` (the same instance behind a function call, for code that prefers not to hold the lazy proxy), `getDialect()`, and `ping()`. The driver is chosen from the `DATABASE_URL` scheme: `sqlite:` opens the file with `@libsql/client` (as a `file:` URL), `postgres:` / `postgresql:` uses the `postgres` driver; `drizzle.config.ts` at the project root reads the same variable so drizzle-kit targets the same dialect.

## Workflow

1. Edit `schema/<dialect>.ts` to add or modify tables.
2. Run `bun run db:generate` to write a plain-SQL migration under `migrations/<dialect>/`.
3. Review the generated SQL, then run `bun run db:migrate` to apply it. The server also applies pending migrations at start (`instrumentation.ts`) and exits if one fails.

Use `bun run db:push` for quick prototyping (pushes schema changes without creating a migration file).

## Conventions

- Never hand-edit a generated migration. Change the schema and regenerate.
- Keep tables clean with clear column names. Use explicit primary keys (`integer().primaryKey()` or a `text` UUID) and name columns in `snake_case` when they should differ from the property name.
- Always import `db` from `@/db`. Never create a second Drizzle instance.
- The `DATABASE_URL` environment variable configures the connection (see `.env.example`). It defaults to `sqlite:./data/dev.sqlite` outside production and is required in production.
- For a remote PostgreSQL server, require verified TLS in the URL: `postgres://user:pass@host:5432/db?sslmode=verify-full`. The `postgres` driver reads `sslmode` from the URL, so TLS is a deployment setting rather than code; the local Docker Compose Postgres has no TLS and uses no `sslmode`. Never disable certificate validation (`sslmode=require` without verification, or `rejectUnauthorized: false`).
- On SQLite, every open sets `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` and creates the data directory on demand. Every query issued through `db` (or `db.$client`) waits for those pragmas, so handlers never need to call `ready()`; it exists for callers that want to fail fast on connection setup. Deploy with the database file on a local, writable filesystem; WAL does not work across network mounts.
- Startup migrations (`instrumentation.ts` calling `runMigrations()`) run on every replica that boots. On Postgres this is serialized with a session-level advisory lock (`db/migrate.ts`), so multiple replicas can safely boot together. On SQLite the kit assumes exactly one server process per database file; a second process starting concurrently may fail its migration and exit, and restarting it will find the migrations already applied.
- Use `bun run db:studio` to browse data in a GUI during development.
