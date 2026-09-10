# db/ -- Database Schema and Migrations

## Source of Truth

`schema/<dialect>.ts` defines the database schema. Drizzle tables are dialect-specific, so the kit ships one schema module per dialect: `schema/sqlite.ts` (the default, on `@libsql/client`, embedded SQLite) and `schema/postgres.ts`. Pick one for your app and delete the other, together with its `migrations/<dialect>/` folder.

`index.ts` exports the `db` instance, `getDialect()`, and `ping()`. The driver is chosen from the `DATABASE_URL` scheme: `sqlite:` opens the file with `@libsql/client` (as a `file:` URL), `postgres:` / `postgresql:` uses the `postgres` driver; `drizzle.config.ts` at the project root reads the same variable so drizzle-kit targets the same dialect.

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
- On SQLite, every open sets `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000` and creates the data directory on demand. Deploy with the database file on a local, writable filesystem; WAL does not work across network mounts.
- Use `bun run db:studio` to browse data in a GUI during development.
