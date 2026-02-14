import { NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { logger } from "@/lib/logger"

const TIMEOUT_MS = 5_000

export async function GET() {
  const timestamp = new Date().toISOString()
  const start = Date.now()

  try {
    await Promise.race([
      prisma.$queryRaw`SELECT 1`,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("Database health check timed out")), TIMEOUT_MS),
      ),
    ])

    const latency = Date.now() - start
    logger.info({ latency }, "Health check passed")

    return NextResponse.json({ status: "healthy", database: "connected", latency, timestamp })
  } catch (error) {
    const latency = Date.now() - start
    const message = error instanceof Error ? error.message : "Unknown error"
    logger.error({ error: message, latency }, "Health check failed")

    return NextResponse.json(
      { status: "unhealthy", database: "disconnected", error: message, latency, timestamp },
      { status: 503 },
    )
  }
}
