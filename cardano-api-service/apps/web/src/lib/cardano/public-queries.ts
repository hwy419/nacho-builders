/**
 * Public Queries for Cardano Blockchain Data
 *
 * These queries are designed for the public API endpoints
 * and don't require authentication.
 *
 * Data sources:
 * - DB-Sync PostgreSQL for stake/pool data
 * - Ogmios for real-time chain tip and protocol parameters
 */

import { Pool } from 'pg'

// Types for public API responses
export interface StakeAccountInfo {
  address: string
  registered: boolean
  delegatedPoolId: string | null
  rewardsBalance: bigint
  totalStake: bigint
}

export interface PoolInfo {
  poolId: string
  ticker: string | null
  name: string | null
  description: string | null
  homepage: string | null
  margin: number
  fixedCost: bigint
  pledge: bigint
  activeStake: bigint
  delegatorCount: number
  blocksLifetime: number
  blocksEpoch: number
  relays: Array<{ dns?: string; ipv4?: string; ipv6?: string; port: number }>
}

export interface TransactionStatus {
  txHash: string
  found: boolean
  blockNo?: number
  blockTime?: Date
  confirmations: number
  fee?: bigint
}

// Lazy-initialized pool for DB-Sync queries
let dbsyncPool: Pool | null = null

function getDBSyncPool(): Pool {
  if (!dbsyncPool) {
    const dbUrl = process.env.DBSYNC_DATABASE_URL
    if (!dbUrl) {
      throw new Error('DBSYNC_DATABASE_URL environment variable is not set')
    }
    dbsyncPool = new Pool({
      connectionString: dbUrl,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    })
    dbsyncPool.on('error', (err) => {
      console.error('DB-Sync pool error:', err)
    })
  }
  return dbsyncPool
}

/**
 * Query stake account information by reward address
 *
 * @param stakeAddress - Bech32 stake address (stake1...)
 */
export async function queryStakeAccount(stakeAddress: string): Promise<StakeAccountInfo | null> {
  const pool = getDBSyncPool()

  // Query stake account registration and delegation
  const result = await pool.query(`
    SELECT
      sa.view as address,
      CASE WHEN sr.id IS NOT NULL THEN true ELSE false END as registered,
      encode(ph.hash_raw, 'hex') as delegated_pool_id,
      COALESCE(sa.amount, 0) as rewards_balance
    FROM stake_address sa
    LEFT JOIN stake_registration sr ON sr.addr_id = sa.id
      AND sr.id = (SELECT MAX(id) FROM stake_registration WHERE addr_id = sa.id)
    LEFT JOIN stake_deregistration sd ON sd.addr_id = sa.id
      AND sd.id = (SELECT MAX(id) FROM stake_deregistration WHERE addr_id = sa.id)
    LEFT JOIN delegation d ON d.addr_id = sa.id
      AND d.id = (SELECT MAX(id) FROM delegation WHERE addr_id = sa.id)
    LEFT JOIN pool_hash ph ON ph.id = d.pool_hash_id
    WHERE sa.view = $1
      AND (sr.id IS NULL OR sd.id IS NULL OR sr.tx_id > sd.tx_id)
  `, [stakeAddress])

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]

  // Query total stake (UTxO value at the stake address's payment addresses)
  const stakeResult = await pool.query(`
    SELECT COALESCE(SUM(value), 0) as total_stake
    FROM utxo_view uv
    JOIN stake_address sa ON sa.id = uv.stake_address_id
    WHERE sa.view = $1
  `, [stakeAddress])

  const totalStake = BigInt(stakeResult.rows[0]?.total_stake || '0')

  return {
    address: row.address,
    registered: row.registered,
    delegatedPoolId: row.delegated_pool_id ? `pool1${row.delegated_pool_id}` : null,
    rewardsBalance: BigInt(row.rewards_balance || '0'),
    totalStake,
  }
}

/**
 * Query pool information by pool ID
 *
 * @param poolId - Bech32 pool ID (pool1...)
 */
