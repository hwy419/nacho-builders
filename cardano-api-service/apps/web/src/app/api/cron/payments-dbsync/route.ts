/**
 * DB-Sync Payment Monitor Cron Endpoint
 *
 * Fast payment monitoring using DB-Sync PostgreSQL queries (~175ms per query).
 * Should be called every 2 seconds for responsive payment detection.
 *
 * Security:
 * - Protected by CRON_SECRET environment variable
 */

import { NextRequest, NextResponse } from "next/server"
import {
  monitorPendingPaymentsDBSync,
  expireOldPaymentsDBSync,
  getPaymentStatsDBSync,
} from "@/lib/jobs/payment-monitor-dbsync"
import { isDBSyncHealthy } from "@/lib/cardano/dbsync"

// Verify cron secret to prevent unauthorized access
function verifyCronAuth(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET

  // If no secret is configured, allow in development only
  if (!cronSecret) {
    return process.env.NODE_ENV === "development"
  }

  // Check authorization header
  const authHeader = request.headers.get("authorization")
  if (authHeader === `Bearer ${cronSecret}`) {
    return true
  }

  // Also check query parameter
  const { searchParams } = new URL(request.url)
  if (searchParams.get("secret") === cronSecret) {
    return true
  }

  return false
}

export async function GET(request: NextRequest) {
  // Verify authentication
  if (!verifyCronAuth(request)) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    )
  }

  const startTime = Date.now()

  try {
    // Check DB-Sync health first
    const health = await isDBSyncHealthy(120) // 2 minute max lag

    if (!health.healthy) {
      return NextResponse.json({
        success: false,
        timestamp: new Date().toISOString(),
        duration: `${Date.now() - startTime}ms`,
        error: `DB-Sync unhealthy: ${health.lagSeconds}s behind`,
        dbsync: {
          blockNo: health.tip.blockNo,
          lagSeconds: health.lagSeconds,
        },
      }, { status: 503 })
    }

    // Run the DB-Sync payment monitor job
    const monitorResult = await monitorPendingPaymentsDBSync()

    // Also expire old payments
    const expired = await expireOldPaymentsDBSync()

    // Get current stats
    const stats = await getPaymentStatsDBSync()

    const totalDuration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${totalDuration}ms`,
      queryTime: `${monitorResult.durationMs}ms`,
      result: {
        processed: monitorResult.processed,
        confirmed: monitorResult.confirmed,
        confirming: monitorResult.confirming,
        expired: expired + monitorResult.expired,
        failed: monitorResult.failed,
        errors: monitorResult.errors.length > 0 ? monitorResult.errors : undefined,
      },
      stats: {
        pendingPayments: stats.pending,
        confirmingPayments: stats.confirming,
        totalPendingAda: stats.totalPendingAda,
      },
      dbsync: {
        blockNo: health.tip.blockNo,
        lagSeconds: Math.round(health.lagSeconds),
      },
    })
  } catch (error) {
    console.error("[DBSyncMonitor] Cron job error:", error)

    return NextResponse.json(
      {
        success: false,
        timestamp: new Date().toISOString(),
        duration: `${Date.now() - startTime}ms`,
        error: error instanceof Error ? error.message : "Unknown error",
      },
      { status: 500 }
    )
  }
}

// POST method for manual triggering
export async function POST(request: NextRequest) {
  return GET(request)
}
