/**
 * DB-Sync UTxO Query Endpoint
 *
 * Queries UTxOs from DB-Sync PostgreSQL directly for an address.
 * Used for load testing and as a fast alternative to Ogmios UTxO queries.
 *
 * GET /api/dbsync/utxos?address=addr1...
 */

import { NextRequest, NextResponse } from 'next/server'
import { queryDBSyncUtxos, queryDBSyncTip } from '@/lib/cardano/dbsync'

export const dynamic = 'force-dynamic'

export async function GET(request: NextRequest) {
  const startTime = Date.now()

  try {
    const address = request.nextUrl.searchParams.get('address')

    if (!address) {
      return NextResponse.json(
        { error: 'Missing address parameter' },
        { status: 400 }
      )
    }

    // Validate address format (basic check)
    if (!address.startsWith('addr')) {
      return NextResponse.json(
        { error: 'Invalid address format' },
        { status: 400 }
      )
    }

    // Query UTxOs from DB-Sync
    const [utxos, tip] = await Promise.all([
      queryDBSyncUtxos(address),
      queryDBSyncTip(),
    ])

    const queryTime = Date.now() - startTime

    // Convert BigInt to string for JSON serialization
    const serializedUtxos = utxos.map((utxo) => ({
      ...utxo,
      value: utxo.value.toString(),
      blockTime: utxo.blockTime.toISOString(),
    }))

    return NextResponse.json({
      address,
      utxoCount: utxos.length,
      utxos: serializedUtxos,
      tip: {
        blockNo: tip.blockNo,
        slotNo: tip.slotNo,
        epochNo: tip.epochNo,
        blockTime: tip.blockTime.toISOString(),
      },
      queryTimeMs: queryTime,
    })
  } catch (error) {
    console.error('DB-Sync UTxO query error:', error)
    return NextResponse.json(
      {
        error: 'Failed to query UTxOs',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    )
  }
}
