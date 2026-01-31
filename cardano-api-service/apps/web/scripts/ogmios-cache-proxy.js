#!/usr/bin/env node
/**
 * Ogmios WebSocket Caching Proxy
 *
 * This proxy sits between Kong and the Ogmios relay nodes, providing:
 * 1. Redis-based caching for stateless queries (queryNetwork/*, queryLedgerState/*)
 * 2. Persistent connections for stateful protocols (chain sync, mempool monitoring)
 * 3. Per-client message billing and rate limiting
 *
 * Load Balancing:
 * - Stateless queries: Per-request round-robin
 * - Stateful protocols: Per-client persistent connection
 *
 * Billing:
 * - Tracks messages per client (both directions)
 * - Reports usage to /api/usage/websocket every 30 seconds
 * - Rate limits per tier (FREE: 100/s, PAID: 500/s)
 *
 * Flow:
 *   Client → Kong → This Proxy → Redis Cache → Ogmios Relays
 *
 * Run with: node scripts/ogmios-cache-proxy.js
 */

const WebSocket = require("ws");
const Redis = require("ioredis");
const http = require("http");
const { Pool } = require("pg");

// Configuration
// Network-aware configuration: supports mainnet (default) and preprod
// Set OGMIOS_NETWORK=preprod to run as preprod proxy
const NETWORK = process.env.OGMIOS_NETWORK || "mainnet";
const PROXY_PORT = parseInt(process.env.OGMIOS_PROXY_PORT || (NETWORK === "preprod" ? "3002" : "3001"), 10);
const REDIS_URL = process.env.REDIS_URL || "redis://127.0.0.1:6379";
const CACHE_PREFIX = `ogmios:${NETWORK}:`;

// Billing configuration
const ENABLE_WS_BILLING = process.env.ENABLE_WS_BILLING !== "false"; // Default: enabled
const BILLING_ENDPOINT = process.env.BILLING_ENDPOINT || "http://localhost:3000/api/usage/websocket";
const BILLING_INTERVAL_MS = parseInt(process.env.BILLING_INTERVAL_MS || "30000", 10); // 30 seconds
const KONG_INTERNAL_SECRET = process.env.KONG_INTERNAL_SECRET || "";

// Rate limits by tier (messages per second)
const RATE_LIMITS = {
  FREE: 100,
  PAID: 500,
  ADMIN: Infinity,
};

// DB-Sync configuration for fast UTxO queries
// Only enabled for mainnet - preprod can use Ogmios directly
const DBSYNC_DATABASE_URL = process.env.DBSYNC_DATABASE_URL || "";
const DBSYNC_ENABLED = NETWORK === "mainnet" && !!DBSYNC_DATABASE_URL;
const DBSYNC_MAX_LAG_SECONDS = parseInt(process.env.DBSYNC_MAX_LAG_SECONDS || "120", 10);

// Network-specific Ogmios endpoints
const OGMIOS_ENDPOINTS = NETWORK === "preprod"
  ? [process.env.OGMIOS_PREPROD_HOST || "192.168.161.11:1337"]
  : [
      process.env.OGMIOS_HOST_1 || "192.168.160.11:1337",
      process.env.OGMIOS_HOST_2 || "192.168.160.12:1337",
    ];

// ============================================================================
// HEALTH CHECK CONFIGURATION
// Provides health-aware load balancing with automatic failover
// ============================================================================
const HEALTH_CONFIG = {
  // Passive health thresholds (based on actual request outcomes)
  FAILURES_TO_DEGRADED: parseInt(process.env.HEALTH_FAILURES_TO_DEGRADED || "2", 10),
  FAILURES_TO_UNHEALTHY: parseInt(process.env.HEALTH_FAILURES_TO_UNHEALTHY || "5", 10),
  SUCCESSES_TO_HEALTHY: parseInt(process.env.HEALTH_SUCCESSES_TO_HEALTHY || "3", 10),

  // Active health check settings
  ACTIVE_CHECK_INTERVAL_MS: parseInt(process.env.HEALTH_CHECK_INTERVAL_MS || "10000", 10),
  ACTIVE_CHECK_TIMEOUT_MS: parseInt(process.env.HEALTH_CHECK_TIMEOUT_MS || "5000", 10),
  ENABLE_ACTIVE_CHECKS: process.env.HEALTH_ACTIVE_CHECKS !== "false",

  // Circuit breaker settings
  CIRCUIT_OPEN_DURATION_MS: parseInt(process.env.HEALTH_CIRCUIT_DURATION_MS || "30000", 10),

  // Latency tracking for degraded state detection
  LATENCY_WINDOW_SIZE: parseInt(process.env.HEALTH_LATENCY_WINDOW || "10", 10),
  LATENCY_DEGRADED_THRESHOLD_MS: parseInt(process.env.HEALTH_LATENCY_THRESHOLD_MS || "5000", 10),

  // Request handling
  REQUEST_TIMEOUT_MS: parseInt(process.env.HEALTH_REQUEST_TIMEOUT_MS || "10000", 10),
  ENABLE_FAILOVER_RETRY: process.env.HEALTH_FAILOVER !== "false",
};

// Methods that require persistent connections (stateful protocols)
const STATEFUL_METHODS = new Set([
  "findIntersection",
  "nextBlock",
  "submitTransaction",
  "evaluateTransaction",
  "acquireMempool",
  "nextTransaction",
  "hasTransaction",
  "sizeOfMempool",
  "releaseMempool",
]);

// ============================================================================
// PREWARMED UTXO CACHE CONFIGURATION
// Proactively scrapes known high-traffic addresses and caches results
// Ensures instant responses for popular queries like DEX pool reserves
// ============================================================================
const PREWARM_CONFIG = {
  // Enabled by default for high-traffic DEX addresses (DB-Sync too slow for 1M+ historical outputs)
  enabled: process.env.PREWARM_ENABLED !== "false",
  // TTL must be > 2x scrape time to ensure overlap (Minswap takes ~45s to scrape)
  ttlSeconds: parseInt(process.env.PREWARM_TTL_SECONDS || "120", 10),
  // Rest ratio: 0.15 = 15% rest time for relays
  restRatio: parseFloat(process.env.PREWARM_REST_RATIO || "0.15"),
  // Addresses to prewarm - see docs/dex-address-analysis.md for full analysis
  // Adding more addresses increases cycle time and data staleness
  // Current: 1 address = ~30s cycle, 15-30s staleness
  // All 13 viable = ~394s cycle, up to 6.5min staleness
  addresses: [
    // Minswap V2 Pool Address (~3094 UTxOs, ~30s scrape)
    "addr1z84q0denmyep98ph3tmzwsmw0j7zau9ljmsqx6a4rvaau66j2c79gy9l76sdg0xwhd7r0c0kna0tycz4y5s6mlenh8pq777e2a",
    // SundaeSwap V3 Pool Address (~35769 UTxOs, ~30s scrape)
    "addr1zxj47sy4qxlktqzmkrw8dahe46gtv8seakrshsqz26qnvzypw288a4x0xf8pxgcntelxmyclq83s0ykeehchz2wtspksr3q9nx",
    // Other viable addresses (uncomment as needed):
    // WingRiders V1 (~1461 UTxOs, ~24s): "addr1wxr2a8htmzuhj39y2gq7ftkpxv98y2g67tg8zezthgq4jkg0a4ul4",
  ],
};

// Cache TTL configuration (in seconds)
// Strategy: Real-time for chain tip/blocks, moderate for ledger state, long for static data
// This ensures high-performance API access while protecting relay nodes from excessive load
const CACHE_CONFIG = {
  // ============================================================================
  // REAL-TIME CHAIN DATA (very short TTL - max 60 relay hits/min per method)
  // These are the most frequently queried - 1s cache still saves massive relay load
  // ============================================================================
  "queryNetwork/tip": 1,                           // 1s - chain tip, most common query
  "queryNetwork/blockHeight": 1,                   // 1s - current block height
  "queryLedgerState/protocolParameters": 10,       // 10s - fee calculations need freshness

  // ============================================================================
  // NEAR REAL-TIME (short TTL - for time-sensitive but not instant data)
  // ============================================================================
  "queryLedgerState/epoch": 30,                    // 30s - epoch boundary detection
  "queryLedgerState/rewardAccountSummaries": 30,   // 30s - delegation & reward queries
  "queryLedgerState/nonces": 30,                   // 30s - consensus nonces

  // ============================================================================
  // MODERATE FRESHNESS (changes throughout epoch but not per-block)
  // ============================================================================
  "queryLedgerState/stakePools": 120,              // 2m - pool registry updates
  "queryLedgerState/liveStakeDistribution": 120,   // 2m - stake distribution
  "queryLedgerState/treasuryAndReserves": 300,     // 5m - treasury balance
  "queryLedgerState/rewardsProvenance": 300,       // 5m - reward calculations

  // ============================================================================
  // GOVERNANCE DATA (Conway era - updates during voting periods)
  // ============================================================================
  "queryLedgerState/constitution": 300,            // 5m - on-chain constitution
  "queryLedgerState/constitutionalCommittee": 300, // 5m - committee members
  "queryLedgerState/delegateRepresentatives": 300, // 5m - DRep registry
  "queryLedgerState/governanceProposals": 300,     // 5m - active proposals

  // ============================================================================
  // EPOCH-BASED DATA (changes once per epoch ~5 days)
  // ============================================================================
  "queryLedgerState/projectedRewards": 1800,       // 30m - reward projections
  "queryLedgerState/stakePoolsPerformances": 1800, // 30m - pool performance metrics
  "queryLedgerState/operationalCertificates": 1800,// 30m - pool cert counters
  "queryLedgerState/proposedProtocolParameters": 1800, // 30m - pending param changes

  // ============================================================================
  // STATIC DATA (rarely changes - only at hard forks or era transitions)
  // ============================================================================
  "queryNetwork/genesisConfiguration": 86400,      // 24h - genesis config per era
  "queryNetwork/startTime": 86400,                 // 24h - chain start time
  "queryLedgerState/eraSummaries": 86400,          // 24h - era boundaries
  "queryLedgerState/eraStart": 86400,              // 24h - current era start
};

// Initialize Redis
const redis = new Redis(REDIS_URL, {
  maxRetriesPerRequest: 3,
  lazyConnect: false,
  enableOfflineQueue: true,
  connectTimeout: 5000,
});

let redisConnected = false;

redis.on("error", (err) => {
  console.error("Redis error:", err.message);
  redisConnected = false;
});

