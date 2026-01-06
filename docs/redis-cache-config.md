# Redis Cache Configuration for Ogmios Queries

This document describes the caching strategy for Ogmios API responses using the WebSocket caching proxy.

## Architecture

```
Client (api.nacho.builders)
        ↓
   Kong Gateway (port 8000)
        ↓
   Ogmios Cache Proxy (port 3001)
        ↓
   Redis Cache (port 6379)
        ↓ (cache miss only)
   Relay Nodes (Ogmios port 1337)
```

The caching proxy sits between Kong and the relay nodes, intercepting all Ogmios WebSocket requests. For cacheable queries, it checks Redis first and only forwards to relays on cache miss.

## Cache Location

- **Server**: cardano-gateway (192.168.170.10)
- **Port**: 6379
- **Memory Limit**: 512MB
- **Eviction Policy**: allkeys-lru (Least Recently Used)
- **Persistence**: Disabled (pure in-memory cache)

## Caching Proxy

- **Location**: `/opt/ogmios-cache-proxy/ogmios-cache-proxy.js`
- **Port**: 3001
- **Service**: `ogmios-cache-proxy`
- **Upstreams**: 192.168.160.11:1337, 192.168.160.12:1337 (round-robin load balancing)
- **Health endpoint**: http://localhost:3001/health
- **Stats endpoint**: http://localhost:3001/stats

## How It Works

1. Client connects to `wss://api.nacho.builders/v1/ogmios`
2. Kong routes the WebSocket connection to the cache proxy (port 3001)
3. Client sends a JSON-RPC request (e.g., `queryNetwork/tip`)
4. Proxy checks if the method is cacheable
5. If cacheable, proxy checks Redis for a cached response
6. **Cache hit**: Return cached response immediately (no relay contact)
7. **Cache miss**: Forward to relay, cache response, return to client

## Cacheable Methods

### Network Queries (Era-Independent)

| Method | TTL | Update Frequency | Notes |
|--------|-----|------------------|-------|
| `queryNetwork/tip` | 10s | Every ~20 seconds | Most frequent query, highest impact |
| `queryNetwork/blockHeight` | 10s | Every ~20 seconds | Same data as tip |
| `queryNetwork/genesisConfiguration` | 24h | Hard forks only | Extremely stable |
| `queryNetwork/startTime` | 24h | Never | Static since chain genesis |

### Ledger State - Epoch-Based (Change Every 5 Days)

| Method | TTL | Update Frequency | Notes |
|--------|-----|------------------|-------|
| `queryLedgerState/epoch` | 5m | Every 5 days | Current epoch number |
| `queryLedgerState/protocolParameters` | 1h | Governance votes | Fee params, tx limits |
| `queryLedgerState/stakePools` | 1h | Registrations | Pool metadata, margins |
| `queryLedgerState/liveStakeDistribution` | 30m | Epoch snapshots | Delegation distribution |
| `queryLedgerState/rewardsProvenance` | 1h | Epoch end | Reward calculations |
| `queryLedgerState/treasuryAndReserves` | 1h | Epoch rewards | Treasury balance |
| `queryLedgerState/eraSummaries` | 24h | Era transitions | Historical era data |

### Ledger State - Governance

| Method | TTL | Update Frequency | Notes |
|--------|-----|------------------|-------|
| `queryLedgerState/constitution` | 1h | Governance actions | Constitutional rules |
| `queryLedgerState/constitutionalCommittee` | 1h | Member updates | Committee members |

### Ledger State - Slower Changing

| Method | TTL | Update Frequency | Notes |
|--------|-----|------------------|-------|
| `queryLedgerState/rewardAccountSummaries` | 5m | Stake changes | Account rewards |

## Never Cached (User-Specific or Mutations)

| Method | Reason |
|--------|--------|
| `queryLedgerState/utxo` | User-specific, changes with every transaction |
| `submitTransaction` | Mutation - must always hit the chain |
| `evaluateTransaction` | User-specific transaction data |

## Tuning Guidelines

### Increase TTL When:
- Relay nodes are under heavy load
- Data staleness is acceptable for your use case
- You're seeing high cache miss rates on slow-changing data

### Decrease TTL When:
- Users need more real-time data
- You have capacity headroom on relays
- Specific queries need fresher data

### Configuration Location

TTL values are configured in the caching proxy:
```
/opt/ogmios-cache-proxy/ogmios-cache-proxy.js
```

