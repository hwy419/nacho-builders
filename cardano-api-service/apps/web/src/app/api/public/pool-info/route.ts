/**
 * Public Pool Info Endpoint
 *
 * Returns stake pool information including metadata, margin, stake, etc.
 *
 * GET /api/public/pool-info?poolId=pool1...
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryPoolInfo } from '@/lib/cardano/public-queries'
import { checkRateLimit, getClientIp, rateLimitHeaders } from '@/lib/rate-limit'

// Rate limit: 100 requests per minute per IP
const RATE_LIMIT = 100
const RATE_WINDOW_MS = 60 * 1000

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

  // Get pool ID from query params
  const { searchParams } = new URL(request.url)
  const poolId = searchParams.get('poolId')

  if (!poolId) {
    return NextResponse.json(
      { error: 'Missing required parameter: poolId' },
      { status: 400 }
    )
  }

  // Validate pool ID format
  if (!poolId.startsWith('pool1') && !poolId.startsWith('pool_test1')) {
    return NextResponse.json(
      { error: 'Invalid pool ID format. Must start with pool1 or pool_test1' },
      { status: 400 }
    )
  }

  try {
    const poolInfo = await queryPoolInfo(poolId)

    if (!poolInfo) {
      return NextResponse.json(
        { error: 'Pool not found' },
        { status: 404 }
      )
    }

    // Convert BigInt to string for JSON serialization
    return NextResponse.json({
      poolId: poolInfo.poolId,
      ticker: poolInfo.ticker,
      name: poolInfo.name,
      description: poolInfo.description,
      homepage: poolInfo.homepage,
      margin: poolInfo.margin,
      fixedCost: poolInfo.fixedCost.toString(),
      pledge: poolInfo.pledge.toString(),
      activeStake: poolInfo.activeStake.toString(),
      delegatorCount: poolInfo.delegatorCount,
      blocksLifetime: poolInfo.blocksLifetime,
      blocksEpoch: poolInfo.blocksEpoch,
      relays: poolInfo.relays,
    }, {
      headers: {
        ...rateLimitHeaders(RATE_LIMIT, rateLimit.remaining, rateLimit.resetIn),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('Error fetching pool info:', error)
    return NextResponse.json(
      { error: 'Failed to fetch pool information' },
      { status: 500 }
    )
  }
}