redis.on("connect", () => {
  console.log("Redis connected");
  redisConnected = true;
});

redis.on("close", () => {
  console.log("Redis connection closed");
  redisConnected = false;
});

// ============================================================================
// RELAY HEALTH TRACKING
// Tracks health state of each upstream Ogmios relay for intelligent routing
// ============================================================================
class RelayHealth {
  constructor(endpoint) {
    this.endpoint = endpoint;
    this.state = "healthy"; // 'healthy' | 'degraded' | 'unhealthy'

    // Failure tracking (passive health checking)
    this.consecutiveFailures = 0;
    this.consecutiveSuccesses = 0;
    this.lastFailureTime = null;
    this.lastSuccessTime = null;

    // Response time tracking for degraded state detection
    this.recentLatencies = [];
    this.avgLatency = 0;

    // Active health check state
    this.lastHealthCheckTime = 0;
    this.lastHealthCheckResult = null;

    // Circuit breaker state
    this.circuitOpenUntil = 0;
  }
}

// Initialize health tracking for each relay
const relayHealth = {};
OGMIOS_ENDPOINTS.forEach((ep) => {
  relayHealth[ep] = new RelayHealth(ep);
});

/**
 * Record a successful request to a relay
 * Updates health state and tracks latency
 */
function recordSuccess(endpoint, latencyMs) {
  const health = relayHealth[endpoint];
  if (!health) return;

  health.consecutiveSuccesses++;
  health.consecutiveFailures = 0;
  health.lastSuccessTime = Date.now();

  // Track latency in sliding window
  health.recentLatencies.push(latencyMs);
  if (health.recentLatencies.length > HEALTH_CONFIG.LATENCY_WINDOW_SIZE) {
    health.recentLatencies.shift();
  }
  health.avgLatency =
    health.recentLatencies.reduce((a, b) => a + b, 0) /
    health.recentLatencies.length;

  // State transitions
  if (health.state === "unhealthy" || health.state === "degraded") {
    if (health.consecutiveSuccesses >= HEALTH_CONFIG.SUCCESSES_TO_HEALTHY) {
      console.log(
        `[HEALTH] ${endpoint} recovered → healthy (${health.consecutiveSuccesses} consecutive successes)`
      );
      health.state = "healthy";
      health.circuitOpenUntil = 0;
    }
  } else if (
    health.state === "healthy" &&
    health.avgLatency > HEALTH_CONFIG.LATENCY_DEGRADED_THRESHOLD_MS
  ) {
    console.log(
      `[HEALTH] ${endpoint} high latency (${health.avgLatency.toFixed(0)}ms avg) → degraded`
    );
    health.state = "degraded";
  }

  // Update stats
  stats.relaySuccesses = stats.relaySuccesses || {};
  stats.relaySuccesses[endpoint] = (stats.relaySuccesses[endpoint] || 0) + 1;
}

/**
 * Record a failed request to a relay
 * Updates health state and triggers circuit breaker if needed
 */
function recordFailure(endpoint, reason) {
  const health = relayHealth[endpoint];
  if (!health) return;

  health.consecutiveFailures++;
  health.consecutiveSuccesses = 0;
  health.lastFailureTime = Date.now();

  console.warn(
    `[HEALTH] ${endpoint} failure #${health.consecutiveFailures}: ${reason}`
  );

  // State transitions
  if (health.state === "healthy") {
    if (health.consecutiveFailures >= HEALTH_CONFIG.FAILURES_TO_DEGRADED) {
      console.warn(`[HEALTH] ${endpoint} → degraded`);
      health.state = "degraded";
    }
  } else if (health.state === "degraded") {
    if (health.consecutiveFailures >= HEALTH_CONFIG.FAILURES_TO_UNHEALTHY) {
      console.error(
        `[HEALTH] ${endpoint} → unhealthy (circuit open for ${HEALTH_CONFIG.CIRCUIT_OPEN_DURATION_MS}ms)`
      );
      health.state = "unhealthy";
      health.circuitOpenUntil =
        Date.now() + HEALTH_CONFIG.CIRCUIT_OPEN_DURATION_MS;
    }
  }

  // Update stats
  stats.relayFailures = stats.relayFailures || {};
  stats.relayFailures[endpoint] = (stats.relayFailures[endpoint] || 0) + 1;
}

// ============================================================================
// DB-SYNC CONNECTION POOL - For fast UTxO queries (~175ms vs ~27s via Ogmios)
// ============================================================================
let dbSyncPool = null;
let dbSyncConnected = false;
let dbSyncLastHealthCheck = 0;
let dbSyncHealthy = false;

if (DBSYNC_ENABLED) {
  dbSyncPool = new Pool({
    connectionString: DBSYNC_DATABASE_URL,
    max: 10,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 10000,
  });

  dbSyncPool.on("error", (err) => {
    console.error("DB-Sync pool error:", err.message);
    dbSyncConnected = false;
    dbSyncHealthy = false;
  });

  dbSyncPool.on("connect", () => {
    console.log("DB-Sync pool connected");
    dbSyncConnected = true;
  });

  // Test connection on startup
  dbSyncPool.query("SELECT 1").then(() => {
    dbSyncConnected = true;
    dbSyncHealthy = true;
    console.log("DB-Sync connection verified");
  }).catch((err) => {
    console.error("DB-Sync initial connection failed:", err.message);
    dbSyncConnected = false;
    dbSyncHealthy = false;
  });
}

/**
 * Check if DB-Sync is healthy and reasonably synced
 * Caches result for 30 seconds to avoid excessive queries
 */
async function checkDBSyncHealth() {
  if (!DBSYNC_ENABLED || !dbSyncPool) {
    return false;
  }

  const now = Date.now();
  if (now - dbSyncLastHealthCheck < 30000) {
    return dbSyncHealthy;
  }

  try {
    const result = await dbSyncPool.query(`
      SELECT time FROM block ORDER BY id DESC LIMIT 1
    `);

    if (result.rows.length === 0) {
      dbSyncHealthy = false;
      return false;
    }

    const blockTime = new Date(result.rows[0].time);
    const lagSeconds = (now - blockTime.getTime()) / 1000;
    dbSyncHealthy = lagSeconds < DBSYNC_MAX_LAG_SECONDS;
    dbSyncLastHealthCheck = now;

    if (!dbSyncHealthy) {
      console.warn(`[DB-SYNC] Unhealthy: ${lagSeconds.toFixed(0)}s behind chain tip (max: ${DBSYNC_MAX_LAG_SECONDS}s)`);
    }

    return dbSyncHealthy;
  } catch (err) {
    console.error("[DB-SYNC] Health check failed:", err.message);
    dbSyncHealthy = false;
    return false;
  }
}

/**
 * Query UTxOs from DB-Sync with full Ogmios-compatible data
 * Includes native tokens, datums, and reference scripts
 */
async function queryUtxosFromDBSync(addresses, outputReferences) {
  if (!dbSyncPool) {
    throw new Error("DB-Sync not configured");
  }

  const results = [];

  // Query by addresses
  if (addresses && addresses.length > 0) {
    const addressQuery = `
      SELECT
        encode(tx.hash, 'hex') as tx_hash,
        txo.index as output_index,
        txo.address,
        txo.value as lovelace,
        -- Native tokens (JSON aggregation)
        COALESCE(
          (SELECT json_agg(json_build_object(
            'policy_id', encode(ma.policy, 'hex'),
            'asset_name', encode(ma.name, 'hex'),
            'quantity', mto.quantity::text
          ))
          FROM ma_tx_out mto
          JOIN multi_asset ma ON ma.id = mto.ident
          WHERE mto.tx_out_id = txo.id),
          '[]'::json
        ) as native_tokens,
        -- Datum hash (from data_hash column)
        encode(txo.data_hash, 'hex') as datum_hash,
        -- Inline datum (from inline_datum_id → datum table)
        encode(d.bytes, 'hex') as inline_datum,
        -- Reference script
        encode(s.bytes, 'hex') as reference_script,
        s.type as script_type
      FROM utxo_view txo
      JOIN tx ON tx.id = txo.tx_id
      LEFT JOIN datum d ON d.id = txo.inline_datum_id
      LEFT JOIN script s ON s.id = txo.reference_script_id
      WHERE txo.address = ANY($1)
      ORDER BY tx.id DESC, txo.index ASC
    `;

    const result = await dbSyncPool.query(addressQuery, [addresses]);
    results.push(...result.rows);
  }

  // Query by output references (tx_hash + index)
  if (outputReferences && outputReferences.length > 0) {
    for (const ref of outputReferences) {
      const txHash = ref.transaction?.id || ref.txId;
      const index = ref.index;

      if (!txHash || index === undefined) continue;

      const refQuery = `
        SELECT
          encode(tx.hash, 'hex') as tx_hash,
          txo.index as output_index,
          txo.address,
          txo.value as lovelace,
          COALESCE(
            (SELECT json_agg(json_build_object(
              'policy_id', encode(ma.policy, 'hex'),
              'asset_name', encode(ma.name, 'hex'),
              'quantity', mto.quantity::text
            ))
            FROM ma_tx_out mto
            JOIN multi_asset ma ON ma.id = mto.ident
            WHERE mto.tx_out_id = txo.id),
            '[]'::json
          ) as native_tokens,
          encode(txo.data_hash, 'hex') as datum_hash,
          encode(d.bytes, 'hex') as inline_datum,
          encode(s.bytes, 'hex') as reference_script,
          s.type as script_type
        FROM utxo_view txo
        JOIN tx ON tx.id = txo.tx_id
        LEFT JOIN datum d ON d.id = txo.inline_datum_id
        LEFT JOIN script s ON s.id = txo.reference_script_id
        WHERE tx.hash = decode($1, 'hex') AND txo.index = $2
      `;

      const result = await dbSyncPool.query(refQuery, [txHash, index]);
      results.push(...result.rows);
    }
  }

  return results;
}

/**
 * Transform DB-Sync query results to Ogmios response format
 */