Look for the `CACHE_CONFIG` object near the top of the file.

To apply changes, restart the proxy:
```bash
sudo systemctl restart ogmios-cache-proxy
```

## Monitoring Commands

```bash
# Check proxy service status
sudo systemctl status ogmios-cache-proxy

# Check proxy stats (cache hits/misses)
curl -s http://localhost:3001/stats

# Check proxy health
curl -s http://localhost:3001/health

# View proxy logs
sudo journalctl -u ogmios-cache-proxy -f

# Check Redis is running
redis-cli ping

# Check Redis memory usage
redis-cli info memory | grep used_memory_human

# View all cached Ogmios keys
redis-cli keys "ogmios:*"

# Count cached keys
redis-cli keys "ogmios:*" | wc -l

# Get TTL for a specific key
redis-cli ttl "ogmios:queryNetwork/tip:{}"

# View a cached value
redis-cli get "ogmios:queryNetwork/tip:{}"

# Clear all Ogmios cache (use with caution)
redis-cli flushdb
```

## Cache Key Format

Keys follow the pattern: `ogmios:<method>:<params_json>`

Examples:
- `ogmios:queryNetwork/tip:{}`
- `ogmios:queryLedgerState/stakePools:{}`
- `ogmios:queryLedgerState/epoch:{}`

## Performance Results

Based on load testing (200 requests, 20 concurrent):

| Metric | Without Cache | With Cache |
|--------|--------------|------------|
| Requests to Relays | 200 | 5 |
| Cache Hit Rate | N/A | **97.5%** |
| Requests/sec | ~35 | **58.82** |
| Avg Latency | 200-500ms | **226ms** |
| Failed Requests | - | 0 |

**Actual relay load reduction: 97.5%** - only 2.5% of requests reach relays.

Note: Most of the latency (226ms) is WebSocket/TLS connection overhead, not query time. Cache hits are served in <1ms from Redis.

## Load Testing

```bash
# Run load test (from apps/web directory)
cd ~/claudecode/cardano-spo/cardano-api-service/apps/web
node scripts/load-test.js [requests] [concurrency]

# Example: 200 requests with 20 concurrent
node scripts/load-test.js 200 20

# Check cache stats after test
curl -s http://192.168.170.10:3001/stats
```

## Troubleshooting

### Cache proxy not working

1. Check proxy service status:
   ```bash
   sudo systemctl status ogmios-cache-proxy
   ```

2. Check proxy logs for errors:
   ```bash
   sudo journalctl -u ogmios-cache-proxy -n 50
   ```

3. Check Kong is routing to proxy:
   ```bash
   curl -s http://localhost:8001/upstreams/ogmios-upstream/targets
   # Should show 127.0.0.1:3001
   ```

4. Restart proxy:
   ```bash
   sudo systemctl restart ogmios-cache-proxy
   ```

### Cache not working (0 hits)

1. Check Redis is running:
   ```bash
   redis-cli ping
   ```

2. Check proxy stats:
   ```bash
   curl -s http://localhost:3001/stats
   ```

3. Check cache keys exist:
   ```bash
   redis-cli keys "ogmios:*"
   ```

4. Restart both services:
   ```bash
   sudo systemctl restart redis-server ogmios-cache-proxy
   ```

### High memory usage

If Redis memory grows too large:

1. Check current usage:
   ```bash
   redis-cli info memory
   ```

2. The LRU eviction policy will automatically remove old keys when `maxmemory` (512MB) is reached.

3. To clear cache manually:
   ```bash
   redis-cli flushdb
   ```

### Stale data issues

If cached data is causing problems:

1. Clear specific method cache:
   ```bash
   redis-cli keys "ogmios:queryLedgerState/stakePools:*" | xargs redis-cli del
   ```

2. Reduce TTL for that method in `CACHE_CONFIG`

3. Restart the proxy to apply changes:
   ```bash
   sudo systemctl restart ogmios-cache-proxy
   ```

### Proxy not connecting to relays

1. Check relay connectivity:
   ```bash
   nc -zv 192.168.160.11 1337
   nc -zv 192.168.160.12 1337
   ```

2. Check proxy environment variables:
   ```bash
   cat /etc/systemd/system/ogmios-cache-proxy.service | grep Environment
   ```

3. Check proxy logs for connection errors:
   ```bash
   sudo journalctl -u ogmios-cache-proxy | grep -i error
   ```
