# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Standardized API error responses (`lib/api.ts`). `apiError()` helper produces consistent JSON responses with `{ error, message, correlationId?, details? }` shape. Convenience factories: `notFound()`, `badRequest()`, `unauthorized()`, `forbidden()`, `serverError()`. Exported `ApiErrorResponse` type for frontend consumption.
- API request validation utilities (`lib/api.ts`). `validateBody()`, `validateSearchParams()`, and `validateParams()` parse and validate inputs with Zod schemas, returning typed data on success or a standardized 400 error response on failure. Handles malformed JSON and empty bodies gracefully.
- Mutation fetcher for SWR (`lib/fetcher.ts`). `mutationFetcher()` wraps `fetch` for POST/PUT/PATCH/DELETE requests, throwing structured errors with status and parsed `ApiErrorResponse` body. Works with `useSWRMutation` for form submissions and data writes.
- Cache and revalidation utilities (`lib/cache.ts`). `revalidateByTag()` and `revalidatePath()` wrap Next.js cache invalidation with structured logging. `cacheHeaders()` builds `Cache-Control` header strings with a safe `no-store` default.
- Next.js middleware for API routes (`middleware.ts`). Handles CORS (configurable origin via `CORS_ORIGIN` env var), in-memory rate limiting (configurable via `RATE_LIMIT_RPM`), correlation ID propagation (`X-Correlation-Id` header), and structured request logging. Scoped to `/api/:path*` only.
- Client-side correlation ID (`app/providers.tsx`). `Providers` generates a stable `crypto.randomUUID()` on mount, injects it into all SWR fetcher requests via `X-Correlation-Id` header. `useCorrelationId()` hook exposes the ID for mutation fetchers and downstream service calls.
- `CORS_ORIGIN` and `RATE_LIMIT_RPM` environment variables (`lib/env.ts`, `.env.example`). CORS defaults to same-origin (empty string), rate limit defaults to 60 requests per minute per IP.
- CLAUDE.md updated with full API layer patterns documentation covering error responses, request validation, mutations, middleware, caching strategy, and correlation IDs.

### Previously added

- Zod-based environment validation (`lib/env.ts`) with `createEnv()` and `getEnv()` helpers. Validates `DATABASE_URL`, `LOG_LEVEL`, and `SITE_URL` at startup with clear error messages for missing or invalid variables.
- Structured logging with pino (`lib/logger.ts`). Includes `createLogger()` factory for custom instances and `getLogger()` singleton for application-wide use. Uses pino-pretty in development, JSON output in production. Log level controlled via `LOG_LEVEL` env var.
- Security headers applied to all routes via `next.config.ts`. Includes Content-Security-Policy (with `unsafe-eval` in dev only), Strict-Transport-Security (HSTS with preload), X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, and Permissions-Policy.
- SEO baseline: dynamic `sitemap.xml` (`app/sitemap.ts`), `robots.txt` (`app/robots.ts`), and Open Graph metadata in root layout. All driven by `SITE_URL` env var with `metadataBase` and title template support.
- Error boundaries: `app/error.tsx` (client-side error recovery with "Try again" button), `app/not-found.tsx` (custom 404 page), and `app/loading.tsx` (spinner for Suspense fallback). All styled with Tailwind and dark mode support.
- Health check endpoint at `GET /api/health` (`app/api/health/route.ts`). Returns database connectivity status, latency in milliseconds, and timestamps. Includes a 5-second timeout to prevent hanging on unresponsive databases.
- shadcn/ui Button component (`components/ui/button.tsx`) used by error boundary pages.
- `LOG_LEVEL` and `SITE_URL` environment variables added to `.env.example` with documentation comments.
