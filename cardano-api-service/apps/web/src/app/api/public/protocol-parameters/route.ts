/**
 * Public Protocol Parameters Endpoint
 *
 * Returns current Cardano protocol parameters for Lucid initialization.
 * No authentication required.
 *
 * GET /api/public/protocol-parameters
 */

import { NextRequest, NextResponse } from 'next/server'
import { getOgmiosClient } from '@/lib/cardano/ogmios'
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

  try {
    const client = getOgmiosClient()

    // Query protocol parameters from Ogmios
    // This is cached for 1 hour by the Ogmios client
    await client.connect()

    // Use the internal request method via a wrapper
    const protocolParams = await queryProtocolParameters(client)

    return NextResponse.json(protocolParams, {
      headers: {
        ...rateLimitHeaders(RATE_LIMIT, rateLimit.remaining, rateLimit.resetIn),
        'Cache-Control': 'public, max-age=3600', // Cache for 1 hour
      },
    })
  } catch (error) {
    console.error('Error fetching protocol parameters:', error)
    return NextResponse.json(
      { error: 'Failed to fetch protocol parameters' },
      { status: 500 }
    )
  }
}

/**
 * Query protocol parameters from Ogmios
 *
 * Wraps the private request method for protocol parameters query
 */
async function queryProtocolParameters(client: ReturnType<typeof getOgmiosClient>): Promise<unknown> {
  // We need to access the private request method
  // For now, we'll use a WebSocket query directly
  return new Promise((resolve, reject) => {
    const WebSocket = require('ws')
    const host = process.env.OGMIOS_HOST || '127.0.0.1'
    const port = process.env.OGMIOS_PORT || '3001'

    const ws = new WebSocket(`ws://${host}:${port}`)
    const timeout = setTimeout(() => {
      ws.close()
      reject(new Error('Protocol parameters query timeout'))
    }, 30000)

    ws.on('open', () => {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'queryLedgerState/protocolParameters',
        id: 1,
      }))
    })

    ws.on('message', (data: Buffer) => {
      clearTimeout(timeout)
      try {
        const response = JSON.parse(data.toString())
        ws.close()

        if (response.error) {
          reject(new Error(response.error.message))
        } else {
          resolve(response.result)
        }
      } catch (e) {
        reject(e)
      }
    })

    ws.on('error', (error: Error) => {
      clearTimeout(timeout)
      reject(error)
    })
  })
}
