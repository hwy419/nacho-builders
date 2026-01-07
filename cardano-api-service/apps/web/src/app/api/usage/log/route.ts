/**
 * Usage Log Endpoint for Kong HTTP-Log Plugin
 *
 * This endpoint receives usage logs from Kong's http-log plugin
 * and stores them in the database for the usage analytics dashboard.
 *
 * Kong sends a JSON payload with request/response details after each API call.
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"

// Internal secret for Kong -> App communication
const INTERNAL_SECRET = process.env.KONG_INTERNAL_SECRET || "change-me-in-production"

// Kong http-log payload structure
interface KongLogPayload {
  request: {
    method: string
    uri: string
    url: string
    size: number
    headers: Record<string, string>
  }
  response: {
    status: number
    size: number
    headers: Record<string, string>
  }
  latencies: {
    request: number // Total request latency in ms
    kong: number // Kong processing time
    proxy: number // Upstream response time
  }
  client_ip: string
  started_at: number // Unix timestamp in ms
  route?: {
    name: string
    paths: string[]
  }
  service?: {
    name: string
  }
}

// Extract endpoint name from URI path
function extractEndpoint(uri: string): string {
  // Remove query params
  const path = uri.split("?")[0]

  // Match known API patterns (check preprod first as it's more specific)
  if (path.includes("/v1/preprod/ogmios")) return "v1/preprod/ogmios"
  if (path.includes("/v1/preprod/submit")) return "v1/preprod/submit"
  if (path.includes("/v1/ogmios")) return "v1/ogmios"
  if (path.includes("/v1/submit")) return "v1/submit"
  if (path.includes("/v1/graphql")) return "v1/graphql"

  // Fallback to cleaned path
  return path.replace(/^\//, "").substring(0, 50)
}

// Extract network from URI path (mainnet or preprod)
function extractNetwork(uri: string): string {
  const path = uri.split("?")[0]
  if (path.includes("/v1/preprod/")) return "preprod"
  return "mainnet"
}

// Determine credits to charge based on tier and endpoint
function calculateCredits(tier: string, endpoint: string): number {
  // FREE tier doesn't use credits (uses daily limits instead)
  if (tier === "FREE") return 0

  // ADMIN and WEBSITE tiers have unlimited access, no credits charged
  if (tier === "ADMIN" || tier === "WEBSITE") return 0

  // PAID tier: 1 credit per request
  // Could add different rates for different endpoints in the future
  return 1
}

export async function POST(request: NextRequest) {
  try {
    // Verify internal secret (Kong must provide this)
    const internalSecret = request.headers.get("X-Internal-Secret")
    if (internalSecret !== INTERNAL_SECRET) {
      // Also check if it's from localhost (Kong on same server)
      const clientIp = request.headers.get("x-forwarded-for") || request.headers.get("x-real-ip")
      if (!clientIp?.includes("127.0.0.1") && !clientIp?.includes("::1")) {
        return NextResponse.json(
          { error: "Unauthorized" },
          { status: 401 }
        )
      }
    }

    // Parse Kong log payload
    const payload: KongLogPayload = await request.json()

    // Extract API key and user info from request headers
    // These are set by our cardano-api-auth plugin
    const apiKeyId = payload.request.headers["x-api-key-id"]
    const userId = payload.request.headers["x-user-id"]
    const tier = payload.request.headers["x-api-tier"] || "FREE"

    // Skip logging if we don't have the required IDs
    // This happens for unauthenticated requests (which should be blocked anyway)
    if (!apiKeyId || !userId) {
      return NextResponse.json({ status: "skipped", reason: "missing auth headers" })
    }

    // Extract request details
    const endpoint = extractEndpoint(payload.request.uri)
    const method = payload.request.method
    const path = payload.request.uri
    const network = extractNetwork(payload.request.uri)
    const statusCode = payload.response.status
    const userAgent = payload.request.headers["user-agent"] || null
    const ip = payload.client_ip || null
    const creditsUsed = calculateCredits(tier, endpoint)

    // For WebSocket endpoints (ogmios), use proxy latency (connection establishment time)
    // instead of request latency (total connection duration, which can be minutes)
    const isWebSocket = endpoint.includes("ogmios")
    const responseTime = isWebSocket
      ? (payload.latencies.proxy || 0)
      : (payload.latencies.request || 0)

    // Create usage log entry
    const usageLog = await prisma.usageLog.create({
      data: {
        apiKeyId,
        userId,
        endpoint,
        method,
        path,
        network,
        statusCode,
        responseTime,
        creditsUsed,
        userAgent,
        ip,
        timestamp: new Date(payload.started_at),
      },
    })

    // Deduct credits for PAID tier users
    if (creditsUsed > 0) {
      await prisma.user.update({
        where: { id: userId },
        data: {
          credits: {
            decrement: creditsUsed,
          },
        },
      }).catch((e) => {
        // Log but don't fail - credits might go negative temporarily
        console.error("Failed to deduct credits:", e)
      })
    }

    return NextResponse.json({
      status: "ok",
      logId: usageLog.id,
      network,
      creditsUsed,
    })
  } catch (error) {
    console.error("Error processing usage log:", error)
    // Return 200 anyway to prevent Kong from retrying
    // Log errors shouldn't block API requests
    return NextResponse.json({
      status: "error",
      message: error instanceof Error ? error.message : "Unknown error",
    })
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: "ok", service: "usage-log" })
}
