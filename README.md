# context-kit

An opinionated Next.js starter built for AI-assisted development.

This is not another SaaS boilerplate with auth screens and pricing pages you'll rip out in an hour. It's a foundation. Clean architecture, modern tooling, and -- the part that actually matters -- an intent layer baked in so AI coding tools understand your project from the first commit.

The idea is simple: AI tools like Claude Code work dramatically better when they have durable context about your project instead of you re-explaining everything in disposable chat. CLAUDE.md and AGENTS.md files give that context a permanent home in your repo.

## Start a New Project

```bash
# 1. Clone and detach from context-kit history
git clone https://github.com/queso/context-kit.git my-app
cd my-app
rm -rf .git
git init

# 2. Make it yours
#    - Update "name" in package.json
#    - Update the title in CLAUDE.md and app/layout.tsx
#    - Replace "context-kit" references with your project name

# 3. Set up environment (optional -- DATABASE_URL defaults to a local SQLite file)
cp .env.example .env
#    - Point DATABASE_URL at Postgres if you want it (sqlite:./data/dev.sqlite by default)
#    - Set SITE_URL to your production domain when ready

# 4. Start developing
bun install
bun run db:migrate
bun run dev
```

Open [http://localhost:3000](http://localhost:3000). You're up. Three commands, no container.

**Without Docker you need two things installed:** [Bun](https://bun.sh) 1.3.x is the package manager, script runner, and test runner. Node 24+ runs the Next server, because Bun's runtime cannot build or start Next 16 yet ([oven-sh/bun#25609](https://github.com/oven-sh/bun/issues/25609)); `bun run dev` handles this transparently. `package.json` declares `engines.node >= 24`; install Node with any version manager, no version file is shipped.

**With Docker:** `docker compose up -d` runs the app alone against a SQLite file on a named volume. To develop against Postgres 17 instead, `DATABASE_URL=postgres://context_kit:context_kit@postgres:5432/context_kit docker compose --profile postgres up -d` starts both.

**Next steps after setup:**

1. Edit `db/schema/sqlite.ts` (or `db/schema/postgres.ts`) to define your domain tables, and delete the dialect you are not using
2. Run `bun run db:generate` to write a SQL migration, then `bun run db:migrate` to apply it
3. Update `CLAUDE.md` to describe your project -- this is what AI tools read first
4. Add `AGENTS.md` files in subdirectories as your codebase grows
5. Start building. The foundation handles env validation, logging, security headers, SEO, error pages, and health checks out of the box.

## The Stack

| Layer | Choice | Why |
|-------|--------|-----|
| Framework | **Next.js 16** (App Router) | The default choice for production React. App Router is the future, no reason to start with Pages. |
| Toolchain | **Bun** + Node 24 | Bun is package manager, script runner, and test runner in one binary, pinned in `.bun-version`. Node 24 runs the Next server until Bun's runtime can ([oven-sh/bun#25609](https://github.com/oven-sh/bun/issues/25609)). |
| Language | **TypeScript** (strict mode) | Strict mode catches real bugs. If you're going to use TypeScript, actually use it. |
| UI | **React 19** | Server Components, Actions, and the new hooks are too useful to leave on the table. |
| Styling | **Tailwind CSS v4** | Fastest way to style components without context-switching to CSS files. v4 is leaner and faster. |
| Components | **shadcn/ui** | Copy-paste components you own. No dependency lock-in, full control, looks good out of the box. |
| Code Quality | **Biome** | Replaces ESLint + Prettier with a single tool. Faster, less config, fewer dependency headaches. |
| Testing | **bun test + React Testing Library** | Built into Bun, fast, Jest-compatible API. One less tool to install and configure. |
| Database | **Drizzle ORM** | SQLite via `@libsql/client` by default, Postgres for the SaaS lane. Plain-SQL migrations you can read in a PR, no codegen step. |
| Local Dev | **Docker Compose** | Runs the app on SQLite by default; Postgres sits behind a profile for when you need it. OrbStack or Docker Desktop, one command, no local installs. |
| CI | **GitHub Actions** | Lint, type-check, and test on every PR, on SQLite and on Postgres. Ships as a workflow file, ready to go. |
| Dependency Updates | **Dependabot + Renovate** | Dependabot for Actions versions, Renovate for npm with auto-merge. Patch/minor ship automatically when CI passes. |
| AI Context | **CLAUDE.md + AGENTS.md** | The whole point. Project-level and directory-level context for AI coding tools. |

## AI-Native Development

Most people use AI coding tools by pasting context into chat over and over. That works, but it's slow and it doesn't scale.

This template ships with two files that change the workflow:

**CLAUDE.md** sits at the project root. It tells Claude Code (and other AI tools that read it) what the project is, what conventions you follow, how to run things, and what to watch out for. Think of it as onboarding docs for your AI pair programmer.

**AGENTS.md** files live in subdirectories. Each one gives domain-specific context for that part of the codebase. Your `app/` directory might explain routing conventions. Your `lib/` directory might document shared utilities and patterns. The AI reads the nearest AGENTS.md before making changes, so it respects local conventions without you having to repeat yourself.

This is the intent layer pattern. Durable context beats disposable chat every time.

## Built-in Foundation

These features ship out of the box so you start with production-grade defaults instead of bolting them on later:

**Environment Validation** -- `lib/env.ts` validates `DATABASE_URL`, `LOG_LEVEL`, and `SITE_URL` at startup using Zod. Missing or invalid variables throw clear error messages immediately instead of failing at runtime.

**Structured Logging** -- `lib/logger.ts` provides a pino-based logging factory. Pretty-printed in development, JSON in production. Import `logger` from `@/lib/logger` or call `createLogger()` for custom instances. Control verbosity with the `LOG_LEVEL` env var.

**Security Headers** -- Every response includes Content-Security-Policy, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy. Configured in `next.config.ts` via `lib/security-headers.ts`.

**SEO Baseline** -- Dynamic `sitemap.xml`, `robots.txt`, Open Graph metadata, and a title template are wired up in the root layout. Set `SITE_URL` in your environment and everything points to the right place.

**Error Boundaries** -- Custom error page (`app/error.tsx`), 404 page (`app/not-found.tsx`), and loading spinner (`app/loading.tsx`) styled with Tailwind and dark mode support.

**Health Check** -- `GET /api/health` returns database connectivity, latency, and a timestamp. Useful for container orchestrators, uptime monitors, and deployment checks.

## What's NOT Included

This needs to be said clearly because every starter template eventually becomes a SaaS kit:

- **No auth.** Pick your own. NextAuth, Clerk, Lucia, roll your own. Not my call.
- **No example pages.** You get a clean `app/` directory, not a demo app to delete.
- **No business logic.** No API routes doing things you don't need.
- **No SaaS features.** No billing, no teams, no onboarding flows.
- **No opinions on deployment.** Vercel, Docker, whatever. Your call.

This is a foundation. Build your thing on top of it.

## License

MIT. Do whatever you want with it.

---

Built by [Josh Owens](https://joshowens.dev). I do AI-augmented engineering consulting -- helping teams ship faster with AI tools baked into their workflow.
