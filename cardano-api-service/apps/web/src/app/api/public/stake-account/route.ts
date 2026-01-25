/**
 * Public Stake Account Endpoint
 *
 * Returns stake account information including registration status,
 * delegated pool, and rewards balance.
 *
 * GET /api/public/stake-account?address=stake1...
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryStakeAccount } from '@/lib/cardano/public-queries'
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

  // Get stake address from query params
  const { searchParams } = new URL(request.url)
  const address = searchParams.get('address')

  if (!address) {
    return NextResponse.json(
      { error: 'Missing required parameter: address' },
      { status: 400 }
    )
  }

  // Validate stake address format
  if (!address.startsWith('stake1') && !address.startsWith('stake_test1')) {
    return NextResponse.json(
      { error: 'Invalid stake address format. Must start with stake1 or stake_test1' },
      { status: 400 }
    )
  }

  try {
    const accountInfo = await queryStakeAccount(address)

    if (!accountInfo) {
      // Address not found - return empty result (not an error)
      return NextResponse.json({
        address,
        registered: false,
        delegatedPoolId: null,
        rewardsBalance: '0',
        totalStake: '0',
      }, {
        headers: {
          ...rateLimitHeaders(RATE_LIMIT, rateLimit.remaining, rateLimit.resetIn),
          'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
        },
      })
    }

    // Convert BigInt to string for JSON serialization
    return NextResponse.json({
      address: accountInfo.address,
      registered: accountInfo.registered,
      delegatedPoolId: accountInfo.delegatedPoolId,
      rewardsBalance: accountInfo.rewardsBalance.toString(),
      totalStake: accountInfo.totalStake.toString(),
    }, {
      headers: {
        ...rateLimitHeaders(RATE_LIMIT, rateLimit.remaining, rateLimit.resetIn),
        'Cache-Control': 'public, max-age=300', // Cache for 5 minutes
      },
    })
  } catch (error) {
    console.error('Error fetching stake account:', error)
    return NextResponse.json(
      { error: 'Failed to fetch stake account information' },
      { status: 500 }
    )
  }
}
