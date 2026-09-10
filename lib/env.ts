import { z } from "zod"
import { DEFAULT_SQLITE_URL, hasSupportedScheme, UNSUPPORTED_SCHEME_MESSAGE } from "@/db/url"

export { parseDatabaseUrl } from "@/db/url"

const databaseUrlSchema = z
  .string()
  .refine(hasSupportedScheme, { error: UNSUPPORTED_SCHEME_MESSAGE })

function buildEnvSchema(isProduction: boolean) {
  return z.object({
    // Required in production; outside production a local SQLite file keeps setup to zero steps.
    DATABASE_URL: isProduction ? databaseUrlSchema : databaseUrlSchema.default(DEFAULT_SQLITE_URL),
    LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),
    SITE_URL: z.string().default("http://localhost:3000"),
    CORS_ORIGIN: z.string().default(""),
    RATE_LIMIT_RPM: z.coerce.number().int().positive().default(60),
  })
}

type Env = z.infer<ReturnType<typeof buildEnvSchema>>

/**
 * Validates an environment object. `NODE_ENV` is read from the object itself (not from
 * `process.env`) so callers and tests get deterministic production/non-production rules.
 */
export function createEnv(
  envObj: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): Env {
  const result = buildEnvSchema(envObj.NODE_ENV === "production").safeParse(envObj)

  if (!result.success) {
    const invalidVars = result.error.issues.map((issue) => {
      const path = issue.path.join(".")
      return `  ${path}: ${issue.message}`
    })

    throw new Error(`Invalid environment variables:\n${invalidVars.join("\n")}`)
  }

  return result.data
}

let _env: Env | undefined

export function getEnv(): Env {
  if (!_env) _env = createEnv()
  return _env
}
