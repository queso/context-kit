# context-kit

An opinionated Next.js starter built for AI-assisted development. Clean architecture, modern tooling, and an intent layer (CLAUDE.md + AGENTS.md) so AI coding tools understand the project from the first commit.

This is a foundation, not a SaaS boilerplate. There is no auth, no billing, no example pages to delete.

## Stack

Next.js 16 with App Router, React 19, TypeScript in strict mode, Tailwind CSS v4, shadcn/ui (New York style, lucide icons), Biome for linting and formatting, `bun test` with React Testing Library for tests, Drizzle ORM with SQLite (`@libsql/client`) by default and PostgreSQL optional, SWR for client-side data fetching, reactiveSWR for real-time SSE, Bun for package management, scripts, and tests; Node 24 for the Next server, Docker Compose for local dev, GitHub Actions for CI.

Bun 1.3 (see `.bun-version`, pinned again as `packageManager` in `package.json`). Install it from https://bun.sh. Node 24+ is also required (`engines.node` in `package.json`; no version file is shipped, use any version manager): Bun's runtime cannot build or start Next 16 yet, so `bun run dev`, `build`, and `start` hand the Next process to Node transparently.

## Running the Project

**Locally (recommended):**

```bash
bun install
bun run db:migrate
bun run dev
```

`DATABASE_URL` defaults to `sqlite:./data/dev.sqlite`, so no `.env` is needed to start. Copy `.env.example` to `.env` when you want to change it. App runs at http://localhost:3000.

**With Docker:**

```bash
docker compose up -d
```

This starts the app alone against a SQLite file on a named volume. Code is volume-mounted so changes hot reload. To develop against Postgres 17 instead:

```bash
DATABASE_URL=postgres://context_kit:context_kit@postgres:5432/context_kit docker compose --profile postgres up -d
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
| `test` | Run tests once with `bun test` |
| `test:watch` | Run `bun test` in watch mode |
| `test:coverage` | Run tests with coverage report |
| `test:e2e` | Run flowspec end-to-end tests |
| `typecheck` | Run TypeScript type checking (tsc --noEmit) |
| `db:generate` | Generate a SQL migration from schema changes (drizzle-kit) |
| `db:push` | Push schema changes to database (no migration file) |
| `db:migrate` | Apply pending migrations |
| `db:studio` | Open Drizzle Studio GUI |
| `validate` | Run typecheck + check + test (same as CI) |

Run scripts with `bun run <script>` (`bun test` also works directly). The Next server is deliberately left on Node; `package.json` declares `engines.node >= 24` for it.

## Code Conventions

- **TypeScript strict mode** is on. Do not weaken it with `any` or `@ts-ignore`.
- **Biome** handles linting and formatting. Do not add ESLint or Prettier.
  - 2-space indentation, double quotes, semicolons only as needed.
  - Line width: 100 characters.
  - Import organization is automatic via Biome assist.
- **Path alias**: Use `@/` to import from the project root (e.g., `@/lib/utils`, `@/app/page`).

## Directory Structure

```
app/                        Next.js App Router pages and layouts
  __tests__/                Page and component tests (*.test.tsx)
  api/
    health/
      __tests__/            Health endpoint tests
      route.ts              GET /api/health -- DB connectivity check
  error.tsx                 Global error boundary (client component)
  not-found.tsx             Custom 404 page
  loading.tsx               Global loading spinner
  sitemap.ts                Dynamic sitemap.xml generation
  robots.ts                 Dynamic robots.txt generation
  providers.tsx             Client providers (SWR + optional SSE + correlation IDs)
  layout.tsx                Root layout with SEO metadata
  page.tsx                  Home page
  globals.css               Tailwind v4 + shadcn/ui theme variables
components/
  ui/                       shadcn/ui components (add via `bunx shadcn add`)
db/                         Database layer (Drizzle)
  __tests__/                Database layer tests
  index.ts                  Drizzle instance `db`, `getDialect()`, and `ping()` -- driver picked from DATABASE_URL
  migrate.ts                Migration runner (`bun run db:migrate`)
  schema/
    sqlite.ts               Schema for the SQLite dialect (default)
    postgres.ts             Schema for the PostgreSQL dialect
  migrations/
    sqlite/                 Generated SQL migrations (SQLite)
    postgres/               Generated SQL migrations (PostgreSQL)
