/**
 * Public Transaction Status Endpoint
 *
 * Returns transaction confirmation status for polling after submission.
 *
 * GET /api/public/tx-status?txHash=...
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryTransactionStatus } from '@/lib/cardano/public-queries'
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

  // Get transaction hash from query params
  const { searchParams } = new URL(request.url)
  const txHash = searchParams.get('txHash')

  if (!txHash) {
    return NextResponse.json(
      { error: 'Missing required parameter: txHash' },
      { status: 400 }
    )
  }

  // Validate transaction hash format (64 hex characters)
  const cleanHash = txHash.replace(/^0x/, '').toLowerCase()
  if (!/^[0-9a-f]{64}$/.test(cleanHash)) {
    return NextResponse.json(
      { error: 'Invalid transaction hash format. Must be 64 hex characters' },
      { status: 400 }
    )
  }

  try {
    const txStatus = await queryTransactionStatus(cleanHash)

    // Convert BigInt to string for JSON serialization
    return NextResponse.json({
      txHash: txStatus.txHash,
      found: txStatus.found,
      blockNo: txStatus.blockNo,
      blockTime: txStatus.blockTime?.toISOString(),
      confirmations: txStatus.confirmations,
      fee: txStatus.fee?.toString(),
    }, {
      headers: {
        ...rateLimitHeaders(RATE_LIMIT, rateLimit.remaining, rateLimit.resetIn),
        // Don't cache tx-status - it changes with each new block
        'Cache-Control': 'no-cache',
      },
    })
  } catch (error) {
    console.error('Error fetching transaction status:', error)
    return NextResponse.json(
      { error: 'Failed to fetch transaction status' },
      { status: 500 }
    )
  }
}
