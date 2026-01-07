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

// Network-specific Ogmios endpoints
const OGMIOS_ENDPOINTS = NETWORK === "preprod"
  ? [process.env.OGMIOS_PREPROD_HOST || "192.168.161.11:1337"]
  : [
      process.env.OGMIOS_HOST_1 || "192.168.160.11:1337",
      process.env.OGMIOS_HOST_2 || "192.168.160.12:1337",
    ];

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

// Round-robin counter for load balancing
let currentEndpoint = 0;

function getNextOgmiosEndpoint() {
  const endpoint = OGMIOS_ENDPOINTS[currentEndpoint];
  currentEndpoint = (currentEndpoint + 1) % OGMIOS_ENDPOINTS.length;
  return endpoint;
}

// Generate cache key from request (network-aware)
function getCacheKey(method, params) {
  const paramsStr = params ? JSON.stringify(params) : "{}";
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

// Make a single request to an upstream Ogmios relay (for stateless queries)
function forwardToRelay(method, params, requestId) {
  return new Promise((resolve, reject) => {
    const endpoint = getNextOgmiosEndpoint();
    stats.relayRequests[endpoint]++;

    const ws = new WebSocket(`ws://${endpoint}`);
    let resolved = false;

    const timeout = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        ws.close();
        reject(new Error(`Timeout connecting to ${endpoint}`));
      }
    }, 30000);

    ws.on("open", () => {
      ws.send(JSON.stringify({
        jsonrpc: "2.0",
        method,
        params: params || {},
        id: requestId,
      }));
    });

    ws.on("message", async (data) => {
      if (resolved) return;
      resolved = true;
      clearTimeout(timeout);

      try {
        const response = JSON.parse(data.toString());

        // Cache successful responses
        if (response.result) {
          await setCache(method, params, response.result);
        }

        ws.close();
        resolve(response);
      } catch (err) {
        ws.close();
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

      // Check cache first
      const cached = await checkCache(method, params);
      if (cached !== null) {
        stats.cacheHits++;
        res.writeHead(200, { "Content-Type": "application/json" });
        res.end(JSON.stringify({
          jsonrpc: "2.0",
          method,
          result: cached,
          id,
        }));
        return;
      }

      stats.cacheMisses++;

      // Forward to relay
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
    res.writeHead(200, { "Content-Type": "application/json" });
    res.end(JSON.stringify({
      status: "ok",
      network: NETWORK,
      stats,
      uptime: process.uptime(),
    }));
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

      // Stateless query - use caching
      const cached = await checkCache(method, params);
      if (cached !== null) {
        stats.cacheHits++;
        if (ctx) ctx.messages.cacheHits++;
        const response = {
          jsonrpc: "2.0",
          method,
          result: cached,
          id,
        };
        if (clientWs.readyState === WebSocket.OPEN) {
          clientWs.send(JSON.stringify(response));
        }
        return;
      }

      stats.cacheMisses++;
      if (ctx) ctx.messages.cacheMisses++;

      // Forward to relay (per-request load balancing)
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

// Start server
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
  console.log("  Stateless queries: Per-request round-robin + Redis cache");
  console.log("  Chain sync/mempool: Persistent upstream connection");
  console.log("");
  console.log(`Cacheable methods: ${Object.keys(CACHE_CONFIG).length}`);
  console.log(`Stateful methods: ${STATEFUL_METHODS.size}`);
  console.log("");
  console.log("Billing:");
  console.log(`  Enabled: ${ENABLE_WS_BILLING}`);
  console.log(`  Endpoint: ${BILLING_ENDPOINT}`);
  console.log(`  Interval: ${BILLING_INTERVAL_MS / 1000}s`);
  console.log("");
  console.log("Rate Limits (msg/sec):");
  console.log(`  FREE: ${RATE_LIMITS.FREE}`);
  console.log(`  PAID: ${RATE_LIMITS.PAID}`);
  console.log("=".repeat(60));
  console.log("");
  console.log("Endpoints:");
  console.log(`  WebSocket: ws://localhost:${PROXY_PORT}`);
  console.log(`  Health:    http://localhost:${PROXY_PORT}/health`);
  console.log(`  Stats:     http://localhost:${PROXY_PORT}/stats`);
  console.log("");
});

// Graceful shutdown
process.on("SIGTERM", () => {
  console.log("Shutting down...");
  wss.close();
  server.close();
  redis.quit();
  process.exit(0);
});

process.on("SIGINT", () => {
  console.log("Shutting down...");
  wss.close();
  server.close();
  redis.quit();
  process.exit(0);
});
