# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/).

## [Unreleased]

### Added

- Zod-based environment validation (`lib/env.ts`) with `createEnv()` and `getEnv()` helpers. Validates `DATABASE_URL`, `LOG_LEVEL`, and `SITE_URL` at startup with clear error messages for missing or invalid variables.
- Structured logging with pino (`lib/logger.ts`). Includes `createLogger()` factory for custom instances and `getLogger()` singleton for application-wide use. Uses pino-pretty in development, JSON output in production. Log level controlled via `LOG_LEVEL` env var.
- Security headers applied to all routes via `next.config.ts`. Includes Content-Security-Policy (with `unsafe-eval` in dev only), Strict-Transport-Security (HSTS with preload), X-Frame-Options (DENY), X-Content-Type-Options (nosniff), Referrer-Policy, and Permissions-Policy.
- SEO baseline: dynamic `sitemap.xml` (`app/sitemap.ts`), `robots.txt` (`app/robots.ts`), and Open Graph metadata in root layout. All driven by `SITE_URL` env var with `metadataBase` and title template support.
- Error boundaries: `app/error.tsx` (client-side error recovery with "Try again" button), `app/not-found.tsx` (custom 404 page), and `app/loading.tsx` (spinner for Suspense fallback). All styled with Tailwind and dark mode support.
- Health check endpoint at `GET /api/health` (`app/api/health/route.ts`). Returns database connectivity status, latency in milliseconds, and timestamps. Includes a 5-second timeout to prevent hanging on unresponsive databases.
- shadcn/ui Button component (`components/ui/button.tsx`) used by error boundary pages.
- `LOG_LEVEL` and `SITE_URL` environment variables added to `.env.example` with documentation comments.