function transformToOgmiosFormat(dbRows) {
  return dbRows.map((row) => {
    // Build value object with ADA and native tokens
    const value = {
      ada: { lovelace: Number(row.lovelace) },
    };

    // Add native tokens
    const nativeTokens = row.native_tokens || [];
    for (const token of nativeTokens) {
      if (!token.policy_id) continue;
      if (!value[token.policy_id]) {
        value[token.policy_id] = {};
      }
      value[token.policy_id][token.asset_name] = Number(token.quantity);
    }

    // Build the UTxO object
    const utxo = {
      transaction: { id: row.tx_hash },
      index: Number(row.output_index),
      address: row.address,
      value,
    };

    // Add optional datum fields
    if (row.inline_datum) {
      utxo.datum = row.inline_datum;
    }
    if (row.datum_hash && !row.inline_datum) {
      utxo.datumHash = row.datum_hash;
    }

    // Add reference script if present
    if (row.reference_script) {
      utxo.script = {
        language: mapScriptType(row.script_type),
        cbor: row.reference_script,
      };
    }

    return utxo;
  });
}

/**
 * Map DB-Sync script type to Ogmios script language
 */
function mapScriptType(dbType) {
  const typeMap = {
    plutusV1: "plutus:v1",
    plutusV2: "plutus:v2",
    plutusV3: "plutus:v3",
    timelock: "native",
    multisig: "native",
  };
  return typeMap[dbType] || "native";
}

// ============================================================================
// ASSET-BASED UTxO FILTERING (NACHO Extension)
// Filter UTxOs by policy ID and optional asset name for efficient DEX queries
// ============================================================================

/**
 * Validate asset filter parameters
 * @param {object[]} assets - Array of asset filters
 * @returns {{ valid: boolean, error?: string }}
 */
function validateAssetFilters(assets) {
  if (!assets) return { valid: true };
  if (!Array.isArray(assets)) {
    return { valid: false, error: "assets must be an array" };
  }
  if (assets.length === 0) return { valid: true };
  if (assets.length > 100) {
    return { valid: false, error: "assets limited to 100 items" };
  }

  for (const filter of assets) {
    if (!filter || typeof filter !== "object") {
      return { valid: false, error: "Each asset filter must be an object" };
    }
    if (!filter.policyId || typeof filter.policyId !== "string") {
      return { valid: false, error: "Each asset filter requires a policyId string" };
    }
    if (!/^[a-fA-F0-9]{56}$/.test(filter.policyId)) {
      return { valid: false, error: `Invalid policyId: ${filter.policyId} (must be 56 hex characters)` };
    }
    if (filter.assetName !== undefined) {
      if (typeof filter.assetName !== "string") {
        return { valid: false, error: "assetName must be a string" };
      }
      if (!/^[a-fA-F0-9]*$/.test(filter.assetName)) {
        return { valid: false, error: `Invalid assetName: ${filter.assetName} (must be hex-encoded)` };
      }
    }
  }
  return { valid: true };
}

/**
 * Filter UTxOs by asset criteria
 *
 * Filter semantics:
 * - policyId only: Match UTxOs containing ANY asset with that policy
 * - policyId + assetName: Match UTxOs containing that EXACT asset
 * - Multiple filters: OR logic (match any filter)
 *
 * @param {object[]} utxos - Array of UTxOs in Ogmios format
 * @param {object[]} assetFilters - Array of { policyId, assetName? } filters
 * @returns {object[]} Filtered UTxOs
 */
function filterUtxosByAssets(utxos, assetFilters) {
  if (!assetFilters || assetFilters.length === 0) {
    return utxos;
  }

  return utxos.filter(utxo => {
    // Check if this UTxO matches ANY of the asset filters (OR logic)
    return assetFilters.some(filter => {
      // Look for the policy ID in the UTxO's value object
      const policyAssets = utxo.value?.[filter.policyId];
      if (!policyAssets) return false;

      // If no specific asset name, any asset under this policy matches
      if (!filter.assetName) return true;

      // Check for exact asset name match
      return filter.assetName in policyAssets;
    });
  });
}

// Round-robin counter for load balancing
let currentEndpoint = 0;

/**
 * Health-aware endpoint selection
 * Priority: healthy > half-open (circuit test) > degraded > force-try oldest circuit
 */
function getNextOgmiosEndpoint() {
  const now = Date.now();

  // Build lists of endpoints by health state
  const healthy = [];
  const degraded = [];
  const halfOpen = [];

  for (const endpoint of OGMIOS_ENDPOINTS) {
    const health = relayHealth[endpoint];

    if (health.state === "healthy") {
      healthy.push(endpoint);
    } else if (health.state === "degraded") {
      degraded.push(endpoint);
    } else if (health.state === "unhealthy") {
      // Check if circuit breaker timeout has passed (half-open state)
      if (now >= health.circuitOpenUntil) {
        halfOpen.push(endpoint);
      }
      // Otherwise skip - circuit is open
    }
  }

  // Priority: healthy > half-open (one at a time for testing) > degraded
  let candidates = healthy;

  if (candidates.length === 0 && halfOpen.length > 0) {
    // Try one half-open endpoint for circuit breaker test
    candidates = [halfOpen[0]];
    console.log(`[HEALTH] Testing half-open relay: ${halfOpen[0]}`);
  }

  if (candidates.length === 0) {
    candidates = degraded;
  }

  if (candidates.length === 0) {
    // All relays are unhealthy with open circuits
    console.error("[HEALTH] No healthy relays available!");
    stats.noHealthyRelays = (stats.noHealthyRelays || 0) + 1;

    // Force try the relay with the oldest circuit open time (closest to recovery)
    const oldestCircuit = OGMIOS_ENDPOINTS.map((ep) => ({
      ep,
      until: relayHealth[ep].circuitOpenUntil,
    })).sort((a, b) => a.until - b.until)[0];

    return oldestCircuit.ep;
  }

  // Round-robin among available candidates
  currentEndpoint = (currentEndpoint + 1) % candidates.length;
  return candidates[currentEndpoint % candidates.length];
}

/**
 * Get an endpoint for failover, excluding the one that just failed
 */
function getFailoverEndpoint(excludeEndpoint) {
  const now = Date.now();

  const candidates = OGMIOS_ENDPOINTS.filter((ep) => {
    if (ep === excludeEndpoint) return false;
    const health = relayHealth[ep];
    // Allow healthy, degraded, or half-open (circuit timeout passed)
    return health.state !== "unhealthy" || now >= health.circuitOpenUntil;
  });

  if (candidates.length === 0) {
    return null; // No failover available
  }

  // Prefer healthy over degraded
  const healthyCandidates = candidates.filter(
    (ep) => relayHealth[ep].state === "healthy"
  );
  if (healthyCandidates.length > 0) {
    return healthyCandidates[0];
  }

  return candidates[0];
}

// Generate cache key from request (network-aware)
// Excludes 'assets' parameter for UTxO queries so filtering is applied post-cache
function getCacheKey(method, params) {
  let cacheParams = params;

  // For UTxO queries, exclude the 'assets' filter from cache key
  // This allows us to cache the full result and filter on retrieval
  if (method === "queryLedgerState/utxo" && params?.assets) {
    const { assets, ...rest } = params;
    cacheParams = rest;
  }

  const paramsStr = cacheParams ? JSON.stringify(cacheParams) : "{}";
  return `${CACHE_PREFIX}${method}:${paramsStr}`;
}

// Check cache for a request
async function checkCache(method, params) {
  const ttl = CACHE_CONFIG[method];
  if (!ttl) return null; // Not cacheable

  try {
    const key = getCacheKey(method, params);
    const cached = await redis.get(key);
    if (cached) {
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error("Cache check error:", err);
  }
  return null;
}

// Store response in cache
async function setCache(method, params, result) {
  const ttl = CACHE_CONFIG[method];
  if (!ttl || !result) return;

  try {
    const key = getCacheKey(method, params);
    await redis.setex(key, ttl, JSON.stringify(result));
  } catch (err) {
    console.error("Cache set error:", err);
  }
}

// Stats tracking
const stats = {
  connections: 0,
  requests: 0,
  cacheHits: 0,
  cacheMisses: 0,
  errors: 0,
  relayRequests: {},
  chainSyncConnections: 0,
  chainSyncBlocks: 0,
  // Billing stats
  billingReports: 0,
  billingErrors: 0,
  rateLimited: 0,
  messagesSent: 0,
  messagesReceived: 0,
  // DB-Sync stats
  dbSyncQueries: 0,
  dbSyncErrors: 0,
  dbSyncFallbacks: 0,
};

// Initialize relay request counters
OGMIOS_ENDPOINTS.forEach(ep => {
  stats.relayRequests[ep] = 0;
});

// ============================================================================
// RATE LIMITER - Sliding window algorithm for per-client rate limiting
// ============================================================================
class RateLimiter {
  constructor(limit, windowMs = 1000) {
    this.limit = limit;
    this.windowMs = windowMs;
    this.timestamps = [];
  }

  tryConsume() {
    const now = Date.now();
    // Remove timestamps outside the window
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);

    if (this.timestamps.length >= this.limit) {
      return false; // Rate limited
    }

    this.timestamps.push(now);
    return true; // Allowed
  }

  getRemaining() {
    const now = Date.now();
    this.timestamps = this.timestamps.filter(t => now - t < this.windowMs);
    return Math.max(0, this.limit - this.timestamps.length);
  }
}

// ============================================================================
// CLIENT CONTEXT TRACKING - Per-client billing and rate limiting state
// ============================================================================
const clientContexts = new Map();

// Report WebSocket usage to billing endpoint
async function reportWebSocketUsage(ctx, isPartial = false) {
  if (!ENABLE_WS_BILLING || !ctx.apiKeyId || !ctx.userId) {
    return; // Skip if billing disabled or no auth info
  }

  const now = Date.now();
  const totalMessages = ctx.messages.sent + ctx.messages.received;
  const messagesSinceLastReport = totalMessages - (ctx.lastReportedTotal || 0);

  if (messagesSinceLastReport <= 0) {
    return; // Nothing new to report
  }

  const payload = {
    apiKeyId: ctx.apiKeyId,
    userId: ctx.userId,
    tier: ctx.tier,
    network: NETWORK,
    clientId: ctx.clientId,
    isPartial,
    connectionDuration: now - ctx.connectedAt,
    messages: {
      sent: ctx.messages.sent - (ctx.lastReportedSent || 0),
      received: ctx.messages.received - (ctx.lastReportedReceived || 0),
      cacheHits: ctx.messages.cacheHits - (ctx.lastReportedCacheHits || 0),
      cacheMisses: ctx.messages.cacheMisses - (ctx.lastReportedCacheMisses || 0),
      rateLimited: ctx.messages.rateLimited - (ctx.lastReportedRateLimited || 0),
      methods: { ...ctx.messages.methods },
    },
    timestamp: new Date().toISOString(),
  };

  try {
    const response = await fetch(BILLING_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Secret": KONG_INTERNAL_SECRET,
      },
      body: JSON.stringify(payload),
    });

    if (response.ok) {
      stats.billingReports++;
      // Update last reported values
      ctx.lastReportedTotal = totalMessages;
      ctx.lastReportedSent = ctx.messages.sent;
      ctx.lastReportedReceived = ctx.messages.received;
      ctx.lastReportedCacheHits = ctx.messages.cacheHits;
      ctx.lastReportedCacheMisses = ctx.messages.cacheMisses;
      ctx.lastReportedRateLimited = ctx.messages.rateLimited;
      ctx.lastReportedAt = now;
      // Clear per-method counts after reporting
      ctx.messages.methods = {};
    } else {
      console.error(`[BILLING] Failed to report usage: ${response.status}`);
      stats.billingErrors++;
    }
  } catch (err) {
    console.error(`[BILLING] Error reporting usage: ${err.message}`);
    stats.billingErrors++;
  }
}

