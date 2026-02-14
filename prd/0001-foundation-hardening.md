# PRD-0001: Foundation Hardening

**Author:** Josh Owens
**Date:** 2026-02-12
**Status:** Draft

## Problem Statement

context-kit is a starter template that people clone and build SaaS products on top of. Today, every project forked from context-kit immediately needs to add the same boilerplate: error boundary pages, environment variable validation, security headers, SEO metadata, a health check endpoint, and structured logging. These are universally needed, tedious to set up, and easy to get wrong — especially security headers and env validation, where mistakes are silent until production.

Developers cloning the template waste their first day on plumbing instead of building their product. Worse, some skip these entirely and ship with missing error pages, no CSP headers, and console.log-based logging.

## Business Context

context-kit's value proposition is "start building your product immediately, not your infrastructure." Every missing foundation piece undermines that promise. If a developer clones the template and immediately has to Google "Next.js error.tsx" or "Content Security Policy headers Next.js," the template failed at its job.

This is also a trust signal for adoption. Developers evaluating starter templates look for production-readiness. Missing error pages, no security headers, and no structured logging signal "hobby project," not "serious foundation."

## Goals & Success Metrics

| Goal | Metric | Target |
|------|--------|--------|
| Zero boilerplate needed for error handling | Error boundary files present out of the box | error.tsx, not-found.tsx, loading.tsx all ship with template |
| Environment misconfiguration caught at startup | App fails fast with clear message on missing env vars | 100% of required env vars validated before app starts |
| Security headers on every response | Headers present on all routes | CSP, HSTS, X-Frame-Options, X-Content-Type-Options all set |
| SEO-ready out of the box | Metadata, sitemap, robots present | All three ship with template, customizable via config |
| Health check available for infrastructure | /api/health returns DB status | Endpoint responds with 200/503 and DB connectivity status |
| Structured logging from day one | All server-side logs are JSON | No console.log in shipped template code |

## User Stories

- **As a developer** cloning context-kit, **I want** error pages to already exist **so that** my users never see a raw Next.js error screen.
- **As a developer** deploying to production, **I want** the app to fail immediately if DATABASE_URL is missing **so that** I catch config issues in deploy, not at 2am from a user report.
- **As a developer** running a security audit, **I want** security headers on every response **so that** I pass baseline checks without manual configuration.
- **As a developer** launching a product, **I want** sitemap.xml and robots.txt to just work **so that** search engines can index my site from day one.
- **As a DevOps engineer** setting up monitoring, **I want** a health check endpoint **so that** load balancers and uptime monitors have something to hit.
- **As a developer** debugging production issues, **I want** structured JSON logs **so that** I can search and filter in any log aggregation tool.

## Scope

### In Scope

1. **Error boundaries** — `error.tsx`, `not-found.tsx`, and `loading.tsx` in the app directory with clean, branded UI using existing shadcn/ui components
2. **Environment validation** — Zod schema that validates all required environment variables at startup, with clear error messages naming exactly which vars are missing or malformed
3. **Security headers** — CSP, HSTS, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, and Permissions-Policy configured in `next.config.ts`
4. **SEO baseline** — Root layout metadata with sensible defaults, `app/sitemap.ts`, `app/robots.ts`, Open Graph image support
5. **Health check endpoint** — `app/api/health/route.ts` that checks database connectivity and returns structured JSON
6. **Structured logging** — A logging utility in `lib/logger.ts` with JSON output, log levels, and request context

### Out of Scope

- **Custom error tracking integration** (Sentry, Bugsnag) — belongs in `@context-kit/error-tracking` package
- **Application Performance Monitoring** — separate concern, vendor-specific
- **Rate limiting** — belongs in `@context-kit/rate-limit` package
- **Authentication/authorization** — belongs in `@context-kit/auth` package
- **Custom 500 error pages per route** — the root error.tsx is sufficient for a starter
- **Log aggregation/shipping** — the template produces structured logs; where they go is the deployer's choice

## Requirements

### Functional Requirements

#### Error Boundaries

1. `app/error.tsx` shall render a user-friendly error page with a "Try again" button that calls `reset()`.
2. `app/not-found.tsx` shall render a branded 404 page with a link back to the home page.
3. `app/loading.tsx` shall render a loading skeleton or spinner.
4. Error boundary pages shall use existing shadcn/ui components and match the template's visual style.

#### Environment Validation

