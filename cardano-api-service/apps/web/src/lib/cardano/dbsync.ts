/**
 * DB-Sync Client for Cardano Payment Verification
 *
 * Provides SQL queries against the cardano-db-sync PostgreSQL database
 * for accurate payment verification and confirmation counting.
 *
 * DB-Sync server: 192.168.170.20 (cexplorer database)
 *
 * Benefits over Ogmios:
 * - Accurate block height when tx was included (not estimated)
 * - Historical transaction lookups
 * - Richer metadata (fees, sizes, etc.)
 *
 * Configuration:
 * - DBSYNC_DATABASE_URL environment variable
 */

import { Pool } from 'pg'

// Types for DB-Sync query results
export interface DBSyncUTxO {
  txHash: string
  outputIndex: number
  address: string
  value: bigint
  blockNo: number
  blockTime: Date
}

export interface DBSyncTransaction {
  txHash: string
  blockNo: number
  blockTime: Date
  fee: bigint
  totalOutput: bigint
}

export interface DBSyncPaymentResult {
  found: boolean
  txHash?: string
  actualAmount: bigint
  blockNo?: number
  confirmations: number
  utxos: DBSyncUTxO[]
}

export interface DBSyncTip {
  blockNo: number
  blockTime: Date
  slotNo: number
  epochNo: number
}

// Connection pool (lazy initialization)
let pool: Pool | null = null

/**
 * Get or create the database connection pool
 */