// Periodic billing reporter - runs every BILLING_INTERVAL_MS
setInterval(async () => {
  if (!ENABLE_WS_BILLING) return;

  for (const [clientId, ctx] of clientContexts) {
    if (ctx.apiKeyId) {
      const totalMessages = ctx.messages.sent + ctx.messages.received;
      const messagesSinceLastReport = totalMessages - (ctx.lastReportedTotal || 0);
      if (messagesSinceLastReport > 0) {
        await reportWebSocketUsage(ctx, true);
      }
    }
  }
}, BILLING_INTERVAL_MS);

// ============================================================================
// ACTIVE HEALTH CHECKS
// Periodically probe all relay endpoints to detect failures proactively
// ============================================================================

/**
 * Perform a lightweight health probe to an Ogmios relay
 * Uses queryNetwork/tip as it's fast and always available
 */
function performHealthProbe(endpoint) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${endpoint}`);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error("Health probe timeout"));
      }
    }, HEALTH_CONFIG.ACTIVE_CHECK_TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method: "queryNetwork/tip",
          id: "health-check",
        })
      );
    });

    ws.on("message", (data) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);
      ws.close();

      try {
        const response = JSON.parse(data.toString());
        if (response.result) {
          resolve(response.result);
        } else {
          reject(new Error(response.error?.message || "Unknown error"));
        }
      } catch (err) {
        reject(err);
      }
    });

    ws.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    ws.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error("Connection closed during health probe"));
      }
    });
  });
}

/**
 * Run active health checks on all relay endpoints
 * Runs periodically to detect relay failures before user requests hit them
 */
async function runActiveHealthChecks() {
  if (!HEALTH_CONFIG.ENABLE_ACTIVE_CHECKS) return;

  for (const endpoint of OGMIOS_ENDPOINTS) {
    const health = relayHealth[endpoint];
    const now = Date.now();

    // Skip if checked recently
    if (now - health.lastHealthCheckTime < HEALTH_CONFIG.ACTIVE_CHECK_INTERVAL_MS) {
      continue;
    }

    // Skip if circuit is open (unless it's time for half-open test)
    if (health.state === "unhealthy" && now < health.circuitOpenUntil) {
      continue;
    }

    try {
      const startTime = Date.now();
      await performHealthProbe(endpoint);
      const latency = Date.now() - startTime;

      health.lastHealthCheckTime = now;
      health.lastHealthCheckResult = { success: true, latency };

      // Record as success (helps recover from unhealthy state)
      if (health.state !== "healthy") {
        console.log(
          `[HEALTH] Active probe: ${endpoint} responded in ${latency}ms`
        );
        recordSuccess(endpoint, latency);
      }
    } catch (err) {
      health.lastHealthCheckTime = now;
      health.lastHealthCheckResult = { success: false, error: err.message };

      console.warn(
        `[HEALTH] Active probe failed for ${endpoint}: ${err.message}`
      );

      // Record failure if relay was previously healthy/degraded
      if (health.state !== "unhealthy") {
        recordFailure(endpoint, `active_probe: ${err.message}`);
      }
    }
  }
}

// Start active health check interval
if (HEALTH_CONFIG.ENABLE_ACTIVE_CHECKS) {
  setInterval(runActiveHealthChecks, HEALTH_CONFIG.ACTIVE_CHECK_INTERVAL_MS);
  console.log(
    `[HEALTH] Active health checks enabled (interval: ${HEALTH_CONFIG.ACTIVE_CHECK_INTERVAL_MS}ms)`
  );
}

// ============================================================================
// PREWARMED UTXO CACHE - Proactive scraping for known high-traffic addresses
// Ensures instant responses for popular queries like DEX pool reserves
// ============================================================================

// Prewarm stats
const prewarmStats = {
  totalScrapes: 0,
  successfulScrapes: 0,
  failedScrapes: 0,
  lastScrapeTime: null,
  lastScrapeDuration: 0,
  avgScrapeDuration: 0,
  cacheHits: 0,
};

// Track which relay to use next for prewarming (round-robin)
let prewarmRelayIndex = 0;

/**
 * Get cache key for prewarmed UTxO data
 */
function getPrewarmCacheKey(address) {
  return `${CACHE_PREFIX}utxo:prewarmed:${address}`;
}

/**
 * Check if prewarmed cache exists for an address
 */
async function checkPrewarmCache(address) {
  if (!PREWARM_CONFIG.enabled) return null;

  try {
    const key = getPrewarmCacheKey(address);
    const cached = await redis.get(key);
    if (cached) {
      prewarmStats.cacheHits++;
      return JSON.parse(cached);
    }
  } catch (err) {
    console.error("[PREWARM] Cache check error:", err.message);
  }
  return null;
}

/**
 * Store prewarmed UTxO data in cache
 */
async function setPrewarmCache(address, data) {
  try {
    const key = getPrewarmCacheKey(address);
    await redis.setex(key, PREWARM_CONFIG.ttlSeconds, JSON.stringify(data));
  } catch (err) {
    console.error("[PREWARM] Cache set error:", err.message);
  }
}

/**
 * Scrape UTxOs for a single address via Ogmios
 * Also queries the network tip to record the exact slot/height of the snapshot
 * Uses a specific relay endpoint for load distribution
 */
function scrapeAddressUtxos(address, relayEndpoint) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(`ws://${relayEndpoint}`);
    let resolved = false;
    const startTime = Date.now();
    let tipData = null;
    let utxoData = null;
    let pendingRequests = 2; // tip + utxo

    // 2 minute timeout for large responses
    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error("Scrape timeout"));
      }
    }, 120000);

    const checkComplete = () => {
      if (tipData !== null && utxoData !== null) {
        resolved = true;
        clearTimeout(timeout);
        ws.close();

        const duration = Date.now() - startTime;
        resolve({
          result: utxoData,
          tip: tipData,
          duration,
          relay: relayEndpoint,
        });
      }
    };

    ws.on("open", () => {
      // Query tip first to get the slot/height
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "queryNetwork/tip",
        id: "prewarm-tip",
      }));
      // Query UTxOs
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method: "queryLedgerState/utxo",
        params: { addresses: [address] },
        id: "prewarm-utxo",
      }));
    });

    ws.on("message", (data) => {
      if (resolved) return;

      try {
        const response = JSON.parse(data.toString());

        if (response.error) {
          resolved = true;
          clearTimeout(timeout);
          ws.close();
          reject(new Error(response.error.message || "Ogmios error"));
          return;
        }

        if (response.id === "prewarm-tip") {
          tipData = response.result;
          checkComplete();
        } else if (response.id === "prewarm-utxo") {
          utxoData = response.result;
          checkComplete();
        }
      } catch (err) {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          ws.close();
          reject(err);
        }
      }
    });

    ws.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(err);
      }
    });

    ws.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        reject(new Error("Connection closed"));
      }
    });
  });
}

/**
 * Get next relay for prewarming (round-robin across healthy relays)
 */
function getNextPrewarmRelay() {
  const healthyRelays = OGMIOS_ENDPOINTS.filter(ep => {
    const health = relayHealth[ep];
    return health.state === "healthy" || health.state === "degraded";
  });

  if (healthyRelays.length === 0) {
    // Fall back to any relay
    return OGMIOS_ENDPOINTS[prewarmRelayIndex % OGMIOS_ENDPOINTS.length];
  }

  prewarmRelayIndex = (prewarmRelayIndex + 1) % healthyRelays.length;
  return healthyRelays[prewarmRelayIndex];
}

/**
 * Run a single prewarm cycle for all configured addresses
 */
async function runPrewarmCycle() {
  if (!PREWARM_CONFIG.enabled || PREWARM_CONFIG.addresses.length === 0) {
    return;
  }

  for (const address of PREWARM_CONFIG.addresses) {
    const relay = getNextPrewarmRelay();
    const shortAddr = `${address.slice(0, 15)}...${address.slice(-8)}`;

    prewarmStats.totalScrapes++;

    try {
      const startTime = Date.now();
      const { result, tip, duration } = await scrapeAddressUtxos(address, relay);

      // Store in cache with tip metadata for precise chainsync alignment
      const cacheData = {
        utxos: result,
        slot: tip?.slot || null,
        height: tip?.height || null,
        hash: tip?.id || null,
        cachedAt: Date.now(),
      };
      await setPrewarmCache(address, cacheData);

      prewarmStats.successfulScrapes++;
      prewarmStats.lastScrapeTime = Date.now();
      prewarmStats.lastScrapeDuration = duration;

      // Update rolling average
      prewarmStats.avgScrapeDuration = prewarmStats.avgScrapeDuration === 0
        ? duration
        : (prewarmStats.avgScrapeDuration * 0.8 + duration * 0.2);

      console.log(
        `[PREWARM] ${shortAddr} via ${relay}: ${result.length} UTxOs at slot ${tip?.slot} in ${duration}ms`
      );

      // Record success for relay health
      recordSuccess(relay, duration);

    } catch (err) {
      prewarmStats.failedScrapes++;
      console.error(`[PREWARM] ${shortAddr} via ${relay} failed: ${err.message}`);

      // Record failure for relay health
      recordFailure(relay, `prewarm: ${err.message}`);
    }

    // Small delay between addresses to avoid hammering relays
    await new Promise(resolve => setTimeout(resolve, 500));
  }
}

/**
 * Calculate optimal prewarm interval based on query time and rest ratio
 * Formula: interval = (avgQueryTime / (1 - restRatio)) / numRelays
 */
