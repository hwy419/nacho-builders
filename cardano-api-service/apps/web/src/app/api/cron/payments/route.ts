/**
 * Cron endpoint for payment monitoring
 *
 * This endpoint should be called periodically (e.g., every minute) to:
 * - Check pending payments for incoming transactions
 * - Update confirmations for detected payments
 * - Credit user accounts when payments are confirmed
 * - Expire payments that have passed their expiry time
 *
 * Security:
 * - Protected by CRON_SECRET environment variable
 * - Should only be called by your cron service (e.g., Vercel Cron, external service)
 *
 * Example cron configuration for Vercel:
 * ```json
 * {
 *   "crons": [
 *     {
 *       "path": "/api/cron/payments",
 *       "schedule": "* * * * *"
 *     }
 *   ]
 * }
 * ```
 */

import { NextRequest, NextResponse } from "next/server"
import {
  monitorPendingPayments,
  expireOldPayments,
  getPaymentStats,
} from "@/lib/jobs/payment-monitor"

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

  // Also check query parameter for Vercel Cron
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
    // Run the payment monitor job
    const monitorResult = await monitorPendingPayments()

    // Also expire old payments
    const expired = await expireOldPayments()

    // Get current stats
    const stats = await getPaymentStats()

    const duration = Date.now() - startTime

    return NextResponse.json({
      success: true,
      timestamp: new Date().toISOString(),
      duration: `${duration}ms`,
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
    })
  } catch (error) {
    console.error("Cron job error:", error)

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

// POST method for manual triggering or webhooks
export async function POST(request: NextRequest) {
  return GET(request)
}
