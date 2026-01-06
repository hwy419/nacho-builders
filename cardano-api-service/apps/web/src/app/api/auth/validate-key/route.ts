/**
 * API Key Validation Endpoint for Kong Gateway
 *
 * This endpoint is called by Kong's custom auth plugin to validate
 * API keys against the PostgreSQL database.
 *
 * Request: POST with { apiKey: string }
 * Response: { valid: true, keyId, userId, tier, rateLimit, credits, ... } or 401/403
 */

import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/db"
import { hashApiKey } from "@/lib/utils"

// Internal secret for Kong -> App communication
const INTERNAL_SECRET = process.env.KONG_INTERNAL_SECRET || "change-me-in-production"

export async function POST(request: NextRequest) {
  try {
    // Verify internal secret (Kong must provide this)
    const internalSecret = request.headers.get("X-Internal-Secret")
    if (internalSecret !== INTERNAL_SECRET) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 401 }
      )
    }

    // Parse request body
    const body = await request.json()
    const { apiKey } = body

    if (!apiKey || typeof apiKey !== "string") {
      return NextResponse.json(
        { error: "API key is required" },
        { status: 400 }
      )
    }

    // Hash the provided key
    const keyHash = await hashApiKey(apiKey)

    // Look up the key in the database
    const apiKeyRecord = await prisma.apiKey.findUnique({
      where: { keyHash },
      include: {
        user: {
          select: {
            id: true,
            credits: true,
            status: true,
          },
        },
      },
    })

    if (!apiKeyRecord) {
      return NextResponse.json(
        { error: "Invalid API key" },
        { status: 401 }
      )
    }

    // Check if user is active
    if (apiKeyRecord.user.status !== "ACTIVE") {
      return NextResponse.json(
        { error: "User account is suspended" },
        { status: 403 }
      )
    }

    // Check if key is active
    if (!apiKeyRecord.active) {
      return NextResponse.json(
        {
          active: false,
          error: "API key is inactive",
        },
        { status: 403 }
      )
    }

    // Check expiration
    const now = new Date()
    const expired = apiKeyRecord.expiresAt && apiKeyRecord.expiresAt < now

    if (expired) {
      return NextResponse.json(
        {
          active: true,
          expired: true,
          error: "API key has expired",
        },
        { status: 403 }
      )
    }

    // Update last used timestamp (async, don't await)
    prisma.apiKey
      .update({
        where: { id: apiKeyRecord.id },
        data: { lastUsedAt: now },
      })
      .catch((e) => console.error("Failed to update lastUsedAt:", e))

    // Return validation result
    return NextResponse.json({
      valid: true,
      keyId: apiKeyRecord.id,
      userId: apiKeyRecord.userId,
      tier: apiKeyRecord.tier,
      active: apiKeyRecord.active,
      expired: false,
      credits: apiKeyRecord.user.credits,
      rateLimit: apiKeyRecord.rateLimitPerSecond,
      dailyLimit: apiKeyRecord.dailyRequestLimit,
      websocketLimit: apiKeyRecord.websocketLimit,
      allowedApis: apiKeyRecord.allowedApis,
      ipWhitelist: apiKeyRecord.ipWhitelist,
    })
  } catch (error) {
    console.error("Error validating API key:", error)
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    )
  }
}

// Health check
export async function GET() {
  return NextResponse.json({ status: "ok", service: "api-key-validation" })
}