export async function queryPoolInfo(poolId: string): Promise<PoolInfo | null> {
  const pool = getDBSyncPool()

  // Extract the hash from the pool ID (remove 'pool1' prefix and decode bech32)
  // For now, we'll query by the view (bech32 format) from pool_hash
  const result = await pool.query(`
    WITH latest_update AS (
      SELECT DISTINCT ON (ph.id)
        ph.id as pool_id,
        ph.hash_raw,
        ph.view as pool_view,
        pu.pledge,
        pu.margin,
        pu.fixed_cost,
        pm.ticker_name,
        pm.json as metadata
      FROM pool_hash ph
      LEFT JOIN pool_update pu ON pu.hash_id = ph.id
      LEFT JOIN pool_metadata_ref pmr ON pmr.id = pu.meta_id
      LEFT JOIN pool_offline_data pm ON pm.pmr_id = pmr.id
      WHERE ph.view = $1
      ORDER BY ph.id, pu.registered_tx_id DESC NULLS LAST
    ),
    pool_stake AS (
      SELECT
        d.pool_hash_id,
        COUNT(DISTINCT d.addr_id) as delegator_count
      FROM delegation d
      WHERE d.pool_hash_id = (SELECT pool_id FROM latest_update)
        AND d.id = (SELECT MAX(id) FROM delegation d2 WHERE d2.addr_id = d.addr_id)
      GROUP BY d.pool_hash_id
    ),
    epoch_stake AS (
      SELECT
        pool_id,
        amount as active_stake
      FROM epoch_stake
      WHERE pool_id = (SELECT pool_id FROM latest_update)
      ORDER BY epoch_no DESC
      LIMIT 1
    ),
    block_counts AS (
      SELECT
        sl.pool_hash_id,
        COUNT(*) as blocks_lifetime,
        COUNT(*) FILTER (WHERE b.epoch_no = (SELECT MAX(epoch_no) FROM block)) as blocks_epoch
      FROM slot_leader sl
      JOIN block b ON b.slot_leader_id = sl.id
      WHERE sl.pool_hash_id = (SELECT pool_id FROM latest_update)
      GROUP BY sl.pool_hash_id
    )
    SELECT
      lu.pool_view,
      lu.ticker_name,
      lu.metadata->>'name' as pool_name,
      lu.metadata->>'description' as pool_description,
      lu.metadata->>'homepage' as pool_homepage,
      lu.margin,
      lu.fixed_cost,
      lu.pledge,
      COALESCE(es.active_stake, 0) as active_stake,
      COALESCE(ps.delegator_count, 0) as delegator_count,
      COALESCE(bc.blocks_lifetime, 0) as blocks_lifetime,
      COALESCE(bc.blocks_epoch, 0) as blocks_epoch
    FROM latest_update lu
    LEFT JOIN pool_stake ps ON ps.pool_hash_id = lu.pool_id
    LEFT JOIN epoch_stake es ON es.pool_id = lu.pool_id
    LEFT JOIN block_counts bc ON bc.pool_hash_id = lu.pool_id
  `, [poolId])

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]

  // Query pool relays
  const relaysResult = await pool.query(`
    SELECT
      pr.dns_name,
      pr.ipv4,
      pr.ipv6,
      pr.port
    FROM pool_relay pr
    JOIN pool_update pu ON pu.id = pr.update_id
    JOIN pool_hash ph ON ph.id = pu.hash_id
    WHERE ph.view = $1
      AND pu.id = (SELECT MAX(id) FROM pool_update WHERE hash_id = ph.id)
  `, [poolId])

  const relays = relaysResult.rows.map((r) => ({
    dns: r.dns_name || undefined,
    ipv4: r.ipv4 || undefined,
    ipv6: r.ipv6 || undefined,
    port: r.port,
  }))

  return {
    poolId: row.pool_view,
    ticker: row.ticker_name,
    name: row.pool_name,
    description: row.pool_description,
    homepage: row.pool_homepage,
    margin: parseFloat(row.margin) || 0,
    fixedCost: BigInt(row.fixed_cost || '0'),
    pledge: BigInt(row.pledge || '0'),
    activeStake: BigInt(row.active_stake || '0'),
    delegatorCount: parseInt(row.delegator_count) || 0,
    blocksLifetime: parseInt(row.blocks_lifetime) || 0,
    blocksEpoch: parseInt(row.blocks_epoch) || 0,
    relays,
  }
}

/**
 * Query transaction status by hash
 *
 * @param txHash - Transaction hash (hex)
 */
export async function queryTransactionStatus(txHash: string): Promise<TransactionStatus> {
  const pool = getDBSyncPool()

  // Clean hash (remove 0x prefix if present)
  const cleanHash = txHash.replace(/^0x/, '').toLowerCase()

  const result = await pool.query(`
    SELECT
      encode(tx.hash, 'hex') as tx_hash,
      b.block_no,
      b.time as block_time,
      tx.fee,
      (SELECT MAX(block_no) FROM block) as current_block
    FROM tx
    JOIN block b ON b.id = tx.block_id
    WHERE tx.hash = decode($1, 'hex')
  `, [cleanHash])

  if (result.rows.length === 0) {
    return {
      txHash: cleanHash,
      found: false,
      confirmations: 0,
    }
  }

  const row = result.rows[0]
  const confirmations = parseInt(row.current_block) - parseInt(row.block_no)

  return {
    txHash: row.tx_hash,
    found: true,
    blockNo: parseInt(row.block_no),
    blockTime: new Date(row.block_time),
    confirmations,
    fee: BigInt(row.fee),
  }
}

