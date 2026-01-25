/**
 * Public Pool Status Endpoint
 *
 * Returns live pool status with relay health for the landing page.
 * Combines data from DB-Sync, Ogmios, and Prometheus.
 *
 * GET /api/public/pool-status
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryPoolStatus, queryNetworkTip } from '@/lib/cardano/public-queries'
import { getRelayMetrics } from '@/lib/metrics/prometheus'
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit'

// Rate limit: 100 requests per minute per IP
const RATE_LIMIT = 100
const RATE_WINDOW_MS = 60 * 1000

// NACHO Pool ID (bech32)
const NACHO_POOL_ID = 'pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml'

// Cardano mainnet epoch constants
const EPOCH_LENGTH_SLOTS = 432000 // 5 days worth of slots
const SLOT_DURATION_SECONDS = 1
const SHELLEY_START_SLOT = 4492800 // Slot when Shelley started
const SHELLEY_START_EPOCH = 208 // Epoch when Shelley started

export async function GET(request: NextRequest) {
  // Rate limiting
  const clientIp = getClientIp(request.headers)
  const rateLimit = checkRateLimit(clientIp, RATE_LIMIT, RATE_WINDOW_MS)

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Rate limit exceeded', retryAfter: Math.ceil(rateLimit.resetIn / 1000) },
      {
        status: 429,
        headers: rateLimitHeaders(RATE_LIMIT, rateLimit.remaining, rateLimit.resetIn),
      }
    )
  }

  try {
    // Fetch all data in parallel
    const [poolStatus, networkTip, relayMetrics] = await Promise.all([
      queryPoolStatus(NACHO_POOL_ID),
      queryNetworkTip(),
      getRelayMetrics(),
    ])

    // Calculate epoch progress
    const slotsIntoCurrentEpoch = (networkTip.slotNo - SHELLEY_START_SLOT) % EPOCH_LENGTH_SLOTS
    const epochProgress = (slotsIntoCurrentEpoch / EPOCH_LENGTH_SLOTS) * 100

    // Build response
    const response = {
      pool: poolStatus ? {
        activeStake: Number(poolStatus.activeStake / BigInt(1_000_000)), // Convert lovelace to ADA
        delegators: poolStatus.delegators,
        blocksMinted: poolStatus.blocksMinted,
        lifetimeBlocks: poolStatus.lifetimeBlocks,
        margin: poolStatus.margin, // Already a percentage
        pledge: Number(poolStatus.pledge / BigInt(1_000_000)), // Convert lovelace to ADA
      } : null,
      relays: relayMetrics.relays,
      network: {
        tip: {
          blockNo: networkTip.blockNo,
          slotNo: networkTip.slotNo,
          hash: networkTip.hash,
          time: networkTip.time.toISOString(),
        },
        epoch: networkTip.epochNo,
        epochProgress: Math.round(epochProgress * 10) / 10, // Round to 1 decimal
      },
      timestamp: new Date().toISOString(),
    }

    return NextResponse.json(response, {
      headers: {
        ...rateLimitHeaders(RATE_LIMIT, rateLimit.remaining, rateLimit.resetIn),
        // Short cache - data refreshes every 10 seconds on client
        'Cache-Control': 'public, max-age=5',
      },
    })
  } catch (error) {
    console.error('Error fetching pool status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pool status' },
      { status: 500 }
    )
  }
}
