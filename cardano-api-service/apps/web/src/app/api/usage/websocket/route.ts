/**
 * WebSocket Usage Endpoint for Ogmios Cache Proxy
 *
 * This endpoint receives WebSocket usage reports from the Ogmios caching proxy
 * and stores them in the database for billing and analytics.
 *
 * The proxy reports:
 * - Messages sent (client → proxy)
 * - Messages received (proxy → client)
 * - Cache hits/misses
 * - Per-method breakdown
 *
 * Billing: 1 credit per message (both directions) for PAID tier
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

// Internal secret for Proxy -> App communication
const INTERNAL_SECRET = process.env.KONG_INTERNAL_SECRET || "change-me-in-production"

// WebSocket usage payload from proxy
interface WebSocketUsagePayload {
  apiKeyId: string
  userId: string
  tier: string
  network: string
  clientId: number
  isPartial: boolean // true if periodic report, false if disconnect
  connectionDuration: number // ms
  messages: {
    sent: number // Messages from client to proxy
    received: number // Messages from proxy to client
    cacheHits: number
    cacheMisses: number
    rateLimited: number
    methods: Record<string, number> // Per-method counts
  }
  timestamp: string
}

// Calculate credits for WebSocket messages
function calculateCredits(tier: string, sent: number, received: number): number {
  // FREE tier doesn't use credits (uses daily limits instead)
  if (tier === "FREE") return 0

  // PAID tier: 1 credit per message in both directions
  return sent + received
}

export async function POST(request: NextRequest) {
  try {
    // Verify internal secret (proxy must provide this)
    const internalSecret = request.headers.get("X-Internal-Secret")
    if (internalSecret !== INTERNAL_SECRET) {
      // Also check if it's from localhost
      const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")
      if (!clientIp?.includes("127.0.0.1") && !clientIp?.includes("::1")) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        )
      }
    }

    // Parse usage payload
    const payload: WebSocketUsagePayload = await request.json()

    // Validate required fields
    if (!payload.apiKeyId || !payload.userId) {
      return NextResponse.json({ status: "skipped", reason: "missing auth info" })
    }

    const totalMessages = payload.messages.sent + payload.messages.received

    // Skip if no messages to bill
    if (totalMessages === 0) {
      return NextResponse.json({ status: "skipped", reason: "no messages" })
    }

    const creditsUsed = calculateCredits(payload.tier, payload.messages.sent, payload.messages.received)

    // Create usage log entry for WebSocket session
    // Using "WS" as method to distinguish from HTTP requests
    const usageLog = await prisma.usageLog.create({
      data: {
        apiKeyId: payload.apiKeyId,
        userId: payload.userId,
        endpoint: `v1/${payload.network === "preprod" ? "preprod/" : ""}ogmios`,
        method: "WS", // WebSocket
        path: `/v1/${payload.network === "preprod" ? "preprod/" : ""}ogmios`,
        network: payload.network,
        statusCode: 200, // WebSocket messages don't have status codes
        responseTime: Math.round(payload.connectionDuration / totalMessages), // Avg per message
        creditsUsed,
        userAgent: null,
        ip: null,
        timestamp: new Date(payload.timestamp),
        // Store detailed stats in metadata (if schema supports it)
        // For now, we log key metrics
      },
    })

    // Deduct credits for PAID tier users
    if (creditsUsed > 0) {
      await prisma.user.update({
        where: { id: payload.userId },
        data: {
          credits: {
            decrement: creditsUsed,
          },
        },
      }).catch((e) => {
        // Log but don't fail - credits might go negative temporarily
        console.error("Failed to deduct WebSocket credits:", e)
      })
    }

    // Log summary for debugging
    console.log(
      `[WS USAGE] ${payload.isPartial ? "PARTIAL" : "FINAL"} ` +
      `apiKey=${payload.apiKeyId.slice(0, 8)}... ` +
      `network=${payload.network} ` +
      `msgs=${payload.messages.sent}/${payload.messages.received} ` +
      `cache=${payload.messages.cacheHits}/${payload.messages.cacheMisses} ` +
      `credits=${creditsUsed}`
    )

    return NextResponse.json({
      status: "ok",
      logId: usageLog.id,
      network: payload.network,
      messages: totalMessages,
      creditsUsed,
      isPartial: payload.isPartial,
    })
  } catch (error) {
    console.error("Error processing WebSocket usage:", error)
    // Return 200 anyway to prevent proxy from retrying
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: "ok", service: "websocket-usage" })
}
