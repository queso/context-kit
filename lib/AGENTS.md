# lib/ -- Shared Utilities and Patterns

This directory contains shared code used across the application.

## Key Files

- `utils.ts` -- Contains the `cn()` function for merging Tailwind CSS classes (uses clsx + tailwind-merge).
- The database layer lives in `db/`, not here. Always import `db` from `@/db` instead of creating a second Drizzle instance; see `db/AGENTS.md` for the schema and migration workflow.

## Conventions

- Keep functions pure where possible. Side effects should be explicit and documented.
- Use the `@/lib/` path alias for imports.
- shadcn/ui expects utilities at `@/lib/utils` -- do not move the `cn()` function.
- New shared helpers and utility functions go in this directory.