5. The app shall validate all required environment variables at build/startup time using a Zod schema.
6. If any required variable is missing or malformed, the app shall throw an error with a message listing every invalid variable and what's expected.
7. The validation schema shall live in `lib/env.ts` and export typed environment values for use throughout the app.
8. Required variables for the base template shall include: `DATABASE_URL`.
9. The validation shall run in both development and production environments.

#### Security Headers

10. All responses shall include a `Content-Security-Policy` header with a restrictive default policy.
11. All responses shall include `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload`.
12. All responses shall include `X-Frame-Options: DENY`.
13. All responses shall include `X-Content-Type-Options: nosniff`.
14. All responses shall include `Referrer-Policy: strict-origin-when-cross-origin`.
15. All responses shall include a `Permissions-Policy` header disabling unused browser features (camera, microphone, geolocation).
16. Security headers shall be configured in `next.config.ts` via the `headers()` function.

#### SEO Baseline

17. The root layout shall export a `metadata` object with configurable `title`, `description`, and Open Graph properties.
18. `app/sitemap.ts` shall export a dynamic sitemap function that returns at minimum the home page URL.
19. `app/robots.ts` shall export a robots configuration that allows all crawlers by default and references the sitemap.
20. Metadata defaults shall be easily overridable per-page using Next.js metadata conventions.

#### Health Check

21. `GET /api/health` shall return HTTP 200 with `{"status": "healthy", "database": "connected"}` when the database is reachable.
22. `GET /api/health` shall return HTTP 503 with `{"status": "unhealthy", "database": "disconnected"}` when the database is unreachable.
23. The health check shall include a response time measurement for the database query.
24. The health check shall not require authentication.

#### Structured Logging

25. `lib/logger.ts` shall export a logger with `debug`, `info`, `warn`, and `error` methods.
26. All log output shall be JSON-formatted with at minimum: `timestamp`, `level`, `message`.
27. The logger shall support additional context fields (e.g., `requestId`, `userId`).
28. The log level shall be configurable via a `LOG_LEVEL` environment variable, defaulting to `info`.
29. Existing `console.log` calls in template code shall be replaced with the structured logger.

### Non-Functional Requirements

30. Environment validation shall add zero runtime overhead after startup (validate once, cache result).
31. Security headers shall not break existing shadcn/ui components or Tailwind CSS functionality.
32. The logging utility shall use `pino` for structured JSON logging.
33. All new files shall have corresponding tests where applicable (env validation, health check, logger).
34. All new code shall pass `pnpm validate` (typecheck + biome + vitest).

## Edge Cases & Error States

- **Environment validation in edge runtime**: Next.js middleware runs in edge runtime where `process.env` behaves differently. Env validation shall handle this gracefully or explicitly document that it runs at Node.js startup only.
- **CSP blocking inline styles**: Tailwind CSS and shadcn/ui may use inline styles. The CSP policy shall accommodate this (e.g., `'unsafe-inline'` for styles, or nonce-based if feasible).
- **Health check during cold start**: The first request to `/api/health` may hit before the database connection pool is warm. The endpoint shall handle connection timeouts gracefully with a 503 rather than hanging.
- **Missing optional env vars**: The validation shall distinguish between required vars (fail hard) and optional vars (warn in logs, use defaults).
- **Sitemap with no pages**: The base template only has a home page. The sitemap shall work with just one entry and be easy to extend.

## Dependencies

- **Zod**: Already used by shadcn/ui components, available in the dependency tree. Confirm it's a direct dependency or add it.
- **Prisma client**: Health check needs the Prisma singleton from `lib/db.ts`. No new dependencies.
- **Next.js metadata API**: Built into Next.js 16. No additional packages.

## Risks & Open Questions

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| CSP breaks third-party scripts users add later | Medium | Users confused by blocked scripts | Document how to extend CSP; start with a policy that's strict but not locked down |
| Env validation is too strict for some deployments | Low | Users have to modify validation immediately | Make schema easy to extend; document how to add/remove required vars |
| Logging library choice doesn't scale | Medium | Users replace it immediately | Keep it minimal; if it's just a thin wrapper around structured console output, it's easy to swap for pino later |

### Decisions

- **Logging**: Use `pino`. It's the standard, fast, and worth the dependency.
- **CSP**: Use `'unsafe-inline'` for styles. Pragmatic for a starter; users can tighten to nonce-based later.
- **Env validation**: Plain Zod schema in `lib/env.ts`. Fewer dependencies, fully transparent, easy to extend.
