---
missionId: ~
---

# Port context-kit to Bun and Drizzle

**Author:** Viv (draft), Josh (owner)  **Date:** 2026-09-09  **Status:** In progress
**Tracks:** [queso/context-kit#19](https://github.com/queso/context-kit/issues/19)

## Executive Summary

Bring the kit in line with the platform decisions ratified for `queso/grimoire` on 2026-08-26 so that grimoire can scaffold from it instead of forking it: Bun replaces Node 22, pnpm, and Vitest as runtime, package manager, and test runner; Drizzle replaces Prisma for the database layer, on the native `bun:sqlite` driver by default with Postgres still available for the SaaS lane. Everything that makes the kit the kit stays as it is: Next 16 App Router, React 19, TypeScript strict, Tailwind v4, shadcn/ui, Biome, the `lib/` helpers with their tests, and the CLAUDE.md/AGENTS.md intent layer. Done when a fresh clone installs, checks, tests, and serves with Bun alone, the health route reports a live SQLite database, and no Prisma or pnpm artifact remains in the tree.

## Definition of Done

- [ ]
- [ ]
- [ ]

## 1. Context & Background

context-kit is the Next.js foundation Josh's apps start from: a starter with a hardened `lib/` (API helpers, env validation, logging, caching, SSE, security headers), Biome-only linting, flowspec e2e, and the intent layer that tells agents how to work in it. Its stated philosophy, "packages, not code drops: fix once, inherit everywhere," is the reason grimoire named it the seed of `packages/core` on 2026-08-26.

That same day three gates were resolved for grimoire, and the kit is on the wrong side of all three: it pins pnpm 10 and Node 22, tests with Vitest, and persists with Prisma 7 on Postgres. Issue #19 was filed to align it. Nothing has been done since; the last commit is 2026-02-16. The companion issue for the packages repo, context-kit-packages#2, stays separate and is not in this mission.

Grimoire's bootstrap PRD (`prd/drafts/monorepo-bootstrap.md` in that repo) now depends on this mission. Doing the port here rather than inside grimoire means studio and every later app inherit it.

## 2. Problem Statement

A grimoire app scaffolded from the kit today would need to rip out pnpm, Vitest, and Prisma before writing its first feature, and the next app would do it again. The kit exists to prevent exactly that. Until it runs on Bun and Drizzle, it is a code drop, not a package.

## 3. Target Users & Use Cases

**Primary users:**

- **The AI Team**, running the grimoire bootstrap next. Needs a kit whose commands, config, and intent-layer files are already correct for Bun and Drizzle so the audit finds nothing to scaffold.
- **Josh**, starting any new internal app. Needs `bun install` and `bun run dev` to be the whole setup, with SQLite by default and no Postgres container for a single-box deploy.
- **A SaaS-lane app** (someday). Needs the Postgres path to still work through Drizzle so the kit does not split into two kits.

**Key use cases:**

- A developer needs to clone the kit and run `bun install`, `bun run db:migrate`, `bun run dev` so that the app serves at `http://localhost:3000` against a local SQLite file with nothing else installed.
- A developer needs to add a table in `db/schema.ts`, generate a migration, and apply it so that schema changes are plain SQL files in git.
- A developer needs `bun test` to run the existing unit and component tests so that the port does not lose the kit's coverage.
- Grimoire needs to copy the kit's `lib/`, `db/`, config, and intent-layer files into `apps/drop-app` so that its bootstrap is scaffolding, not porting.

## 4. Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Bun is the only toolchain | Files or scripts referencing pnpm, corepack, Node version pins, or Vitest | Zero |
| Drizzle is the only ORM | Files, deps, or scripts referencing Prisma | Zero; `lib/generated/` gone |
| Coverage survives | Existing tests under `lib/__tests__`, `app/__tests__`, `__tests__` | All pass under `bun test`, none deleted |
| SQLite by default | Commands from clone to running server | Three, no container |
| Postgres still works | `docker compose --profile postgres up` and the same test suite against `DATABASE_URL=postgres://...` | Green |
| Ready for the audit | Face's Project Readiness Audit run on grimoire's bootstrap PRD after scaffolding from the kit | No toolchain scaffolding items |

## 5. Scope

### In Scope

- **Toolchain**: Bun 1.x pinned in `package.json` `packageManager` (and `.bun-version`); `bun.lock` committed; `pnpm-lock.yaml`, `.node-version`, and the pnpm and corepack references in scripts, README, Dockerfile, CI, and renovate config removed. Every `package.json` script runs under `bun run`.
- **Test runner**: `bun test` replaces Vitest. A `bunfig.toml` preload registers a DOM (happy-dom or jsdom, whichever the mission proves against the existing component tests) and `@testing-library/jest-dom` matchers. `vitest.config.ts`, `vitest.setup.ts`, `vitest`, `@vitejs/plugin-react`, and `jsdom` (if unused) are removed. `test`, `test:watch`, and `test:coverage` scripts map to Bun equivalents.
- **Database layer**: Drizzle ORM on the stable 0.4x line with `drizzle-kit`. `db/schema.ts` as the single schema module, `db/index.ts` exporting the `db` instance, and `db/migrations/` holding plain-SQL migrations generated by `drizzle-kit generate`. Driver selected from the `DATABASE_URL` scheme: `sqlite:` (default, native `bun:sqlite`) or `postgres:` (the `postgres` driver). On SQLite, `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout` are set explicitly on every connection open and a test asserts both. `db:generate`, `db:migrate`, `db:push`, and `db:studio` scripts map to drizzle-kit. A migration runner applies pending migrations from `bun run db:migrate` and at server start.
- **Prisma removal**: `prisma/`, `prisma.config.ts`, `lib/generated/`, `lib/db.ts`, `@prisma/client`, `@prisma/adapter-pg`, `prisma`, and every `db:*` script that calls Prisma. `lib/env.ts` keeps `DATABASE_URL` as the one database variable with the scheme rule documented; its default for local dev is `sqlite:./data/dev.sqlite`.
- **Health route**: `app/api/health` runs a trivial query through Drizzle and reports `{ ok, db }`.
- **Docker**: `Dockerfile` on `oven/bun:1-alpine`, `bun install --frozen-lockfile`, dev command `bun run dev`. `docker-compose.yml` runs the app alone by default with a named volume for the SQLite file; the Postgres service moves behind a `postgres` compose profile with `DATABASE_URL` pointed at it.
- **CI**: `oven-sh/setup-bun`, `bun install --frozen-lockfile`, then typecheck, `bun run check`, `bun test`. A second job runs the test suite against a Postgres service container so the SaaS lane cannot rot silently.
- **Execution contract**: `ateam.config.json` switched to `packageManager: bun` with `check`, `unit`, `typecheck`, and `validate` mapped to the new scripts, `devServer.start` as `bun run dev`. This is the first work item so the pipeline's own prechecks run under the new toolchain for the rest of the mission.
- **Intent layer**: `CLAUDE.md` rewritten for Bun and Drizzle (stack table, scripts, directory guide, "no Prisma" note where the old text said "no auth, no billing"); `prisma/AGENTS.md` replaced by `db/AGENTS.md` (schema is source of truth, edit then generate then migrate, never hand-edit a generated migration); `lib/AGENTS.md` updated to import `db` from `@/db` instead of the Prisma singleton. Wording, tone, and the rest of the guidance unchanged; the intent layer is the kit's differentiator and the mission does not rewrite it beyond what the port requires.
- **Docs and version**: README quickstart on the three commands; `CHANGELOG.md` entry; version bump to 0.2.0.

### Out of Scope

- The packages repo (`queso/context-kit-packages`): error-tracker's Drizzle port and the Authentik identity lib. Tracked as context-kit-packages#2, its own mission.
- Any new feature, helper, or dependency not required by the port. No auth, no billing, no PWA, no design tokens.
- Changing Next, React, Tailwind, shadcn, Biome, flowspec, or the `lib/` helpers' behaviour. Tests may change import paths and environment setup only.
- Postgres as the default. It stays on the profile for the SaaS lane.
- Upgrading Drizzle to v1. Stable 0.4x now; v1 at GA via its upgrade guide.
- Grimoire itself. Its bootstrap PRD consumes this mission's result.

## 6. Requirements

### Functional Requirements

1. A fresh clone shall reach a running dev server with exactly `bun install`, `bun run db:migrate`, and `bun run dev`, with no `DATABASE_URL` set, using `sqlite:./data/dev.sqlite` and creating the `data/` directory on demand.
2. `bun run check` shall run Biome check and `bun run typecheck` shall run `tsc --noEmit`; `bun run validate` shall run typecheck, check, and test in that order and exit non-zero on any failure.
3. `bun test` shall discover and pass every test that existed before the port, under a DOM environment registered by `bunfig.toml`, with `@testing-library/jest-dom` matchers available.
4. No file in the repository shall reference pnpm, corepack, `.node-version`, Vitest, or Prisma once the mission completes; `grep -ri` for each shall return only `CHANGELOG.md` and this PRD.
5. `db/index.ts` shall export a Drizzle `db` instance whose driver is chosen by the `DATABASE_URL` scheme: `sqlite:` uses `bun:sqlite`, `postgres:` uses the `postgres` driver, and any other scheme shall throw at startup with a message naming the two supported schemes.
6. On SQLite, opening a connection shall execute `PRAGMA journal_mode=WAL` and `PRAGMA busy_timeout=5000`, and a test shall read both pragmas back and assert them.
7. `bun run db:generate` shall write a plain-SQL migration file under `db/migrations/` from changes to `db/schema.ts`; `bun run db:migrate` shall apply pending migrations idempotently; the server shall apply them at start and shall refuse to serve on a failed migration.
8. `GET /api/health` shall execute a query through Drizzle and return 200 `{ ok: true, db: "ok" }`, or a non-200 status with `db` set to the failure class when the database cannot be reached.
9. `docker compose up` shall start the app on port 3000 against a SQLite file on a named volume with no other service; `docker compose --profile postgres up` shall start Postgres 17 and the app with `DATABASE_URL` pointed at it.
10. CI shall run on push to `main` and on pull requests: install with `bun install --frozen-lockfile`, then typecheck, check, and test on SQLite; a second job shall run the test suite against a Postgres service container.
11. `ateam.config.json` shall declare `packageManager: "bun"` and map every check to a script that exists in `package.json`; it shall be the first change merged so later items' prechecks run under Bun.
12. `CLAUDE.md`, `lib/AGENTS.md`, and a new `db/AGENTS.md` shall describe the Bun and Drizzle workflow accurately, and no AGENTS.md shall mention Prisma or pnpm.
13. `lib/env.ts` shall validate `DATABASE_URL` against the two schemes and default it to the SQLite path in non-production; in production a missing `DATABASE_URL` shall fail validation.

### Non-Functional Requirements

1. Install-to-green (`bun install` then `bun run validate`) shall complete in under two minutes on a laptop.
2. The dependency tree shall shrink: no ORM engine binary, no generated client directory, no second runtime for tests.
3. The kit's existing behaviour under test shall not change; a diff of test assertions before and after the port shall show only import paths, environment setup, and database access helpers.
4. The intent-layer files shall stay within their current length and structure so agents that learned the kit's layout keep working.

### Edge Cases & Error States

- **Next 16 under `bun --bun`** misbehaves for `dev` or `build`: run Next with Bun as package manager and test runner but let `next` invoke Node for its own process. Record which in the README. This is a build-time detail, not a decision reversal.
- **A component test depends on a jsdom-only API** that happy-dom lacks: keep jsdom for that environment; the DOM choice is the mission's to prove, not to assume.
- **`drizzle-kit` needs a driver at generate time**: generate from the schema without a live database (`dialect` set per scheme); the mission documents the one command per dialect.
- **Existing Postgres data in a developer's Compose volume**: irrelevant, the schema is empty; note in the CHANGELOG that the `pgdata` volume can be dropped.
- **`DATABASE_URL` set to the old `postgresql://` form**: accept `postgresql:` as an alias of `postgres:`.
- **Migration folder empty on first run**: `db:migrate` is a no-op and says so; the health route still passes.
- **Renovate or dependabot opens pnpm-flavoured PRs after the port**: the config change is part of the toolchain item; stale PRs are closed by hand.

## 9. Technical Considerations

**Constraints:**

- Drizzle 0.4x line; `drizzle-kit` matching. Both spikes on 2026-08-26 ran on this combination under Bun and passed the concurrency gauntlet (400/400 writes beside a raw `bun:sqlite` writer, zero `SQLITE_BUSY`).
- `bun test` with `@testing-library/react` is proven at scale in autocut (5k+ tests).
- The kit is public and MIT; nothing private lands here.

**Dependencies:**

- None external. Bun 1.x on the developer's machine and on the CI runner (`oven-sh/setup-bun`).

**Integration points:**

- `queso/grimoire` `prd/drafts/monorepo-bootstrap.md` depends on this mission and scaffolds `apps/drop-app` from the result.
- `queso/context-kit-packages` #2 follows this convention for how a package ships a Drizzle schema module; not started here.

## 10. Risks & Open Questions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| DOM environment under `bun test` breaks a component test | Medium | Coverage loss | Both happy-dom and jsdom are allowed; choose by making the existing tests pass, not by preference |
| Next 16 tooling under Bun has a rough edge | Medium | Dev or build stalls | Fallback to Node for the `next` process is explicitly permitted; Bun stays PM and test runner |
| Driver-by-scheme adds a branch the SaaS lane never exercises | Low | Postgres path rots | CI job against a Postgres service container is a requirement, not a nice-to-have |
| The pipeline's own prechecks break mid-mission when scripts change | High if unordered | Every later item fails precheck | `ateam.config.json` plus the script rename is the first work item, merged alone |
| Intent-layer rewrite drifts into a style pass | Medium | Agents lose learned layout | NFR 4; the reviewer diffs the AGENTS files for structure |

### Open Questions

- [ ] `bun --bun next` versus Node for the Next process. Recommendation: whichever works first; record it.
- [ ] Keep `test:coverage`? Bun's coverage is built in (`bun test --coverage`); recommendation: keep the script, map it.
- [ ] Move the two historical PRDs (`prd/0001`, `prd/0002`) into `prd/completed/` for the plugin's layout. Recommendation: yes, in this mission's docs item, content untouched.