/**
 * Query pool status with delegator/stake info for live stats
 *
 * @param poolId - Bech32 pool ID
 */
export async function queryPoolStatus(poolId: string): Promise<{
  activeStake: bigint
  delegators: number
  blocksMinted: number
  lifetimeBlocks: number
  margin: number
  pledge: bigint
  epoch: number
} | null> {
  const pool = getDBSyncPool()

  const result = await pool.query(`
    WITH latest_update AS (
      SELECT DISTINCT ON (ph.id)
        ph.id as pool_id,
        pu.margin,
        pu.pledge
      FROM pool_hash ph
      LEFT JOIN pool_update pu ON pu.hash_id = ph.id
      WHERE ph.view = $1
      ORDER BY ph.id, pu.registered_tx_id DESC NULLS LAST
    ),
    current_epoch AS (
      SELECT MAX(epoch_no) as epoch FROM block
    ),
    pool_stake AS (
      SELECT
        d.pool_hash_id,
        COUNT(DISTINCT d.addr_id) as delegator_count
      FROM delegation d
      WHERE d.pool_hash_id = (SELECT pool_id FROM latest_update)
        AND d.id = (SELECT MAX(id) FROM delegation d2 WHERE d2.addr_id = d.addr_id)
        AND NOT EXISTS (
          SELECT 1 FROM stake_deregistration sd
          WHERE sd.addr_id = d.addr_id
            AND sd.tx_id > d.tx_id
        )
      GROUP BY d.pool_hash_id
    ),
    epoch_stake AS (
      SELECT
        pool_id,
        amount as active_stake
      FROM epoch_stake
      WHERE pool_id = (SELECT pool_id FROM latest_update)
      ORDER BY epoch_no DESC
      LIMIT 1
    ),
    block_counts AS (
      SELECT
        sl.pool_hash_id,
        COUNT(*) as blocks_lifetime,
        COUNT(*) FILTER (WHERE b.epoch_no = (SELECT epoch FROM current_epoch)) as blocks_epoch
      FROM slot_leader sl
      JOIN block b ON b.slot_leader_id = sl.id
      WHERE sl.pool_hash_id = (SELECT pool_id FROM latest_update)
      GROUP BY sl.pool_hash_id
    )
    SELECT
      lu.margin,
      lu.pledge,
      COALESCE(es.active_stake, 0) as active_stake,
      COALESCE(ps.delegator_count, 0) as delegator_count,
      COALESCE(bc.blocks_lifetime, 0) as blocks_lifetime,
      COALESCE(bc.blocks_epoch, 0) as blocks_epoch,
      (SELECT epoch FROM current_epoch) as current_epoch
    FROM latest_update lu
    LEFT JOIN pool_stake ps ON ps.pool_hash_id = lu.pool_id
    LEFT JOIN epoch_stake es ON es.pool_id = lu.pool_id
    LEFT JOIN block_counts bc ON bc.pool_hash_id = lu.pool_id
  `, [poolId])

  if (result.rows.length === 0) {
    return null
  }

  const row = result.rows[0]

  return {
    activeStake: BigInt(row.active_stake || '0'),
    delegators: parseInt(row.delegator_count) || 0,
    blocksMinted: parseInt(row.blocks_epoch) || 0,
    lifetimeBlocks: parseInt(row.blocks_lifetime) || 0,
    margin: parseFloat(row.margin) * 100 || 0, // Convert to percentage
    pledge: BigInt(row.pledge || '0'),
    epoch: parseInt(row.current_epoch) || 0,
  }
}

/**
 * Query current network tip from DB-Sync
 */
export async function queryNetworkTip(): Promise<{
  blockNo: number
  slotNo: number
  hash: string
  time: Date
  epochNo: number
}> {
  const pool = getDBSyncPool()

  const result = await pool.query(`
    SELECT
      block_no,
      slot_no,
      encode(hash, 'hex') as hash,
      time,
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
    blockNo: parseInt(row.block_no),
    slotNo: parseInt(row.slot_no),
    hash: row.hash,
    time: new Date(row.time),
    epochNo: parseInt(row.epoch_no),
  }
}