lib/                        Shared utilities
  __tests__/                Utility tests (*.test.ts)
  api.ts                    API error responses, validation utilities (validateBody, validateSearchParams, validateParams)
  cache.ts                  Cache revalidation wrappers and Cache-Control header builder
  env.ts                    Zod environment validation (DATABASE_URL, LOG_LEVEL, SITE_URL, CORS_ORIGIN, RATE_LIMIT_RPM)
  fetcher.ts                Typed fetch wrapper for SWR and mutations
  logger.ts                 Pino structured logging (createLogger, getLogger, logger)
  security-headers.ts       Security headers (CSP, HSTS, etc.)
  sse.ts                    Server-side SSE stream utility (createSSEStream)
  utils.ts                  cn() helper for Tailwind class merging
test/
  preload.ts                `bun test` preload: happy-dom, jest-dom matchers, RTL cleanup
types/
  bun-test.d.ts             jest-dom matcher types for `bun:test`
data/                       Local SQLite database files (gitignored)
docs/                       Project documentation
prd/                        Product Requirements Documents
public/                     Static assets
.github/
  dependabot.yml            Dependabot config (GitHub Actions updates only)
  workflows/
    ci.yml                  GitHub Actions: typecheck, lint, test on PRs (SQLite + Postgres jobs)