function calculatePrewarmInterval() {
  // Use measured average or default to 10 seconds
  const avgQueryTime = prewarmStats.avgScrapeDuration || 10000;
  const cycleTime = avgQueryTime / (1 - PREWARM_CONFIG.restRatio);
  const interval = cycleTime / OGMIOS_ENDPOINTS.length;

  // Clamp between 5 seconds and 60 seconds
  return Math.max(5000, Math.min(60000, interval));
}

/**
 * Start the prewarm scheduler with adaptive intervals
 */
function startPrewarmScheduler() {
  if (!PREWARM_CONFIG.enabled || PREWARM_CONFIG.addresses.length === 0) {
    console.log("[PREWARM] Disabled or no addresses configured");
    return;
  }

  console.log(`[PREWARM] Starting scheduler for ${PREWARM_CONFIG.addresses.length} addresses`);
  console.log(`[PREWARM] TTL: ${PREWARM_CONFIG.ttlSeconds}s, Rest ratio: ${PREWARM_CONFIG.restRatio * 100}%`);

  // Run first cycle immediately
  runPrewarmCycle();

  // Schedule subsequent cycles with adaptive intervals
  const scheduleNext = () => {
    const interval = calculatePrewarmInterval();
    setTimeout(async () => {
      await runPrewarmCycle();
      scheduleNext();
    }, interval);
  };

  // Start scheduling after a short delay for first cycle to complete
  setTimeout(scheduleNext, 15000);
}

// Make a single request to an upstream Ogmios relay (for stateless queries)
// Wrapper that initiates request with optional failover retry
function forwardToRelay(method, params, requestId) {
  return forwardToRelayWithRetry(method, params, requestId, null, 0);
}

/**
 * Forward request to relay with health tracking and automatic failover
 * @param {string} method - Ogmios JSON-RPC method
 * @param {object} params - Method parameters
 * @param {string} requestId - Request ID
 * @param {string|null} excludeEndpoint - Endpoint to exclude (for failover)
 * @param {number} attemptCount - Current attempt number (0 = first try)
 */
function forwardToRelayWithRetry(
  method,
  params,
  requestId,
  excludeEndpoint,
  attemptCount
) {
  return new Promise((resolve, reject) => {
    const endpoint = excludeEndpoint
      ? getFailoverEndpoint(excludeEndpoint)
      : getNextOgmiosEndpoint();

    if (!endpoint) {
      reject(new Error("No available relay endpoints"));
      return;
    }

    stats.relayRequests[endpoint] = (stats.relayRequests[endpoint] || 0) + 1;
    const startTime = Date.now();

    const ws = new WebSocket(`ws://${endpoint}`);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();

        // Record failure for health tracking
        recordFailure(endpoint, "timeout");

        // Attempt failover if enabled and this was first attempt
        if (HEALTH_CONFIG.ENABLE_FAILOVER_RETRY && attemptCount === 0) {
          console.log(
            `[FAILOVER] Retrying on alternate relay after ${endpoint} timeout`
          );
          stats.failoverAttempts = (stats.failoverAttempts || 0) + 1;

          forwardToRelayWithRetry(
            method,
            params,
            requestId,
            endpoint,
            attemptCount + 1
          )
            .then(resolve)
            .catch(reject);
        } else {
          reject(new Error(`Timeout connecting to ${endpoint}`));
        }
      }
    }, HEALTH_CONFIG.REQUEST_TIMEOUT_MS);

    ws.on("open", () => {
      ws.send(
        JSON.stringify({
          jsonrpc: "2.0",
          method,
          params: params || {},
          id: requestId,
        })
      );
    });

    ws.on("message", async (data) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      const latency = Date.now() - startTime;

      try {
        const response = JSON.parse(data.toString());

        // Record success for health tracking
        recordSuccess(endpoint, latency);

        // Cache successful responses
        if (response.result) {
          await setCache(method, params, response.result);
        }

        ws.close();
        resolve(response);
      } catch (err) {
        ws.close();
        recordFailure(endpoint, "parse_error");
        reject(err);
      }
    });

    ws.on("error", (err) => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);

        // Record failure for health tracking
        recordFailure(endpoint, err.message);

        // Attempt failover if enabled and this was first attempt
        if (HEALTH_CONFIG.ENABLE_FAILOVER_RETRY && attemptCount === 0) {
          console.log(
            `[FAILOVER] Retrying on alternate relay after ${endpoint} error: ${err.message}`
          );
          stats.failoverAttempts = (stats.failoverAttempts || 0) + 1;

          forwardToRelayWithRetry(
            method,
            params,
            requestId,
            endpoint,
            attemptCount + 1
          )
            .then(resolve)
            .catch(reject);
        } else {
          reject(err);
        }
      }
    });

    ws.on("close", () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        recordFailure(endpoint, "connection_closed");
        reject(new Error(`Connection closed unexpectedly to ${endpoint}`));
      }
    });
  });
}

// Create a persistent upstream connection for stateful protocols
function createPersistentUpstream(clientWs, clientId, clientCtx) {
  const endpoint = getNextOgmiosEndpoint();
  stats.relayRequests[endpoint]++;
  stats.chainSyncConnections++;

  console.log(`[CHAIN SYNC] Client ${clientId} → ${endpoint}`);

  const upstreamWs = new WebSocket(`ws://${endpoint}`);

  upstreamWs.on("open", () => {
    console.log(`[CHAIN SYNC] Upstream connected for client ${clientId}`);
  });

  // Forward all messages from upstream to client
  upstreamWs.on("message", (data) => {
    if (clientWs.readyState === WebSocket.OPEN) {
      // Track blocks for stats
      try {
        const msg = JSON.parse(data.toString());
        if (msg.result && msg.result.direction === "forward") {
          stats.chainSyncBlocks++;
        }
      } catch {}

      // Note: clientWs.send is wrapped, so this will increment received count
      clientWs.send(data);
    }
  });

  upstreamWs.on("error", (err) => {
    console.error(`[CHAIN SYNC] Upstream error for client ${clientId}:`, err.message);
  });

  upstreamWs.on("close", () => {
    console.log(`[CHAIN SYNC] Upstream closed for client ${clientId}`);
    stats.chainSyncConnections--;
    // Close client connection if upstream dies
    if (clientWs.readyState === WebSocket.OPEN) {
      clientWs.close();
    }
  });

  return upstreamWs;
}