function getPool(): Pool {
  if (!pool) {
    const dbUrl = process.env.DBSYNC_DATABASE_URL

    if (!dbUrl) {
      throw new Error('DBSYNC_DATABASE_URL environment variable is not set')
    }

    pool = new Pool({
      connectionString: dbUrl,
      max: 10, // Maximum number of connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })

    // Handle pool errors
    pool.on('error', (err) => {
      console.error('DB-Sync pool error:', err)
    })
  }

  return pool
}

/**
 * Query the current chain tip from DB-Sync
 */
export async function queryDBSyncTip(): Promise<DBSyncTip> {
  const pool = getPool()

  const result = await pool.query(`
    SELECT
      block_no,
      time as block_time,
      slot_no,
      epoch_no
    FROM block
    ORDER BY id DESC
    LIMIT 1
  `)

  if (result.rows.length === 0) {
    throw new Error('No blocks found in DB-Sync')
  }

  const row = result.rows[0]
  return {
    blockNo: Number(row.block_no),
    blockTime: new Date(row.block_time),
    slotNo: Number(row.slot_no),
    epochNo: Number(row.epoch_no),
  }
}

/**
 * Query UTxOs at a specific address
 *
 * Returns only unspent transaction outputs (UTxOs that haven't been consumed)
 * Uses the utxo_view materialized view for optimal performance (~10x faster)
 */
export async function queryDBSyncUtxos(address: string): Promise<DBSyncUTxO[]> {
  const pool = getPool()

  // Use utxo_view for much better performance (handles spent output filtering internally)
  const result = await pool.query(`
    SELECT
      encode(tx.hash, 'hex') as tx_hash,
      uv.index as output_index,
      uv.address,
      uv.value,
      block.block_no,
      block.time as block_time
    FROM utxo_view uv
    JOIN tx ON tx.id = uv.tx_id
    JOIN block ON block.id = tx.block_id
    WHERE uv.address = $1
    ORDER BY block.block_no DESC
  `, [address])

  return result.rows.map((row) => ({
    txHash: row.tx_hash,
    outputIndex: Number(row.output_index),
    address: row.address,
    value: BigInt(row.value),
    blockNo: Number(row.block_no),
    blockTime: new Date(row.block_time),
  }))
}

/**
 * Check if a payment has been received at an address
 *
 * @param address - Bech32 Cardano address
 * @param expectedLovelace - Expected amount in lovelace
 * @returns Payment result with UTxOs and confirmation count
 */
export async function checkDBSyncPayment(
  address: string,
  expectedLovelace: bigint
): Promise<DBSyncPaymentResult> {
  const pool = getPool()

  // Get UTxOs at the address
  const utxos = await queryDBSyncUtxos(address)

  if (utxos.length === 0) {
    return {
      found: false,
      actualAmount: BigInt(0),
      confirmations: 0,
      utxos: [],
    }
  }

  // Calculate total received
  const totalReceived = utxos.reduce(
    (sum, utxo) => sum + utxo.value,
    BigInt(0)
  )

  // Check if we received at least the expected amount
  if (totalReceived < expectedLovelace) {
    return {
      found: false,
      actualAmount: totalReceived,
      confirmations: 0,
      utxos,
    }
  }

  // Get current block height for confirmation calculation
  const tip = await queryDBSyncTip()

  // Use the first UTxO's block for confirmation calculation
  // (in case of multiple UTxOs, use the most recent one)
  const latestUtxo = utxos[0] // Already sorted DESC by block_no
  const confirmations = tip.blockNo - latestUtxo.blockNo

  return {
    found: true,
    txHash: latestUtxo.txHash,
    actualAmount: totalReceived,
    blockNo: latestUtxo.blockNo,
    confirmations,
    utxos,
  }
}

/**
 * Get transaction details by hash
 */
export async function getDBSyncTransaction(
  txHash: string
): Promise<DBSyncTransaction | null> {
  const pool = getPool()

  // Remove '0x' prefix if present and convert to lowercase
  const cleanHash = txHash.replace(/^0x/, '').toLowerCase()

  const result = await pool.query(`
    SELECT
      encode(tx.hash, 'hex') as tx_hash,
      block.block_no,
      block.time as block_time,
      tx.fee,
      tx.out_sum as total_output
    FROM tx
    JOIN block ON block.id = tx.block_id
    WHERE tx.hash = decode($1, 'hex')
  `, [cleanHash])

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]
  return {
    txHash: row.tx_hash,
    blockNo: Number(row.block_no),
    blockTime: new Date(row.block_time),
    fee: BigInt(row.fee),
    totalOutput: BigInt(row.total_output),
  }
}

/**
 * Calculate confirmations for a transaction
 */
export async function getDBSyncConfirmations(txHash: string): Promise<number> {
  const pool = getPool()

  const cleanHash = txHash.replace(/^0x/, '').toLowerCase()

  const result = await pool.query(`
    SELECT
      (SELECT MAX(block_no) FROM block) - block.block_no as confirmations
    FROM tx
    JOIN block ON block.id = tx.block_id
    WHERE tx.hash = decode($1, 'hex')
  `, [cleanHash])

  if (result.rows.length === 0) {
    return -1 // Transaction not found
  }

  return Number(result.rows[0].confirmations)
}

/**
 * Check if DB-Sync is healthy and synced
 *
 * @param maxLagSeconds - Maximum acceptable lag behind real time
 * @returns True if DB-Sync is healthy and reasonably synced
 */
export async function isDBSyncHealthy(maxLagSeconds: number = 300): Promise<{
  healthy: boolean
  tip: DBSyncTip
  lagSeconds: number
}> {
  try {
    const tip = await queryDBSyncTip()
    const now = new Date()
    const lagSeconds = (now.getTime() - tip.blockTime.getTime()) / 1000

    return {
      healthy: lagSeconds < maxLagSeconds,
      tip,
      lagSeconds,
    }
  } catch (error) {
    console.error('DB-Sync health check failed:', error)
    return {
      healthy: false,
      tip: { blockNo: 0, blockTime: new Date(0), slotNo: 0, epochNo: 0 },
      lagSeconds: Infinity,
    }
  }
}

/**
 * Close the database pool (for cleanup)
 */
export async function closeDBSyncPool(): Promise<void> {
  if (pool) {
    await pool.end()
    pool = null
  }
}
