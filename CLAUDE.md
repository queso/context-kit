# context-kit

An opinionated Next.js starter built for AI-assisted development. Clean architecture, modern tooling, and an intent layer (CLAUDE.md + AGENTS.md) so AI coding tools understand the project from the first commit.

This is a foundation, not a SaaS boilerplate. There is no auth, no billing, no example pages to delete.

## Stack

Next.js 16 with App Router, React 19, TypeScript in strict mode, Tailwind CSS v4, shadcn/ui (New York style, lucide icons), Biome for linting and formatting, Vitest with React Testing Library for tests, Prisma ORM with PostgreSQL, pnpm for package management, Docker Compose for local dev, GitHub Actions for CI.

Node 22 (see `.node-version`). Use fnm to manage versions. pnpm is the package manager (corepack-managed, version pinned in `package.json`).

## Running the Project

**With Docker (recommended):**

```bash
cp .env.example .env
docker compose up -d
```

This starts Postgres and the Next.js dev server. Code is volume-mounted so changes hot reload. App runs at http://localhost:3000.

**Without Docker:**

```bash
cp .env.example .env
pnpm install
# Start Postgres yourself, then:
pnpm dev
```

## Scripts

| Script | What it does |
|--------|-------------|
| `dev` | Start Next.js dev server with Turbopack |
| `build` | Production build |
| `start` | Start production server |
| `lint` | Check linting with Biome |
| `lint:fix` | Auto-fix lint issues |
| `format` | Check formatting with Biome |
| `format:fix` | Auto-fix formatting |
| `check` | Run all Biome checks (lint + format) |
| `check:fix` | Auto-fix all Biome issues |
| `test` | Run Vitest tests once |
| `test:watch` | Run Vitest in watch mode |
| `test:coverage` | Run tests with coverage report |
| `typecheck` | Run TypeScript type checking (tsc --noEmit) |
| `db:generate` | Generate Prisma client |
| `db:push` | Push schema changes to database (no migration file) |
| `db:migrate` | Create and apply a Prisma migration |
| `db:studio` | Open Prisma Studio GUI |
| `db:seed` | Run database seed script |
| `validate` | Run typecheck + check + test (same as CI) |

## Code Conventions

- **TypeScript strict mode** is on. Do not weaken it with `any` or `@ts-ignore`.
- **Biome** handles linting and formatting. Do not add ESLint or Prettier.
  - 2-space indentation, double quotes, semicolons only as needed.
  - Line width: 100 characters.
  - Import organization is automatic via Biome assist.
- **Path alias**: Use `@/` to import from the project root (e.g., `@/lib/utils`, `@/app/page`).

## Directory Structure

```
app/              Next.js App Router pages and layouts
  __tests__/      Colocated test files (*.test.tsx)
  globals.css     Tailwind v4 + shadcn/ui theme variables
  layout.tsx      Root layout
  page.tsx        Home page
lib/              Shared utilities
  db.ts           Prisma client singleton
  utils.ts        cn() helper for Tailwind class merging
  generated/      Prisma generated client (gitignored)
prisma/
  schema.prisma   Database schema (source of truth)
  migrations/     Migration files (gitignored until committed)
public/           Static assets
.github/
  dependabot.yml  Dependabot config (GitHub Actions updates only)
  workflows/
    ci.yml        GitHub Actions: typecheck, lint, test on PRs
renovate.json     Renovate config (npm dependency auto-updates)
```

## Key Patterns

- **Server Components by default.** Only add `"use client"` when you need browser APIs, event handlers, or React hooks.
- **Prisma singleton** in `lib/db.ts`. Import `prisma` from `@/lib/db` -- do not create new PrismaClient instances.
- **Prisma client output** goes to `lib/generated/prisma`. Import types from `@/lib/generated/prisma/client`.
- **shadcn/ui components** go in `components/ui/`. Add them with `pnpm dlx shadcn add <component>`.
- **`cn()` utility** in `lib/utils.ts` for merging Tailwind classes. Use it in component className props.
- **Test files** are colocated in `__tests__/` directories as `*.test.tsx`. Vitest uses jsdom environment with globals enabled.

## Testing

- Framework: Vitest + React Testing Library + jest-dom matchers.
- Setup file: `vitest.setup.ts` (imports jest-dom matchers).
- Test pattern: `**/*.test.{ts,tsx}`.
- Vitest globals are enabled -- `describe`, `it`, `expect` are available without imports, though explicit imports from `vitest` are fine too.
- Run `pnpm test` before committing. CI runs the same check.

## Dependency Updates

Automated dependency updates use two tools:

- **Dependabot** (`.github/dependabot.yml`): GitHub Actions versions only. Weekly, grouped.
- **Renovate** (`renovate.json`): npm packages. Minor/patch auto-merge when CI passes. Major versions get individual PRs for review.

Prisma, React, and testing packages are grouped (they must update together). Node.js and pnpm versions are managed manually via `.node-version` and `packageManager` in `package.json`.

Do not add an `npm` ecosystem entry to `dependabot.yml` — Renovate handles all npm updates.

## What NOT to Do

- **Do not add ESLint or Prettier.** Biome replaces both.
- **Do not create Pages Router files** (no `pages/` directory). This project uses App Router only.
- **Do not add auth, billing, teams, or SaaS features.** This is a clean foundation.
- **Do not create new PrismaClient instances.** Use the singleton from `@/lib/db`.
- **Do not weaken TypeScript strict mode.** No `any`, no `@ts-ignore`, no `skipLibCheck` changes.
- **Do not install Jest.** Vitest is the test runner.
- **Do not edit files in `lib/generated/`.** They are auto-generated by Prisma.
- **Do not use the docker-compose credentials in production.** The hardcoded `context_kit` user/password is for local development only. Use environment secrets for production databases.