// Generate Prometheus metrics format
function generatePrometheusMetrics() {
  const lines = [];

  // Network label for all metrics
  const networkLabel = `network="${NETWORK}"`;

  // Connection metrics
  lines.push("# HELP ogmios_proxy_connections_active Current number of active WebSocket connections");
  lines.push("# TYPE ogmios_proxy_connections_active gauge");
  lines.push(`ogmios_proxy_connections_active{${networkLabel}} ${stats.connections}`);

  // Request metrics
  lines.push("# HELP ogmios_proxy_requests_total Total number of requests processed");
  lines.push("# TYPE ogmios_proxy_requests_total counter");
  lines.push(`ogmios_proxy_requests_total{${networkLabel}} ${stats.requests}`);

  // Cache metrics
  lines.push("# HELP ogmios_proxy_cache_hits_total Total number of cache hits");
  lines.push("# TYPE ogmios_proxy_cache_hits_total counter");
  lines.push(`ogmios_proxy_cache_hits_total{${networkLabel}} ${stats.cacheHits}`);

  lines.push("# HELP ogmios_proxy_cache_misses_total Total number of cache misses");
  lines.push("# TYPE ogmios_proxy_cache_misses_total counter");
  lines.push(`ogmios_proxy_cache_misses_total{${networkLabel}} ${stats.cacheMisses}`);

  // Cache hit ratio (calculated)
  const totalCacheRequests = stats.cacheHits + stats.cacheMisses;
  const hitRatio = totalCacheRequests > 0 ? stats.cacheHits / totalCacheRequests : 0;
  lines.push("# HELP ogmios_proxy_cache_hit_ratio Ratio of cache hits to total cacheable requests");
  lines.push("# TYPE ogmios_proxy_cache_hit_ratio gauge");
  lines.push(`ogmios_proxy_cache_hit_ratio{${networkLabel}} ${hitRatio.toFixed(4)}`);

  // Error metrics
  lines.push("# HELP ogmios_proxy_errors_total Total number of errors");
  lines.push("# TYPE ogmios_proxy_errors_total counter");
  lines.push(`ogmios_proxy_errors_total{${networkLabel}} ${stats.errors}`);

  // Relay request metrics (per-relay)
  lines.push("# HELP ogmios_proxy_relay_requests_total Total requests forwarded to each relay");
  lines.push("# TYPE ogmios_proxy_relay_requests_total counter");
  for (const [relay, count] of Object.entries(stats.relayRequests)) {
    lines.push(`ogmios_proxy_relay_requests_total{${networkLabel},relay="${relay}"} ${count}`);
  }

  // Chain sync metrics
  lines.push("# HELP ogmios_proxy_chain_sync_connections_active Current number of chain sync connections");
  lines.push("# TYPE ogmios_proxy_chain_sync_connections_active gauge");
  lines.push(`ogmios_proxy_chain_sync_connections_active{${networkLabel}} ${stats.chainSyncConnections}`);

  lines.push("# HELP ogmios_proxy_chain_sync_blocks_total Total number of chain sync blocks forwarded");
  lines.push("# TYPE ogmios_proxy_chain_sync_blocks_total counter");
  lines.push(`ogmios_proxy_chain_sync_blocks_total{${networkLabel}} ${stats.chainSyncBlocks}`);

  // Uptime
  lines.push("# HELP ogmios_proxy_uptime_seconds Proxy uptime in seconds");
  lines.push("# TYPE ogmios_proxy_uptime_seconds gauge");
  lines.push(`ogmios_proxy_uptime_seconds{${networkLabel}} ${process.uptime().toFixed(2)}`);

  // Redis connection status
  lines.push("# HELP ogmios_proxy_redis_connected Redis connection status (1=connected, 0=disconnected)");
  lines.push("# TYPE ogmios_proxy_redis_connected gauge");
  lines.push(`ogmios_proxy_redis_connected{${networkLabel}} ${redisConnected ? 1 : 0}`);

  // Rate limiting metrics
  lines.push("# HELP ogmios_proxy_rate_limited_total Total number of rate limited requests");
  lines.push("# TYPE ogmios_proxy_rate_limited_total counter");
  lines.push(`ogmios_proxy_rate_limited_total{${networkLabel}} ${stats.rateLimited}`);

  // Message metrics
  lines.push("# HELP ogmios_proxy_messages_sent_total Total messages received from clients");
  lines.push("# TYPE ogmios_proxy_messages_sent_total counter");
  lines.push(`ogmios_proxy_messages_sent_total{${networkLabel}} ${stats.messagesSent}`);

  lines.push("# HELP ogmios_proxy_messages_received_total Total messages sent to clients");
  lines.push("# TYPE ogmios_proxy_messages_received_total counter");
  lines.push(`ogmios_proxy_messages_received_total{${networkLabel}} ${stats.messagesReceived}`);

  // Billing metrics
  lines.push("# HELP ogmios_proxy_billing_reports_total Total billing reports sent");
  lines.push("# TYPE ogmios_proxy_billing_reports_total counter");
  lines.push(`ogmios_proxy_billing_reports_total{${networkLabel}} ${stats.billingReports}`);

  lines.push("# HELP ogmios_proxy_billing_errors_total Total billing report errors");
  lines.push("# TYPE ogmios_proxy_billing_errors_total counter");
  lines.push(`ogmios_proxy_billing_errors_total{${networkLabel}} ${stats.billingErrors}`);

  // DB-Sync metrics
  lines.push("# HELP ogmios_proxy_dbsync_queries_total Total DB-Sync UTxO queries");
  lines.push("# TYPE ogmios_proxy_dbsync_queries_total counter");
  lines.push(`ogmios_proxy_dbsync_queries_total{${networkLabel}} ${stats.dbSyncQueries}`);

  lines.push("# HELP ogmios_proxy_dbsync_errors_total Total DB-Sync query errors");
  lines.push("# TYPE ogmios_proxy_dbsync_errors_total counter");
  lines.push(`ogmios_proxy_dbsync_errors_total{${networkLabel}} ${stats.dbSyncErrors}`);

  lines.push("# HELP ogmios_proxy_dbsync_fallbacks_total Total fallbacks to Ogmios for UTxO queries");
  lines.push("# TYPE ogmios_proxy_dbsync_fallbacks_total counter");
  lines.push(`ogmios_proxy_dbsync_fallbacks_total{${networkLabel}} ${stats.dbSyncFallbacks}`);

  lines.push("# HELP ogmios_proxy_dbsync_connected DB-Sync connection status (1=connected, 0=disconnected)");
  lines.push("# TYPE ogmios_proxy_dbsync_connected gauge");
  lines.push(`ogmios_proxy_dbsync_connected{${networkLabel}} ${dbSyncConnected ? 1 : 0}`);

  lines.push("# HELP ogmios_proxy_dbsync_healthy DB-Sync health status (1=healthy, 0=unhealthy/lagging)");
  lines.push("# TYPE ogmios_proxy_dbsync_healthy gauge");
  lines.push(`ogmios_proxy_dbsync_healthy{${networkLabel}} ${dbSyncHealthy ? 1 : 0}`);

  // ============================================================================
  // RELAY HEALTH METRICS
  // ============================================================================

  // Per-relay health status (0=unhealthy, 1=degraded, 2=healthy)
  lines.push(
    "# HELP ogmios_proxy_relay_health Relay health status (0=unhealthy, 1=degraded, 2=healthy)"
  );
  lines.push("# TYPE ogmios_proxy_relay_health gauge");
  for (const [relay, health] of Object.entries(relayHealth)) {
    const stateValue = { unhealthy: 0, degraded: 1, healthy: 2 }[health.state];
    lines.push(
      `ogmios_proxy_relay_health{${networkLabel},relay="${relay}"} ${stateValue}`
    );
  }

  // Per-relay consecutive failures
  lines.push(
    "# HELP ogmios_proxy_relay_consecutive_failures Current consecutive failure count per relay"
  );
  lines.push("# TYPE ogmios_proxy_relay_consecutive_failures gauge");
  for (const [relay, health] of Object.entries(relayHealth)) {
    lines.push(
      `ogmios_proxy_relay_consecutive_failures{${networkLabel},relay="${relay}"} ${health.consecutiveFailures}`
    );
  }

  // Per-relay average latency
  lines.push(
    "# HELP ogmios_proxy_relay_avg_latency_ms Average latency per relay in milliseconds"
  );
  lines.push("# TYPE ogmios_proxy_relay_avg_latency_ms gauge");
  for (const [relay, health] of Object.entries(relayHealth)) {
    lines.push(
      `ogmios_proxy_relay_avg_latency_ms{${networkLabel},relay="${relay}"} ${health.avgLatency.toFixed(2)}`
    );
  }

  // Per-relay success count
  lines.push(
    "# HELP ogmios_proxy_relay_successes_total Total successful requests per relay"
  );
  lines.push("# TYPE ogmios_proxy_relay_successes_total counter");
  for (const relay of OGMIOS_ENDPOINTS) {
    const count = stats.relaySuccesses?.[relay] || 0;
    lines.push(
      `ogmios_proxy_relay_successes_total{${networkLabel},relay="${relay}"} ${count}`
    );
  }

  // Per-relay failure count
  lines.push(
    "# HELP ogmios_proxy_relay_failures_total Total failed requests per relay"
  );
  lines.push("# TYPE ogmios_proxy_relay_failures_total counter");
  for (const relay of OGMIOS_ENDPOINTS) {
    const count = stats.relayFailures?.[relay] || 0;
    lines.push(
      `ogmios_proxy_relay_failures_total{${networkLabel},relay="${relay}"} ${count}`
    );
  }

  // Failover attempts
  lines.push(
    "# HELP ogmios_proxy_failover_attempts_total Total failover retry attempts"
  );
  lines.push("# TYPE ogmios_proxy_failover_attempts_total counter");
  lines.push(
    `ogmios_proxy_failover_attempts_total{${networkLabel}} ${stats.failoverAttempts || 0}`
  );

  // No healthy relays events
  lines.push(
    "# HELP ogmios_proxy_no_healthy_relays_total Times when no healthy relay was available"
  );
  lines.push("# TYPE ogmios_proxy_no_healthy_relays_total counter");
  lines.push(
    `ogmios_proxy_no_healthy_relays_total{${networkLabel}} ${stats.noHealthyRelays || 0}`
  );

  // Circuit breaker state per relay
  lines.push(
    "# HELP ogmios_proxy_circuit_open Circuit breaker open state (1=open, 0=closed)"
  );
  lines.push("# TYPE ogmios_proxy_circuit_open gauge");
  for (const [relay, health] of Object.entries(relayHealth)) {
    const isOpen =
      health.state === "unhealthy" && Date.now() < health.circuitOpenUntil
        ? 1
        : 0;
    lines.push(
      `ogmios_proxy_circuit_open{${networkLabel},relay="${relay}"} ${isOpen}`
    );
  }

  // ============================================================================
  // PREWARM CACHE METRICS
  // ============================================================================
  lines.push(
    "# HELP ogmios_proxy_prewarm_enabled Prewarm cache enabled status (1=enabled, 0=disabled)"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_enabled gauge");
  lines.push(
    `ogmios_proxy_prewarm_enabled{${networkLabel}} ${PREWARM_CONFIG.enabled ? 1 : 0}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_addresses_total Number of addresses configured for prewarming"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_addresses_total gauge");
  lines.push(
    `ogmios_proxy_prewarm_addresses_total{${networkLabel}} ${PREWARM_CONFIG.addresses.length}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_scrapes_total Total prewarm scrape attempts"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_scrapes_total counter");
  lines.push(
    `ogmios_proxy_prewarm_scrapes_total{${networkLabel}} ${prewarmStats.totalScrapes}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_scrapes_successful_total Total successful prewarm scrapes"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_scrapes_successful_total counter");
  lines.push(
    `ogmios_proxy_prewarm_scrapes_successful_total{${networkLabel}} ${prewarmStats.successfulScrapes}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_scrapes_failed_total Total failed prewarm scrapes"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_scrapes_failed_total counter");
  lines.push(
    `ogmios_proxy_prewarm_scrapes_failed_total{${networkLabel}} ${prewarmStats.failedScrapes}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_cache_hits_total Total cache hits from prewarmed data"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_cache_hits_total counter");
  lines.push(
    `ogmios_proxy_prewarm_cache_hits_total{${networkLabel}} ${prewarmStats.cacheHits}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_last_scrape_duration_ms Duration of last prewarm scrape in milliseconds"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_last_scrape_duration_ms gauge");
  lines.push(
    `ogmios_proxy_prewarm_last_scrape_duration_ms{${networkLabel}} ${prewarmStats.lastScrapeDuration}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_avg_scrape_duration_ms Rolling average scrape duration in milliseconds"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_avg_scrape_duration_ms gauge");
  lines.push(
    `ogmios_proxy_prewarm_avg_scrape_duration_ms{${networkLabel}} ${prewarmStats.avgScrapeDuration.toFixed(2)}`
  );

  lines.push(
    "# HELP ogmios_proxy_prewarm_ttl_seconds Configured TTL for prewarmed cache"
  );
  lines.push("# TYPE ogmios_proxy_prewarm_ttl_seconds gauge");
  lines.push(
    `ogmios_proxy_prewarm_ttl_seconds{${networkLabel}} ${PREWARM_CONFIG.ttlSeconds}`
  );

  return lines.join("\n") + "\n";
}

// Handle HTTP POST JSON-RPC requests (for non-WebSocket clients)
async function handleHttpJsonRpc(req, res) {
  let body = "";
  req.on("data", chunk => body += chunk);
  req.on("end", async () => {
    try {
      const request = JSON.parse(body);
      const { method, params, id } = request;

      stats.requests++;

      // Check if method is stateful (not allowed over HTTP)
      if (STATEFUL_METHODS.has(method)) {
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32600, message: "Stateful methods require WebSocket connection" },
          id,
        }));
        return;
      }

      // ASSET FILTER VALIDATION for UTxO queries (NACHO extension)
      const assetFilters = params?.assets;
      if (method === "queryLedgerState/utxo" && assetFilters) {
        const validation = validateAssetFilters(assetFilters);
        if (!validation.valid) {
          res.writeHead(400, { "Content-Type": "application/json" });
          res.end(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32602, message: validation.error },
            id,
          }));
          return;
        }
      }

      // PREWARMED UTxO CACHE CHECK for HTTP requests
      if (method === "queryLedgerState/utxo" && PREWARM_CONFIG.enabled) {
        const addresses = params?.addresses || [];

        if (addresses.length === 1 && PREWARM_CONFIG.addresses.includes(addresses[0])) {
          const cachedData = await checkPrewarmCache(addresses[0]);
          if (cachedData !== null) {
            stats.cacheHits++;
            // Handle both old format (array) and new format (object with metadata)
            const utxos = Array.isArray(cachedData) ? cachedData : cachedData.utxos;
            // Apply asset filter if specified
            const filteredResult = filterUtxosByAssets(utxos, assetFilters);
            // Build response with cache metadata if available
            const response = {
              jsonrpc: "2.0",
              method,
              result: filteredResult,
              id,
            };
            // Include cache metadata for chainsync alignment (NACHO extension)
            if (!Array.isArray(cachedData) && cachedData.slot) {
              response._cache = {
                slot: cachedData.slot,
                height: cachedData.height,
                hash: cachedData.hash,
                age: Math.round((Date.now() - cachedData.cachedAt) / 1000),
              };
            }
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(response));
            return;
          }
        }
      }

      // DB-SYNC UTxO INTERCEPTION for HTTP requests
      if (method === "queryLedgerState/utxo" && DBSYNC_ENABLED) {
        const dbSyncHealthy = await checkDBSyncHealth();

        if (dbSyncHealthy) {
          try {
            const addresses = params?.addresses || [];
            const outputRefs = params?.outputReferences || [];

            const dbRows = await queryUtxosFromDBSync(addresses, outputRefs);
            let result = transformToOgmiosFormat(dbRows);

            // Apply asset filter if specified
            result = filterUtxosByAssets(result, assetFilters);

            stats.dbSyncQueries++;

            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify({
              jsonrpc: "2.0",
              method,
              result,
              id,
            }));
            return;
          } catch (err) {
            console.error(`[HTTP DB-SYNC UTxO] Error:`, err.message);
            stats.dbSyncErrors++;
            // Will be blocked below if not in cache
          }
        }
      }

      // Check cache first
      const cached = await checkCache(method, params);
      if (cached !== null) {
        stats.cacheHits++;
        // Apply asset filter for UTxO queries if specified
        const cachedResult = (method === "queryLedgerState/utxo" && assetFilters)
          ? filterUtxosByAssets(cached, assetFilters)
          : cached;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          method,
          result: cachedResult,
          id,
        }));
        return;
      }

      stats.cacheMisses++;

      // BLOCK UTxO queries from reaching relay - must use prewarmed cache or DB-Sync
      // This protects relay nodes from expensive UTxO queries
      if (method === "queryLedgerState/utxo") {
        console.log(`[HTTP] Blocked UTxO query - not in cache or DB-Sync`);
        res.writeHead(400, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32600,
            message: "UTxO queries for this address are not available. Use a prewarmed address (e.g., Minswap) or query via GraphQL."
          },
          id,
        }));
        return;
      }

      // Forward non-UTxO queries to relay
      try {
        const response = await forwardToRelay(method, params, id);
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify(response));
      } catch (err) {
        console.error(`[HTTP RELAY ERROR] ${method}: ${err.message}`);
        stats.errors++;
        res.writeHead(502, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          error: { code: -32603, message: "Failed to connect to upstream" },
          id,
        }));
      }
    } catch (err) {
      console.error("HTTP JSON-RPC parse error:", err.message);
      stats.errors++;
      res.writeHead(400, { "Content-Type": "application/json" });
      res.end(JSON.stringify({
        jsonrpc: "2.0",
        error: { code: -32700, message: "Parse error" },
        id: null,
      }));
    }
  });
}

// Create HTTP server for health checks and HTTP JSON-RPC
const server = http.createServer((req, res) => {
  // Handle POST requests as JSON-RPC
  if (req.method === "POST" && (req.url === "/" || req.url === "")) {
    handleHttpJsonRpc(req, res);
    return;
  }

  if (req.url === "/health") {
    // Calculate relay health summary
    const healthyRelays = Object.values(relayHealth).filter(
      (h) => h.state === "healthy"
    ).length;
    const totalRelays = OGMIOS_ENDPOINTS.length;

    // Return 503 if no healthy relays (service degraded)
    const statusCode = healthyRelays === 0 ? 503 : 200;
    const status = healthyRelays === 0 ? "degraded" : "ok";

    res.writeHead(statusCode, { "Content-Type": "application/json" });
    res.end(
      JSON.stringify({
        status,
        network: NETWORK,
        relays: {
          healthy: healthyRelays,
          total: totalRelays,
          details: Object.fromEntries(
            Object.entries(relayHealth).map(([ep, h]) => [
              ep,
              {
                state: h.state,
                consecutiveFailures: h.consecutiveFailures,
                consecutiveSuccesses: h.consecutiveSuccesses,
                avgLatency: h.avgLatency.toFixed(0),
                lastSuccess: h.lastSuccessTime,
                lastFailure: h.lastFailureTime,
                circuitOpenUntil:
                  h.state === "unhealthy" ? h.circuitOpenUntil : null,
              },
            ])
          ),
        },
        prewarm: {
          enabled: PREWARM_CONFIG.enabled,
          addresses: PREWARM_CONFIG.addresses.length,
          ttlSeconds: PREWARM_CONFIG.ttlSeconds,
          restRatio: PREWARM_CONFIG.restRatio,
          stats: prewarmStats,
        },
        stats,
        uptime: process.uptime(),
      })
    );
  } else if (req.url === "/stats") {
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ network: NETWORK, ...stats }));
  } else if (req.url === "/metrics") {
    res.writeHead(200, { "Content-Type": "text/plain; version=0.0.4; charset=utf-8" });
    res.end(generatePrometheusMetrics());
  } else {
    res.writeHead(404);
    res.end("Not Found");
  }
});

// Create WebSocket server
const wss = new WebSocket.Server({ server });

let clientIdCounter = 0;

wss.on("connection", (clientWs, req) => {
  stats.connections++;
  const clientId = ++clientIdCounter;
  const clientIp = req.headers["x-forwarded-for"] || req.socket.remoteAddress;

  // Capture Kong auth headers (available during WebSocket upgrade)
  const apiKeyId = req.headers["x-api-key-id"] || null;
  const userId = req.headers["x-user-id"] || null;
  const tier = (req.headers["x-api-tier"] || "FREE").toUpperCase();

  // Create client context for billing and rate limiting
  const clientContext = {
    clientId,
    apiKeyId,
    userId,
    tier,
    ip: clientIp,
    connectedAt: Date.now(),
    lastReportedAt: Date.now(),
    lastReportedTotal: 0,
    lastReportedSent: 0,
    lastReportedReceived: 0,
    lastReportedCacheHits: 0,
    lastReportedCacheMisses: 0,
    lastReportedRateLimited: 0,
    messages: {
      sent: 0,
      received: 0,
      cacheHits: 0,
      cacheMisses: 0,
      rateLimited: 0,
      methods: {},
    },
    rateLimiter: new RateLimiter(RATE_LIMITS[tier] || RATE_LIMITS.FREE),
  };

  clientContexts.set(clientId, clientContext);

  console.log(`[CONNECT] Client ${clientId} from ${clientIp} (tier: ${tier}, apiKey: ${apiKeyId ? "yes" : "no"}, total: ${stats.connections})`);

  // Wrap clientWs.send to count outgoing messages
  const originalSend = clientWs.send.bind(clientWs);
  clientWs.send = (data, options, callback) => {
    const ctx = clientContexts.get(clientId);
    if (ctx) {
      ctx.messages.received++;
      stats.messagesReceived++;
    }
    return originalSend(data, options, callback);
  };

  // Persistent upstream connection (created on first stateful request)
  let persistentUpstream = null;

  // Handle messages from client
  clientWs.on("message", async (data) => {
    stats.requests++;
    const ctx = clientContexts.get(clientId);

    // Track incoming message
    if (ctx) {
      ctx.messages.sent++;
      stats.messagesSent++;
    }

    try {
      const request = JSON.parse(data.toString());
      const { method, params, id } = request;

      // Track method usage
      if (ctx) {
        ctx.messages.methods[method] = (ctx.messages.methods[method] || 0) + 1;
      }

      // Check rate limit BEFORE processing
      if (ctx && !ctx.rateLimiter.tryConsume()) {
        ctx.messages.rateLimited++;
        stats.rateLimited++;
        clientWs.send(JSON.stringify({
          jsonrpc: "2.0",
          error: {
            code: -32029,
            message: "Rate limit exceeded. Please slow down.",
            data: {
              retryAfter: 1000,
              remaining: 0,
              limit: RATE_LIMITS[ctx.tier] || RATE_LIMITS.FREE,
            },
          },
          id,
        }));
        return; // Don't process the message
      }

      // ASSET FILTER VALIDATION for UTxO queries (NACHO extension)
      const assetFilters = params?.assets;
      if (method === "queryLedgerState/utxo" && assetFilters) {
        const validation = validateAssetFilters(assetFilters);
        if (!validation.valid) {
          if (clientWs.readyState === WebSocket.OPEN) {
            clientWs.send(JSON.stringify({
              jsonrpc: "2.0",
              error: { code: -32602, message: validation.error },
              id,
            }));
          }
          return;
        }
      }

      // Check if this is a stateful method
      if (STATEFUL_METHODS.has(method)) {
        // Create persistent upstream if not exists
        if (!persistentUpstream || persistentUpstream.readyState !== WebSocket.OPEN) {
          persistentUpstream = createPersistentUpstream(clientWs, clientId, ctx);

          // Wait for connection
          await new Promise((resolve, reject) => {
            const timeout = setTimeout(() => reject(new Error("Upstream connection timeout")), 10000);
            persistentUpstream.once("open", () => {
              clearTimeout(timeout);
              resolve();
            });
            persistentUpstream.once("error", (err) => {
              clearTimeout(timeout);
              reject(err);
            });
          });
        }

        // Forward to persistent upstream
        if (persistentUpstream.readyState === WebSocket.OPEN) {
          persistentUpstream.send(data);
        } else {
          throw new Error("Upstream not connected");
        }
        return;
      }

      // ============================================================================
      // PREWARMED UTxO CACHE CHECK - Instant response for known addresses
      // Check if any requested address has prewarmed data in cache
      // ============================================================================
      if (method === "queryLedgerState/utxo" && PREWARM_CONFIG.enabled) {
        const addresses = params?.addresses || [];

        // Check if we have exactly one address that's in our prewarm list
        if (addresses.length === 1 && PREWARM_CONFIG.addresses.includes(addresses[0])) {
          const cachedData = await checkPrewarmCache(addresses[0]);
          if (cachedData !== null) {
            stats.cacheHits++;
            if (ctx) ctx.messages.cacheHits++;

            // Handle both old format (array) and new format (object with metadata)
            const utxos = Array.isArray(cachedData) ? cachedData : cachedData.utxos;
            // Apply asset filter if specified
            const filteredResult = filterUtxosByAssets(utxos, assetFilters);

            const response = {
              jsonrpc: "2.0",
              method,
              result: filteredResult,
              id,
            };
            // Include cache metadata for chainsync alignment (NACHO extension)
            if (!Array.isArray(cachedData) && cachedData.slot) {
              response._cache = {
                slot: cachedData.slot,
                height: cachedData.height,
                hash: cachedData.hash,
                age: Math.round((Date.now() - cachedData.cachedAt) / 1000),
              };
            }

            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify(response));
            }
            return;
          }
        }
      }

      // ============================================================================
      // DB-SYNC UTxO INTERCEPTION - ~175ms vs ~27s via Ogmios
      // Transparently handle UTxO queries via DB-Sync for massive performance gain
      // Falls back to Ogmios if DB-Sync is unavailable or unhealthy
      // ============================================================================
      if (method === "queryLedgerState/utxo" && DBSYNC_ENABLED) {
        const dbSyncHealthy = await checkDBSyncHealth();

        if (dbSyncHealthy) {
          try {
            const addresses = params?.addresses || [];
            const outputRefs = params?.outputReferences || [];

            const startTime = Date.now();
            const dbRows = await queryUtxosFromDBSync(addresses, outputRefs);
            let result = transformToOgmiosFormat(dbRows);

            // Apply asset filter if specified
            result = filterUtxosByAssets(result, assetFilters);

            const queryTime = Date.now() - startTime;

            stats.dbSyncQueries++;

            const response = {
              jsonrpc: "2.0",
              method,
              result,
              id,
            };

            if (clientWs.readyState === WebSocket.OPEN) {
              clientWs.send(JSON.stringify(response));
            }

            // Log performance for monitoring
            if (queryTime > 500) {
              console.log(`[DB-SYNC UTxO] Slow query: ${queryTime}ms for ${addresses.length} addresses, ${result.length} UTxOs`);
            }

            return;
          } catch (err) {
            console.error(`[DB-SYNC UTxO] Error:`, err.message);
            stats.dbSyncErrors++;
            // Will be blocked below if not in cache
          }
        } else {
          console.log(`[DB-SYNC] Unhealthy for UTxO query`);
        }
      }

      // Stateless query - use caching
      const cached = await checkCache(method, params);
      if (cached !== null) {
        stats.cacheHits++;
        if (ctx) ctx.messages.cacheHits++;
        // Apply asset filter for UTxO queries if specified
        const cachedResult = (method === "queryLedgerState/utxo" && assetFilters)
          ? filterUtxosByAssets(cached, assetFilters)
          : cached;
        const response = {
          jsonrpc: "2.0",
          method,
          result: cachedResult,
          id,
        };
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(response));
        }
        return;
      }

      stats.cacheMisses++;
      if (ctx) ctx.messages.cacheMisses++;

      // BLOCK UTxO queries from reaching relay - must use prewarmed cache or DB-Sync
      // This protects relay nodes from expensive UTxO queries
      if (method === "queryLedgerState/utxo") {
        console.log(`[WS] Blocked UTxO query - not in cache or DB-Sync`);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            jsonrpc: "2.0",
            error: {
              code: -32600,
              message: "UTxO queries for this address are not available. Use a prewarmed address (e.g., Minswap) or query via GraphQL."
            },
            id,
          }));
        }
        return;
      }

      // Forward non-UTxO queries to relay (per-request load balancing)
      try {
        const response = await forwardToRelay(method, params, id);
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(response));
        }
      } catch (err) {
        console.error(`[RELAY ERROR] ${method}: ${err.message}`);
        stats.errors++;
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify({
            jsonrpc: "2.0",
            error: { code: -32603, message: "Failed to connect to upstream" },
            id,
          }));
        }
      }
    } catch (err) {
      console.error("Error processing client message:", err);
      stats.errors++;
    }
  });

  clientWs.on("close", async () => {
    stats.connections--;
    const ctx = clientContexts.get(clientId);

    // Report final usage before cleanup
    if (ctx && ctx.apiKeyId) {
      await reportWebSocketUsage(ctx, false);
    }

    console.log(`[DISCONNECT] Client ${clientId} (msgs: ${ctx?.messages.sent || 0}/${ctx?.messages.received || 0}, remaining: ${stats.connections})`);

    // Cleanup
    clientContexts.delete(clientId);

    // Close persistent upstream if exists
    if (persistentUpstream && persistentUpstream.readyState === WebSocket.OPEN) {
      persistentUpstream.close();
    }
  });

  clientWs.on("error", (err) => {
    console.error(`[CLIENT ERROR] Client ${clientId}:`, err.message);
    stats.errors++;
  });
});

/**
 * Perform startup health check on all relay endpoints
 * Sets initial health state before accepting connections
 */
async function performStartupHealthCheck() {
  console.log("[HEALTH] Performing startup health check...");

  for (const endpoint of OGMIOS_ENDPOINTS) {
    try {
      const startTime = Date.now();
      await performHealthProbe(endpoint);
      const latency = Date.now() - startTime;

      relayHealth[endpoint].state = "healthy";
      relayHealth[endpoint].lastSuccessTime = Date.now();
      relayHealth[endpoint].avgLatency = latency;
      relayHealth[endpoint].recentLatencies = [latency];

      console.log(`[HEALTH] ${endpoint} - healthy (${latency}ms)`);
    } catch (err) {
      relayHealth[endpoint].state = "unhealthy";
      relayHealth[endpoint].circuitOpenUntil =
        Date.now() + HEALTH_CONFIG.CIRCUIT_OPEN_DURATION_MS;
      relayHealth[endpoint].lastFailureTime = Date.now();
      relayHealth[endpoint].consecutiveFailures = HEALTH_CONFIG.FAILURES_TO_UNHEALTHY;

      console.error(`[HEALTH] ${endpoint} - unhealthy (${err.message})`);
    }
  }

  const healthyCount = Object.values(relayHealth).filter(
    (h) => h.state === "healthy"
  ).length;
  console.log(
    `[HEALTH] Startup check complete: ${healthyCount}/${OGMIOS_ENDPOINTS.length} healthy`
  );

  if (healthyCount === 0) {
    console.warn("[HEALTH] WARNING: No healthy relays at startup!");
  }
}

// Start server with startup health check
performStartupHealthCheck().then(() => {
  // Start prewarm scheduler after health check
  startPrewarmScheduler();

  server.listen(PROXY_PORT, () => {
    console.log("=".repeat(60));
    console.log(`Ogmios Caching Proxy [${NETWORK.toUpperCase()}]`);
    console.log("=".repeat(60));
    console.log(`Network: ${NETWORK}`);
    console.log(`Listening on port ${PROXY_PORT}`);
    console.log(`Redis: ${REDIS_URL}`);
    console.log(`Cache prefix: ${CACHE_PREFIX}`);
    console.log(`Upstreams: ${OGMIOS_ENDPOINTS.join(", ")}`);
    console.log("");
    console.log("Modes:");
    console.log("  Stateless queries: Health-aware load balancing + Redis cache");
    console.log("  Chain sync/mempool: Persistent upstream connection");
    console.log("");
    console.log(`Cacheable methods: ${Object.keys(CACHE_CONFIG).length}`);
    console.log(`Stateful methods: ${STATEFUL_METHODS.size}`);
    console.log("");
    console.log("Health Checking:");
    console.log(`  Active checks: ${HEALTH_CONFIG.ENABLE_ACTIVE_CHECKS ? "enabled" : "disabled"}`);
    console.log(`  Check interval: ${HEALTH_CONFIG.ACTIVE_CHECK_INTERVAL_MS}ms`);
    console.log(`  Failover retry: ${HEALTH_CONFIG.ENABLE_FAILOVER_RETRY ? "enabled" : "disabled"}`);
    console.log(`  Request timeout: ${HEALTH_CONFIG.REQUEST_TIMEOUT_MS}ms`);
    console.log(`  Circuit breaker: ${HEALTH_CONFIG.CIRCUIT_OPEN_DURATION_MS}ms`);
    console.log("");
    console.log("Billing:");
    console.log(`  Enabled: ${ENABLE_WS_BILLING}`);
    console.log(`  Endpoint: ${BILLING_ENDPOINT}`);
    console.log(`  Interval: ${BILLING_INTERVAL_MS / 1000}s`);
    console.log("");
    console.log("Rate Limits (msg/sec):");
    console.log(`  FREE: ${RATE_LIMITS.FREE}`);
    console.log(`  PAID: ${RATE_LIMITS.PAID}`);
    console.log("");
    console.log("DB-Sync (fast UTxO queries):");
    console.log(`  Enabled: ${DBSYNC_ENABLED}`);
    if (DBSYNC_ENABLED) {
      console.log(`  Max lag: ${DBSYNC_MAX_LAG_SECONDS}s`);
      console.log("  Performance: ~175ms vs ~27s via Ogmios");
    }
    console.log("");
    console.log("Prewarmed UTxO Cache:");
    console.log(`  Enabled: ${PREWARM_CONFIG.enabled}`);
    if (PREWARM_CONFIG.enabled) {
      console.log(`  Addresses: ${PREWARM_CONFIG.addresses.length}`);
      console.log(`  TTL: ${PREWARM_CONFIG.ttlSeconds}s`);
      console.log(`  Rest ratio: ${PREWARM_CONFIG.restRatio * 100}%`);
    }
    console.log("=".repeat(60));
    console.log("");
    console.log("Endpoints:");
    console.log(`  WebSocket: ws://localhost:${PROXY_PORT}`);
    console.log(`  Health:    http://localhost:${PROXY_PORT}/health`);
    console.log(`  Stats:     http://localhost:${PROXY_PORT}/stats`);
    console.log(`  Metrics:   http://localhost:${PROXY_PORT}/metrics`);
    console.log("");
  });
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  wss.close();
  server.close();
  redis.quit();
  if (dbSyncPool) dbSyncPool.end();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  wss.close();
  server.close();
  redis.quit();
  if (dbSyncPool) dbSyncPool.end();
  process.exit(0);
});
