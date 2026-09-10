# PRD-0002: API Layer Patterns

**Author:** Josh Owens
**Date:** 2026-02-14
**Status:** Draft

## Problem Statement

context-kit now has data fetching (SWR for reads, reactiveSWR for real-time SSE) but no patterns for the other half of building an app: validating incoming requests, writing data back, protecting routes, and managing cache freshness. A developer who clones the template and tries to build their first API endpoint has to figure out request validation, error response shapes, mutation patterns, middleware, and caching strategy from scratch — all problems that have well-known solutions but require significant boilerplate to wire up correctly in Next.js App Router.

Without these patterns baked in, every team (and every AI agent) building on context-kit will invent their own conventions, leading to inconsistent APIs, duplicated validation logic, and missed caching opportunities.

## Business Context

context-kit's promise is "start building your product, not your infrastructure." PRD-0001 delivered the foundation (error handling, logging, security headers, env validation). The recent data fetching work added SWR and SSE for reads. But reads without writes, validation, and middleware is only half an API layer — developers still can't build a real feature end-to-end without inventing patterns.

This is the difference between a template that demos well and one that actually accelerates production development. The API layer patterns are the connective tissue between the database (Prisma) and the UI (SWR) — without them, developers fall into the gap.

## Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Any API route validates inputs consistently | All API routes use a shared validation pattern | Validation utility ships with template, documented in CLAUDE.md |
| Error responses have a predictable shape | All API errors follow a single format | One error response helper used across all routes |
| Mutations are wired end-to-end | SWR mutation pattern documented and working | `useSWRMutation` example with cache revalidation ships with template |
| Middleware handles cross-cutting API concerns | Middleware file exists with extensible patterns | CORS, request logging, and rate limiting patterns ship |
| Caching strategy is clear | Developers know when to use which caching layer | CLAUDE.md documents when to use Next.js cache vs. SWR vs. no-cache |

## User Stories

- **As a developer** building an API endpoint, **I want** a standard way to validate request bodies and params **so that** I don't write ad-hoc parsing logic in every route.
- **As a developer** handling API errors, **I want** a consistent error response format **so that** my frontend can reliably parse and display errors.
- **As a developer** building a form, **I want** a mutation pattern that writes data and updates the UI **so that** I don't have to manually manage cache invalidation.
- **As a developer** deploying to production, **I want** CORS and rate limiting configured **so that** my API isn't wide open from day one.
- **As a developer** adding a new feature, **I want** clear guidance on caching **so that** I know whether to use Next.js caching, SWR's deduplication, or skip caching entirely.
- **As an AI agent** building features on context-kit, **I want** established patterns for API routes and mutations **so that** I produce consistent, idiomatic code without guessing at conventions.

## Scope

### In Scope

1. **API request validation** — A utility that validates request bodies/params with Zod and returns typed data or a standardized error response. Zod is already a dependency.
2. **Standardized API error responses** — A helper that produces consistent JSON error responses with status code, error type, and message. Used by the validation utility and available for manual use.
3. **SWR mutations** — Set up `useSWRMutation` pattern with the existing `fetcher` and `Providers` infrastructure. Document how to wire a form submission to an API route with automatic cache revalidation.
4. **Middleware** — `middleware.ts` at the project root with CORS configuration, basic rate limiting (in-memory for dev, documenting Redis-based for production), and request logging using the existing Pino logger.
5. **Caching and revalidation guidance** — Document the caching layers available (Next.js `unstable_cache`/route segment config, SWR client-side cache, HTTP cache headers) and when to use each. Add revalidation helpers that work with both SWR and Next.js caching.

### Out of Scope

- **Authentication/authorization middleware** — context-kit intentionally has no auth. Middleware patterns shall be extensible so auth can be added, but no auth logic ships.
- **Database-level caching (Redis, Memcached)** — The template uses Postgres only. Redis-based patterns can be documented as "next steps" but not implemented.
- **GraphQL or tRPC** — context-kit uses REST-style API routes. Alternative API patterns are out of scope.
- **File upload handling** — Separate concern with its own validation and streaming needs.
- **Webhook handling** — Inbound webhook verification is specialized and vendor-specific.

## Requirements

### Functional Requirements

#### API Request Validation

1. A `validateRequest` utility in `lib/api.ts` shall accept a Zod schema and a `Request` object, and return either the validated+typed data or an error `Response`.
2. The utility shall support validating JSON bodies, URL search params, and route params.
3. On validation failure, the utility shall return a 400 response using the standardized error format (see requirement 6) with Zod's raw error issues (`ZodError.issues`) in the `details` field.
4. The utility shall handle malformed JSON bodies gracefully (return 400, not 500).

#### Standardized API Error Responses

5. An `apiError` helper in `lib/api.ts` shall create JSON `Response` objects with a consistent shape: `{ error: string, message: string, correlationId?: string, details?: unknown }`.
6. The error response shape shall be exported as a TypeScript type (`ApiErrorResponse`) for frontend consumption.
7. The `apiError` helper shall accept a status code, error type string, human-readable message, and optional correlation ID and details object.
8. Common error factories shall be provided: `notFound()`, `badRequest()`, `unauthorized()`, `forbidden()`, `serverError()`.

#### SWR Mutations

9. A `mutationFetcher` utility in `lib/fetcher.ts` shall wrap `fetch` for POST/PUT/PATCH/DELETE requests, throwing on non-OK responses with the parsed error body.
10. The `Providers` component shall remain unchanged — `useSWRMutation` works with the existing SWR context.
11. CLAUDE.md shall document the pattern for wiring `useSWRMutation` with an API route, including optimistic updates and error handling.

