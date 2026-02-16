# context-kit

An opinionated Next.js starter built for AI-assisted development. Clean architecture, modern tooling, and an intent layer (CLAUDE.md + AGENTS.md) so AI coding tools understand the project from the first commit.

This is a foundation, not a SaaS boilerplate. There is no auth, no billing, no example pages to delete.

## Stack

Next.js 16 with App Router, React 19, TypeScript in strict mode, Tailwind CSS v4, shadcn/ui (New York style, lucide icons), Biome for linting and formatting, Vitest with React Testing Library for tests, Prisma ORM with PostgreSQL, SWR for client-side data fetching, reactiveSWR for real-time SSE, pnpm for package management, Docker Compose for local dev, GitHub Actions for CI.

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
pnpm db:generate
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
  ui/                       shadcn/ui components (add via `pnpm dlx shadcn add`)
lib/                        Shared utilities
  __tests__/                Utility tests (*.test.ts)
  db.ts                     Prisma client singleton
  api.ts                    API error responses, validation utilities (validateBody, validateSearchParams, validateParams)
  cache.ts                  Cache revalidation wrappers and Cache-Control header builder
  env.ts                    Zod environment validation (DATABASE_URL, LOG_LEVEL, SITE_URL, CORS_ORIGIN, RATE_LIMIT_RPM)
  fetcher.ts                Typed fetch wrapper for SWR and mutations
  logger.ts                 Pino structured logging (createLogger, getLogger, logger)
  security-headers.ts       Security headers (CSP, HSTS, etc.)
  sse.ts                    Server-side SSE stream utility (createSSEStream)
  utils.ts                  cn() helper for Tailwind class merging
  generated/                Prisma generated client (gitignored)
types/
  reactive-swr.d.ts         Type declarations for reactive-swr (installed from GitHub)
prisma/
  schema.prisma             Database schema (source of truth)
  migrations/               Migration files (gitignored until committed)
docs/                       Project documentation
prd/                        Product Requirements Documents
public/                     Static assets
.github/
  dependabot.yml            Dependabot config (GitHub Actions updates only)
  workflows/
    ci.yml                  GitHub Actions: typecheck, lint, test on PRs
middleware.ts                Next.js middleware (CORS, rate limiting, correlation IDs, request logging)
renovate.json               Renovate config (npm dependency auto-updates)
```

## Key Patterns

- **Server Components by default.** Only add `"use client"` when you need browser APIs, event handlers, or React hooks.
- **Prisma singleton** in `lib/db.ts`. Import `prisma` from `@/lib/db` -- do not create new PrismaClient instances.
- **Prisma client output** goes to `lib/generated/prisma`. Import types from `@/lib/generated/prisma/client`.
- **shadcn/ui components** go in `components/ui/`. Add them with `pnpm dlx shadcn add <component>`.
- **`cn()` utility** in `lib/utils.ts` for merging Tailwind classes. Use it in component className props.
- **Test files** are colocated in `__tests__/` directories as `*.test.tsx`. Vitest uses jsdom environment with globals enabled.
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
| `types/reactive-swr.d.ts` | Type declarations for the reactive-swr package |

## API Layer

### Request Validation

All API route handlers validate input using Zod schemas and the validation helpers from `@/lib/api`. Each returns a discriminated union: `{ success: true, data: T }` or `{ success: false, response: Response }`.

```typescript
import { z } from "zod"
import { validateBody, validateSearchParams, validateParams, notFound } from "@/lib/api"
import { prisma } from "@/lib/db"

// Validate JSON body (POST/PUT/PATCH)
const CreateTodoSchema = z.object({
  title: z.string().min(1).max(200),
  completed: z.boolean().optional(),
})

export async function POST(request: Request) {
  const result = await validateBody(request, CreateTodoSchema)
  if (!result.success) return result.response

  const todo = await prisma.todo.create({ data: result.data })
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
  const todos = await prisma.todo.findMany({ skip: (page - 1) * limit, take: limit })
  return Response.json(todos)
}

// Validate route params (dynamic segments)
const TodoParamsSchema = z.object({
  id: z.string().uuid(),
})

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const result = validateParams(await params, TodoParamsSchema)
  if (!result.success) return result.response

  const todo = await prisma.todo.findUnique({ where: { id: result.data.id } })
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
import { validateBody, notFound, serverError } from "@/lib/api"
import { prisma } from "@/lib/db"
import { getLogger } from "@/lib/logger"

export async function PATCH(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params
  const result = await validateBody(request, UpdateTodoSchema)
  if (!result.success) return result.response

  try {
    const todo = await prisma.todo.update({ where: { id }, data: result.data })
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

No configuration needed beyond env vars. The middleware matcher is `/api/:path*` so it does not affect page routes.

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
| `DATABASE_URL` | string | (required) | PostgreSQL connection string |
| `LOG_LEVEL` | `"debug" \| "info" \| "warn" \| "error"` | `"info"` | Pino log level |
| `SITE_URL` | string | `"http://localhost:3000"` | Canonical URL for sitemap, robots.txt, Open Graph |
| `CORS_ORIGIN` | string | `""` (same-origin only) | Allowed CORS origin. Set to `"*"` for any origin or a specific URL like `"https://app.example.com"` |
| `RATE_LIMIT_RPM` | number | `60` | Max API requests per minute per IP |

## Testing

- Framework: Vitest + React Testing Library + jest-dom matchers.
- Setup file: `vitest.setup.ts` (imports jest-dom matchers).
- Test pattern: `**/*.test.{ts,tsx}`.
- Vitest globals are enabled -- `describe`, `it`, `expect` are available without imports, though explicit imports from `vitest` are fine too.
- Run `pnpm test` before committing. CI runs the same check.

### Test quality principles

- **Test behavior, not mocks.** A test that mocks a function to return X, then asserts X was returned, proves nothing. Verify observable outcomes (HTTP status codes, rendered text, return values).
- **No tautological tests.** Do not assert that a mock was called -- that tests your test setup, not your code. Only assert on outputs the real consumer would observe.
- **One test per behavior.** If three tests verify the same thing with trivial variations, keep one and delete the rest.
- **Specific assertions.** Prefer `toHaveTextContent("Something went wrong")` over `toBeInTheDocument()`. Loose assertions pass when the code is broken.
- **No timing assertions.** Do not assert `duration < 10ms` or similar. Timing varies across machines and CI runners.

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