.bun-version                Bun version pin (also `packageManager` in package.json)
bun.lock                    Bun lockfile (committed)
bunfig.toml                 Bun test runner config (preload)
drizzle.config.ts           drizzle-kit config (dialect from DATABASE_URL)
instrumentation.ts          Applies pending migrations at server start
middleware.ts                Next.js middleware (CORS, rate limiting, correlation IDs, request logging)
renovate.json               Renovate config (npm dependency auto-updates)
```

## Key Patterns

- **Server Components by default.** Only add `"use client"` when you need browser APIs, event handlers, or React hooks.
- **Drizzle instance** in `db/index.ts`. Import `db` from `@/db` -- do not create a second Drizzle instance.
- **Schema modules** are dialect-specific: `db/schema/sqlite.ts` and `db/schema/postgres.ts`. Keep the one your app uses, delete the other, and import tables from it. See `db/AGENTS.md`.
- **shadcn/ui components** go in `components/ui/`. Add them with `bunx shadcn add <component>`.
- **`cn()` utility** in `lib/utils.ts` for merging Tailwind classes. Use it in component className props.
- **Test files** are colocated in `__tests__/` directories as `*.test.tsx`. `bun test` registers happy-dom via `test/preload.ts`.
- **API error responses** use `@/lib/api`. Return `notFound()`, `badRequest()`, etc. -- never construct raw JSON error responses.
- **Request validation** uses `validateBody`, `validateSearchParams`, `validateParams` from `@/lib/api` with Zod schemas. Always validate before processing.
- **Middleware** in `middleware.ts` handles CORS, rate limiting, correlation IDs, and request logging for all `/api/*` routes automatically.
- **Correlation IDs** flow from `<Providers>` through SWR fetcher headers to middleware to structured logs. Use `useCorrelationId()` in client components when calling `mutationFetcher`.

## Data Fetching

Three complementary patterns for client-side data:

- **SWR** (`useSWR`) for standard client-side data fetching. Always available via `<Providers>` in the root layout.
- **SWR Mutation** (`useSWRMutation`) for create/update/delete operations. Uses `mutationFetcher` from `@/lib/fetcher`.
- **reactiveSWR** (`SSEProvider`) for real-time server-sent events. Opt-in per page or layout.

### Client-side fetching with SWR

Use `useSWR` in any client component. The global `fetcher` from `@/lib/fetcher` is pre-configured.

```tsx
"use client"
import useSWR from "swr"

export function UserProfile({ id }: { id: string }) {
  const { data, error, isLoading } = useSWR<User>(`/api/users/${id}`)
  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error loading user</div>
  return <div>{data.name}</div>
}
```

### Real-time SSE with reactiveSWR

1. **Create an SSE API route** using `createSSEStream` from `@/lib/sse`:

```typescript
import { createSSEStream } from "@/lib/sse"

export async function GET() {
  const { stream, writer, headers } = createSSEStream()
  // Send events (e.g., from a database subscription or interval)
  await writer.send("update", { count: 1 })
  await writer.close()
  return new Response(stream, { headers })
}
```

2. **Wrap a page or layout** with `SSEProvider` by passing `sseConfig` to `<Providers>`:

```tsx
"use client"
import { Providers } from "@/app/providers"
import type { SSEConfig } from "reactive-swr"

const sseConfig: SSEConfig = {
  url: "/api/events",
  events: {
    update: { key: "/api/data", update: "refetch" },
  },
}

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return <Providers sseConfig={sseConfig}>{children}</Providers>
}
```

3. **Use hooks** in child components: `useSSEStatus()` for connection state, `useSSEEvent()` for event listeners.

### Mutations with SWR

Use `useSWRMutation` with `mutationFetcher` for create, update, and delete operations. The `mutationFetcher` sends JSON, includes `Content-Type` headers, and throws with `error.status` and `error.body` (typed as `ApiErrorResponse`) on failure.

```tsx
"use client"
import useSWRMutation from "swr/mutation"
import { mutationFetcher } from "@/lib/fetcher"
import { useCorrelationId } from "@/app/providers"

interface CreateTodoInput {
  title: string
}

export function CreateTodoForm() {
  const correlationId = useCorrelationId()
  const { trigger, isMutating, error } = useSWRMutation(
    "/api/todos",
    mutationFetcher,
  )

  async function onSubmit(formData: FormData) {
    const title = formData.get("title") as string
    await trigger({
      method: "POST",
      body: { title },
      headers: { "X-Correlation-Id": correlationId },
    })
  }

  return (
    <form action={onSubmit}>
      <input name="title" required />
      <button type="submit" disabled={isMutating}>Add</button>
      {error && <p>{error.body?.message ?? "Something went wrong"}</p>}
    </form>
  )
}
```

To revalidate cached data after a mutation, call `mutate` from `useSWR` or use the `useSWRMutation` `onSuccess` callback:

```tsx
const { mutate } = useSWR("/api/todos")
const { trigger } = useSWRMutation("/api/todos", mutationFetcher, {
  onSuccess: () => mutate(), // refetch the list after creating
})
```

### Key files

| File | Purpose |
|------|---------|
| `lib/fetcher.ts` | `fetcher` for SWR reads (throws with `error.status`), `mutationFetcher` for SWR mutations (throws with `error.status` and `error.body` typed as `ApiErrorResponse`) |
| `lib/api.ts` | `apiError()`, `notFound()`, `badRequest()` etc. + `validateBody`, `validateSearchParams`, `validateParams` |
| `lib/cache.ts` | `revalidateByTag()`, `revalidatePath()`, `cacheHeaders()` for server-side cache control |
| `lib/sse.ts` | `createSSEStream()` -- returns `{ stream, writer, headers }` for SSE API routes |
| `app/providers.tsx` | `<Providers>` -- SWRConfig + SSEProvider + CorrelationIdContext. `useCorrelationId()` hook |
| `middleware.ts` | CORS, rate limiting, correlation IDs, request logging for all `/api/*` routes |
| `db/index.ts` | `db` (Drizzle instance), `getDialect()`, and `ping()` -- the only database entry point |

## API Layer

### Request Validation

All API route handlers validate input using Zod schemas and the validation helpers from `@/lib/api`. Each returns a discriminated union: `{ success: true, data: T }` or `{ success: false, response: Response }`.

```typescript
import { eq } from "drizzle-orm"
import { z } from "zod"
import { validateBody, validateSearchParams, validateParams, notFound } from "@/lib/api"
import { db } from "@/db"
import { todos } from "@/db/schema/sqlite"

// Validate JSON body (POST/PUT/PATCH)
const CreateTodoSchema = z.object({
  title: z.string().min(1).max(200),
  completed: z.boolean().optional(),
})

export async function POST(request: Request) {
  const result = await validateBody(request, CreateTodoSchema)
  if (!result.success) return result.response

  const [todo] = await db.insert(todos).values(result.data).returning()
  return Response.json(todo, { status: 201 })
}

// Validate search params (GET with query string)
const ListTodosSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
})

export async function GET(request: Request) {
  const result = validateSearchParams(request, ListTodosSchema)
  if (!result.success) return result.response

  const { page, limit } = result.data
  const rows = await db.select().from(todos).limit(limit).offset((page - 1) * limit)
  return Response.json(rows)
}

// Validate route params (dynamic segments)
const TodoParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = validateParams(await params, TodoParamsSchema)
  if (!result.success) return result.response

  const [todo] = await db.select().from(todos).where(eq(todos.id, result.data.id))
  if (!todo) return notFound("Todo not found")
  return Response.json(todo)
}
```

### Error Responses

All API errors follow a consistent shape:

```typescript
interface ApiErrorResponse {
  error: string        // Error code: "NOT_FOUND", "BAD_REQUEST", etc.
  message: string      // Human-readable message
  correlationId?: string
  details?: unknown    // Validation errors, additional context
}
```

Use the convenience factories from `@/lib/api` -- never construct raw JSON error responses:

| Function | Status | Default message |
|----------|--------|----------------|
| `notFound(message?)` | 404 | "Resource not found" |
| `badRequest(message?, details?)` | 400 | "Bad request" |
| `unauthorized(message?)` | 401 | "Unauthorized" |
| `forbidden(message?)` | 403 | "Forbidden" |
| `serverError(message?, correlationId?)` | 500 | "Internal server error" |
| `apiError(status, error, message, options?)` | any | (custom) |

Example API route with error handling:

```typescript
import { eq } from "drizzle-orm"
import { validateBody, notFound, serverError } from "@/lib/api"
import { db } from "@/db"
import { todos } from "@/db/schema/sqlite"
import { getLogger } from "@/lib/logger"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await validateBody(request, UpdateTodoSchema)
  if (!result.success) return result.response

  try {
    const [todo] = await db.update(todos).set(result.data).where(eq(todos.id, id)).returning()
    if (!todo) return notFound("Todo not found")
    return Response.json(todo)
  } catch (error) {
    const logger = getLogger()
    logger.error({ error, id }, "Failed to update todo")
    return serverError()
  }
}
```

### Middleware

`middleware.ts` runs automatically on all `/api/*` routes. It handles four concerns in order:

1. **CORS** -- Reads `CORS_ORIGIN` from env. If set, adds `Access-Control-Allow-Origin` and related headers. Handles `OPTIONS` preflight with 204. When origin is not `*`, sets `Access-Control-Allow-Credentials: true`.
2. **Rate limiting** -- In-memory fixed-window rate limiter. Reads `RATE_LIMIT_RPM` from env (default: 60 requests/minute/IP). Returns 429 with `Retry-After` header when exceeded. Use Redis for production distributed rate limiting.
3. **Correlation IDs** -- Reads `X-Correlation-Id` from request header or generates a UUID. Sets it on the response header. Available in logs for request tracing.
4. **Request logging** -- Logs method, path, status, duration, and correlationId via Pino structured logger.

No configuration needed beyond env vars. The middleware matcher is `/api/:path*` so it does not affect page routes. Next 16 deprecates the `middleware.ts` convention in favour of `proxy.ts`; the kit still uses `middleware.ts` (it works and prints a deprecation warning) and will move in a follow-up.

### Caching Strategy

Three layers of caching, used depending on the scenario:

| Layer | When to use | How |
|-------|-------------|-----|
| **HTTP Cache-Control** | Static or semi-static API responses (public data, config) | Set `Cache-Control` header using `cacheHeaders()` from `@/lib/cache` |
| **Next.js cache tags** | Server-side data that changes on writes | Use `next/cache` `unstable_cache` with tags, revalidate with `revalidateByTag(tag)` |
| **SWR client cache** | Client-side stale-while-revalidate | Automatic via SWR. Call `mutate()` after mutations to refetch |

```typescript
import { cacheHeaders } from "@/lib/cache"

// No caching (default for mutations, user-specific data)
export async function GET() {
  return Response.json(data, {
    headers: { "Cache-Control": cacheHeaders() }, // "no-store"
  })
}

// Cache for 5 minutes, serve stale for 1 minute while revalidating
export async function GET() {
  return Response.json(data, {
    headers: {
      "Cache-Control": cacheHeaders({ maxAge: 300, staleWhileRevalidate: 60, isPublic: true }),
    }, // "public, max-age=300, stale-while-revalidate=60"
  })
}
```

Revalidate server-side caches after mutations:

```typescript
import { revalidateByTag, revalidatePath } from "@/lib/cache"

// After creating/updating a todo:
revalidateByTag("todos")        // Revalidate all data tagged "todos"
revalidatePath("/api/todos")    // Revalidate a specific path
```

### Correlation IDs

Correlation IDs trace a request from the browser through the API to the logs.

**Flow:** `<Providers>` generates a stable UUID per session via `useRef` and passes it as `X-Correlation-Id` header to SWR's global fetcher. The middleware reads (or generates) the correlation ID and attaches it to response headers and structured log entries.

- **In client components**: Use `useCorrelationId()` from `@/app/providers` to get the current ID. Pass it manually when using `mutationFetcher`.
- **In API routes**: The correlation ID is available on the request header `X-Correlation-Id`. Pass it to `serverError(message, correlationId)` for error responses.
- **In logs**: Every middleware log entry includes `correlationId`. Use it to trace requests across services.

### Environment Variables

Validated at runtime by `lib/env.ts` using Zod. Access via `getEnv()` from `@/lib/env`.

| Variable | Type | Default | Purpose |
|----------|------|---------|---------|
| `DATABASE_URL` | string | `sqlite:./data/dev.sqlite` outside production; required in production | Database connection string. The scheme picks the driver: `sqlite:` (`@libsql/client`, embedded SQLite) or `postgres:` / `postgresql:` (the `postgres` driver). Any other scheme fails validation |
| `LOG_LEVEL` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Pino log level |
| `SITE_URL` | string | `"http://localhost:3000"` | Canonical URL for sitemap, robots.txt, Open Graph |
| `CORS_ORIGIN` | string | `""` (same-origin only) | Allowed CORS origin. Set to `"*"` for any origin or a specific URL like `"https://app.example.com"` |
| `RATE_LIMIT_RPM` | number | `60` | Max API requests per minute per IP |

## Testing

- Framework: `bun test` + React Testing Library + jest-dom matchers.
- Setup file: `test/preload.ts`, preloaded via `bunfig.toml`. It registers happy-dom, restores Bun's native `fetch`/`Response`/streams on top of it, adds the jest-dom matchers, and runs RTL `cleanup()` after each test.
- Test pattern: `**/*.test.{ts,tsx}`.
- Import `describe`, `it`, `expect`, `mock`, `spyOn`, and `jest` from `bun:test`. There are no test globals.
- Run `bun test` before committing. CI runs the same check.

### Mocking under `bun test`

- `mock.module()` is process-global and cannot be undone. Use it only for modules no other test needs real. Prefer `spyOn(namespace, "fn")` and call `mock.restore()` in `afterEach`.
- There is no `resetModules`. If a test needs fresh module state, give the module an explicit reset or factory (e.g. `createEnv(envObj)`) instead of re-importing it.
- Fake timers come from `jest.useFakeTimers()` / `jest.useRealTimers()`, imported from `bun:test`.

### Test quality principles

- **Test behavior, not mocks.** A test that mocks a function to return X, then asserts X was returned, proves nothing. Verify observable outcomes (HTTP status codes, rendered text, return values).
- **No tautological tests.** Do not assert that a mock was called -- that tests your test setup, not your code. Only assert on outputs the real consumer would observe.
- **One test per behavior.** If three tests verify the same thing with trivial variations, keep one and delete the rest.
- **Specific assertions.** Prefer `toHaveTextContent("Something went wrong")` over `toBeInTheDocument()`. Loose assertions pass when the code is broken.
- **No timing assertions.** Do not assert `duration < 10ms` or similar. Timing varies across machines and CI runners.

## Dependency Updates

Automated dependency updates use two tools:

- **Dependabot** (`.github/dependabot.yml`): GitHub Actions versions only. Weekly, grouped.
- **Renovate** (`renovate.json`): npm packages via the `bun` manager. Minor/patch auto-merge when CI passes. Major versions get individual PRs for review.

Drizzle (`drizzle-orm` + `drizzle-kit`), React, and testing packages are grouped (they must update together). The Bun version is managed manually via `.bun-version` and `packageManager` in `package.json`.

Do not add an `npm` ecosystem entry to `dependabot.yml` — Renovate handles all npm updates.

## What NOT to Do

- **Do not add ESLint or Prettier.** Biome replaces both.
- **Do not create Pages Router files** (no `pages/` directory). This project uses App Router only.
- **Do not add auth, billing, teams, or SaaS features.** This is a clean foundation.
- **Do not create a second Drizzle instance.** Import `db` from `@/db`.
- **Do not weaken TypeScript strict mode.** No `any`, no `@ts-ignore`, no `skipLibCheck` changes.
- **Do not install Jest or another test runner.** `bun test` is the test runner.
- **Do not hand-edit files in `db/migrations/`.** Change the schema and regenerate with `bun run db:generate`.
- **Do not bring back the old ORM or package manager.** Drizzle and Bun replaced them on purpose; the port is deliberate.
- **Do not use the docker-compose credentials in production.** The hardcoded `context_kit` user/password is for local development only. Use environment secrets for production databases.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