#### Middleware

12. `middleware.ts` at the project root shall export a middleware function that runs on API routes (`/api/:path*`).
13. The middleware shall set CORS headers (`Access-Control-Allow-Origin`, `Access-Control-Allow-Methods`, `Access-Control-Allow-Headers`) configurable via environment variables, defaulting to same-origin only.
14. The middleware shall handle preflight `OPTIONS` requests by returning 204 with CORS headers.
15. The middleware shall implement basic rate limiting using an in-memory fixed-window store, configurable via `RATE_LIMIT_RPM` environment variable (requests per minute per IP), defaulting to 60.
16. The middleware shall read a correlation ID from the `X-Correlation-Id` request header. If not present, it shall generate one (`crypto.randomUUID()`) and return it in the `X-Correlation-Id` response header so the client can reuse it for subsequent requests.
17. The middleware shall include the correlation ID in the logger context for every request.
18. The middleware shall log each API request using the structured logger with method, path, status, duration, and correlation ID.
19. The middleware shall use a `matcher` config to avoid running on static assets and Next.js internals.

#### Caching & Revalidation

20. CLAUDE.md shall document the three caching layers and when to use each: Next.js route segment caching (server-side, for expensive queries), SWR client-side cache (for UI responsiveness and deduplication), and HTTP cache headers (for CDN/browser caching).
21. A `revalidate` utility in `lib/cache.ts` shall wrap Next.js `revalidateTag` and `revalidatePath` with logging, so cache invalidation is observable.
22. API routes that return cacheable data shall document how to set appropriate `Cache-Control` headers using a helper.
23. The SSE integration from the data fetching work shall be documented as the real-time cache invalidation path (SSE event triggers SWR refetch).

#### Client-Side Correlation

24. The `Providers` component shall generate a correlation ID once on mount (`crypto.randomUUID()`) and configure SWR's global fetcher to send it as an `X-Correlation-Id` header on every request.
25. The `mutationFetcher` utility shall also include the correlation ID header.
26. The correlation ID shall be passable to downstream services (e.g., Temporal workflows, external APIs) to enable end-to-end tracing across system boundaries.

### Non-Functional Requirements

27. Rate limiting shall have negligible latency impact (<1ms per request for the in-memory store check).
28. The validation utility shall not add dependencies beyond Zod (already installed).
29. Middleware shall not run on page routes or static assets — only API routes — to avoid impacting page load performance.
30. All new utilities shall have corresponding tests.
31. All new code shall pass `pnpm validate` (typecheck + biome + vitest).

## Edge Cases & Error States

- **Validation of nested objects**: Zod handles this natively, but error messages for nested fields need to include the full path (e.g., `address.zipCode` not just `zipCode`).
- **Rate limiting behind a reverse proxy**: The rate limiter shall use `X-Forwarded-For` when available, falling back to the request IP. Document that in-memory rate limiting resets on restart and doesn't work across multiple instances.
- **CORS with credentials**: If `Access-Control-Allow-Origin` is set to a specific origin (not `*`), the middleware shall include `Access-Control-Allow-Credentials: true`. Document this interaction.
- **Large request bodies**: The validation utility shall not buffer the entire body in memory for streaming routes. For the default JSON body case, Next.js already handles body size limits.
- **Middleware and SSE routes**: SSE responses are long-lived streams. Middleware shall not interfere with SSE connections — ensure CORS headers are set but rate limiting counts only the initial connection, not the stream.
- **Cache invalidation race conditions**: When a mutation and revalidation happen simultaneously, SWR's built-in deduplication handles this. Document that `mutate()` with `revalidate: true` is the safe default.
- **Empty request bodies**: `validateRequest` with a body schema on a request with no body shall return a 400 with "Request body is required", not a JSON parse error.

## Dependencies

- **Zod**: Already a direct dependency. Used for request validation schemas.
- **SWR**: Already installed. `useSWRMutation` is part of the `swr` package.
- **Pino logger**: Already in `lib/logger.ts`. Used for middleware request logging.
- **Next.js middleware API**: Built into Next.js 16. No additional packages.
- **Next.js caching APIs**: `revalidateTag`, `revalidatePath` are built into `next/cache`.

## Risks & Open Questions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| In-memory rate limiting is too naive for production | High | Users deploy without realizing it resets on restart | Document clearly that this is dev-only; provide Redis pattern in comments |
| Middleware adds latency to every API request | Low | Perceptible slowdown on fast endpoints | Keep middleware logic minimal; benchmark in tests |
| Too many caching layers confuse developers | Medium | Developers cache incorrectly or not at all | Clear decision tree in CLAUDE.md: "Use X when Y" |
| CORS defaults too restrictive for SPAs on different domains | Medium | Users confused by blocked requests | Default to same-origin; document how to open up |

### Decisions

- **Rate limiter window**: Fixed window. Simpler to implement and reason about; sufficient for the starter's needs.
- **Correlation ID, not request ID**: Use a single correlation ID that spans the entire client session. Client generates it on mount, sends it via `X-Correlation-Id` header on every request. Middleware reads it (or generates one if missing) and includes it in logs and error responses. No per-request ID — correlation ID plus timestamp/method/path is sufficient to identify individual requests within a session. The correlation ID also flows to downstream services (Temporal, external APIs) for end-to-end tracing.
- **Validation error format**: Expose Zod's raw error format (`ZodError.issues`). More useful for development and frontend consumption. Users can wrap or filter the output later if they need to hide schema details in production.
