// Runs once when the Next.js server starts. Applies pending database migrations so a fresh
// deploy (or a fresh SQLite file) is ready before the first request. The Node-only work lives
// in db/migrate.ts behind a dynamic import so the Edge bundle never sees process.exit.
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return

  const { runMigrationsOrExit } = await import("@/db/migrate")
  await runMigrationsOrExit()
}
