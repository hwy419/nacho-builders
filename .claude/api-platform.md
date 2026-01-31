# API Platform

## Overview

The API platform provides Cardano blockchain access via authenticated endpoints. It uses Kong Gateway for routing, authentication, and rate limiting, with Redis-backed caching to reduce relay load.

**Kong handles all public domains:**
- `nacho.builders` → Next.js pool landing page (localhost:3000 → /pool via middleware)
- `app.nacho.builders` → Next.js API dashboard (localhost:3000)
- `api.nacho.builders` → API routes (authenticated endpoints below)

## API Endpoints

**Public API (api.nacho.builders):**

| Endpoint | Network | Description | Auth Required |
|----------|---------|-------------|---------------|
| `wss://api.nacho.builders/v1/ogmios` | Mainnet | Ogmios WebSocket JSON-RPC | Yes (`apikey` header) |
| `https://api.nacho.builders/v1/submit` | Mainnet | Transaction submission | Yes (`apikey` header) |
| `https://api.nacho.builders/v1/graphql` | Mainnet | GraphQL API (Hasura) | Yes (`apikey` header) |
| `wss://api.nacho.builders/v1/preprod/ogmios` | Preprod | Ogmios WebSocket JSON-RPC (testnet) | Yes (`apikey` header) |
| `https://api.nacho.builders/v1/preprod/submit` | Preprod | Transaction submission (testnet) | Yes (`apikey` header) |
| `https://api.nacho.builders/v1/preprod/graphql` | Preprod | GraphQL API (Hasura testnet) | Yes (`apikey` header) |

*Same API key works for all networks - network is determined by URL path.*

**Internal Endpoints (app.nacho.builders):**

| Endpoint | Description |
|----------|-------------|
| `https://app.nacho.builders/api/auth/validate-key` | Internal key validation (Kong → Web App) |
| `https://app.nacho.builders/api/usage/log` | Internal usage logging (Kong → Web App) |

## Kong API Gateway

### Architecture
```
Client Request (api.nacho.builders)
        ↓
    Kong Gateway (port 8000)
        ↓
    cardano-api-auth plugin
        ↓ validates API key via
    Web App /api/auth/validate-key
        ↓ queries
    PostgreSQL (ApiKey table)
        ↓ if valid
    Ogmios Cache Proxy (port 3001/3002)
        ↓ checks Redis cache
    Redis (cache hit → return cached)
        ↓ cache miss
    Relay Nodes (Ogmios on ports 1337)
        ↓ response cached + returned
    Kong http-log plugin
        ↓ sends usage data to
    Web App /api/usage/log
        ↓ creates
    UsageLog entry + deducts credits
```

### Kong Services & Routes

**Web Routes (hostname-based, no auth):**

| Host | Upstream | Description |
|------|----------|-------------|
| `nacho.builders` | Next.js (localhost:3000) | Pool landing page (middleware rewrites to /pool) |
| `app.nacho.builders` | Next.js (localhost:3000) | API dashboard |

**API Routes (path-based, require auth):**

| Route | Upstream | Network |
|-------|----------|---------|
| `/v1/ogmios` | Ogmios Cache Proxy (127.0.0.1:3001) → Mainnet relays | Mainnet |
| `/v1/submit` | Submit API (relay nodes on ports 8090) | Mainnet |
| `/v1/graphql` | Hasura GraphQL (192.168.170.20:3100) | Mainnet |
| `/v1/preprod/ogmios` | Ogmios Cache Proxy (127.0.0.1:3002) → Preprod relay | Preprod |
| `/v1/preprod/submit` | Submit API (192.168.161.11:8090) | Preprod |
| `/v1/preprod/graphql` | Hasura GraphQL (192.168.170.20:3101) | Preprod |

### Custom Kong Plugin (`cardano-api-auth`)
- **Location**: `/usr/local/share/lua/5.1/kong/plugins/cardano-api-auth/`
- **Source**: `ansible/files/kong/plugins/cardano-api-auth/`
- Validates `napi_` prefixed API keys against PostgreSQL
- Sets headers for upstream: `X-Api-Key-Id`, `X-User-Id`, `X-Api-Tier`

### Kong Configuration
- **Config file**: `/etc/kong/kong.conf`
- **Plugins enabled**: `bundled,cardano-api-auth,rate-limiting,prometheus,http-log`
- **Admin API**: `http://localhost:8001` (on gateway server)

### Key Files
- `ansible/files/kong/plugins/cardano-api-auth/handler.lua` - Plugin logic
- `ansible/files/kong/plugins/cardano-api-auth/schema.lua` - Plugin config schema
- `ansible/templates/configure-kong.sh.j2` - Kong setup script
- `apps/web/src/app/api/auth/validate-key/route.ts` - Key validation endpoint

### Environment Variables
- `KONG_INTERNAL_SECRET` - Shared secret for Kong ↔ Web App communication

### Kong Commands
```bash
# Check Kong status
ssh michael@192.168.170.10 "sudo systemctl status kong"

# List Kong plugins
ssh michael@192.168.170.10 "curl -s http://localhost:8001/plugins | python3 -m json.tool"

# List Kong routes
ssh michael@192.168.170.10 "curl -s http://localhost:8001/routes | python3 -m json.tool"

# Reload Kong after config changes
ssh michael@192.168.170.10 "sudo systemctl reload kong"

# Test API with key
curl -H "apikey: napi_xxx" https://api.nacho.builders/v1/ogmios
```

## Ogmios Caching Proxy

WebSocket caching proxies sit between Kong and relay nodes, dramatically reducing relay load by caching Ogmios responses in Redis.

### Architecture
```
Kong (port 8000)
    ├─ /v1/ogmios         → Cache Proxy (port 3001) → Redis → Mainnet Relays
    └─ /v1/preprod/ogmios → Cache Proxy (port 3002) → Redis → Preprod Relay
```

### Multi-Network Configuration

| Network | Port | Service | Upstreams | Cache Prefix |
|---------|------|---------|-----------|--------------|
| Mainnet | 3001 | `ogmios-cache-proxy` | 192.168.160.11:1337, 192.168.160.12:1337 | `ogmios:mainnet:` |
| Preprod | 3002 | `ogmios-cache-proxy-preprod` | 192.168.161.11:1337 | `ogmios:preprod:` |

### Proxy Configuration
- **Location**: `/opt/ogmios-cache-proxy/ogmios-cache-proxy.js`
- **Environment Variables**: `OGMIOS_NETWORK`, `OGMIOS_PROXY_PORT`
- **Service files**: `ogmios-cache-proxy.service`, `ogmios-cache-proxy-preprod.service`

### Redis Configuration
- **Server**: 127.0.0.1:6379
- **Memory Limit**: 512MB
- **Eviction Policy**: allkeys-lru (Least Recently Used)
- **Persistence**: Disabled (pure in-memory cache)

### Cache TTL Configuration
Located in `scripts/ogmios-cache-proxy.js` - see the `CACHE_CONFIG` object.

| Method | TTL | Notes |
|--------|-----|-------|
| `queryNetwork/tip` | 10s | Most frequent query |
| `queryNetwork/blockHeight` | 10s | Same as tip |
| `queryNetwork/genesisConfiguration` | 24h | Only changes at hard forks |
| `queryLedgerState/protocolParameters` | 1h | Governance updates |
| `queryLedgerState/stakePools` | 1h | Pool registrations |
| `queryLedgerState/epoch` | 5m | Current epoch |
| `queryLedgerState/liveStakeDistribution` | 30m | Delegation distribution |
| `queryLedgerState/eraSummaries` | 24h | Historical era data |

**Never Cached:**
- `queryLedgerState/utxo` - User-specific, changes per transaction
- `submitTransaction` - Mutations must hit the chain
- `evaluateTransaction` - User-specific data

### Asset-Based UTxO Filtering (NACHO Extension)

The proxy supports server-side filtering of UTxO queries by policy ID. This is a NACHO extension to the standard Ogmios API.

**Request format:**
```json
{
  "method": "queryLedgerState/utxo",
  "params": {
    "addresses": ["addr1..."],
    "assets": [
      { "policyId": "29d222ce..." },
      { "policyId": "abc123...", "assetName": "4d494e" }
    ]
  }
}
```

**Filter semantics:**
- `policyId` only: Match UTxOs containing ANY asset with that policy
- `policyId` + `assetName`: Match UTxOs containing that EXACT asset
- Multiple filters: OR logic (match any filter)
- `addresses` + `assets`: AND logic (filter by address, then by assets)

**Performance impact:**
- Without filter: Minswap returns ~3,094 UTxOs (~3MB)
- With MIN policy filter: Returns ~39 UTxOs (~36KB)
- **68x reduction in response size**

**Implementation:** `filterUtxosByAssets()` and `validateAssetFilters()` in `ogmios-cache-proxy.js`

### Prewarmed UTxO Cache

High-traffic contract addresses (like Minswap) are prewarmed in cache for instant responses.

**Configuration:** `PREWARM_CONFIG` in `ogmios-cache-proxy.js`

| Setting | Value | Description |
|---------|-------|-------------|
| `enabled` | true | Enable prewarming |
| `addresses` | [Minswap V2] | Addresses to prewarm |
| `ttl` | 120s | Cache TTL |
| `restRatio` | 0.15 | Refresh at 15% TTL remaining |

**How it works:**
1. Background job queries configured addresses periodically
2. Full UTxO set cached in Redis
3. Asset filters applied post-cache (instant filtering)
4. Cache refreshed before expiry to avoid cold queries

### Key Files
- `apps/web/scripts/ogmios-cache-proxy.js` - WebSocket caching proxy
- `apps/web/scripts/load-test.js` - Load testing script
- `ansible/templates/ogmios-cache-proxy.service.j2` - Systemd service
- `ansible/templates/configure-kong.sh.j2` - Kong routing to proxy
- `docs/redis-cache-config.md` - Full cache configuration documentation

### Performance Results (tested)

| Metric | Without Cache | With Cache |
|--------|--------------|------------|
| Requests to Relays | 200 | 5 |
| Cache Hit Rate | N/A | 97.5% |
| Requests/sec | ~35 | 58.82 |
| Avg Latency | 200-500ms | 226ms |

**Expected Impact:**
- **97.5% cache hit rate** for `queryNetwork/tip` queries
- **Relay load reduction**: Only ~2.5% of requests reach relays
- Most latency is WebSocket/TLS overhead, not query time

### Cache Monitoring Commands
```bash
# Check proxy status
ssh michael@192.168.170.10 "sudo systemctl status ogmios-cache-proxy"

# Check proxy stats (cache hits/misses)
ssh michael@192.168.170.10 "curl -s http://localhost:3001/stats"

# Check proxy health
ssh michael@192.168.170.10 "curl -s http://localhost:3001/health"

# View proxy logs
ssh michael@192.168.170.10 "sudo journalctl -u ogmios-cache-proxy -f"

# Check Redis cached keys
ssh michael@192.168.170.10 "redis-cli keys 'ogmios:*'"

# Check Redis memory usage
ssh michael@192.168.170.10 "redis-cli info memory | grep used_memory_human"

# Clear all Ogmios cache (use with caution)
ssh michael@192.168.170.10 "redis-cli flushdb"
```

### Load Testing
```bash
# Run load test (from apps/web directory)
cd ~/claudecode/cardano-spo/cardano-api-service/apps/web
node scripts/load-test.js [requests] [concurrency]

# Example: 200 requests with 20 concurrent
node scripts/load-test.js 200 20
```

## Usage Tracking System

API usage is tracked in real-time for analytics and billing.

### Data Flow
1. Kong's `http-log` plugin sends request/response data to `/api/usage/log`
2. Endpoint extracts API key ID, user ID from headers (set by auth plugin)
3. Creates `UsageLog` entry in PostgreSQL
4. Deducts credits for PAID tier users

### Key Files
- `apps/web/src/app/api/usage/log/route.ts` - Receives Kong logs
- `apps/web/src/app/(dashboard)/usage/page.tsx` - Usage analytics dashboard
- `apps/web/prisma/schema.prisma` - `UsageLog` model definition

### UsageLog Schema
```prisma
model UsageLog {
  id            String    @id
  apiKeyId      String
  userId        String
  endpoint      String    // "v1/ogmios", "v1/submit", "v1/preprod/ogmios", etc.
  method        String    // GET, POST, WS
  network       String    @default("mainnet")  // "mainnet" or "preprod"
  statusCode    Int
  responseTime  Int       // milliseconds
  creditsUsed   Int       @default(1)
  timestamp     DateTime
}
```

### Tier Limits

| Tier | Rate Limit | Daily Limit | Credits |
|------|------------|-------------|---------|
| FREE | 100 req/s | 100,000/day | N/A (daily limits) |
| PAID | 500 req/s | Unlimited | 1 credit/request |

## Web App Deployment

### ⚠️ CRITICAL: Build Locally, Deploy Built Files

**DO NOT build on the server.** The Next.js build fails on the server (Node 20) due to WASM loading issues with `@emurgo/cardano-serialization-lib-nodejs`. The build only works on macOS with Node 18.

### Deployment Process

```bash
# 1. Build locally (macOS, Node 18)
cd ~/claudecode/cardano-spo/cardano-api-service/apps/web
pnpm build

# 2. Clear old .next on server
ssh michael@192.168.170.10 "sudo rm -rf /opt/cardano-api-service/apps/web/.next && sudo mkdir -p /opt/cardano-api-service/apps/web/.next && sudo chown michael:michael /opt/cardano-api-service/apps/web/.next"

# 3. Rsync .next folder to server
rsync -avz .next/ michael@192.168.170.10:/opt/cardano-api-service/apps/web/.next/

# 4. Copy static files into standalone directory (required for standalone mode)
ssh michael@192.168.170.10 "sudo cp -r /opt/cardano-api-service/apps/web/.next/static /opt/cardano-api-service/apps/web/.next/standalone/apps/web/.next/ && sudo cp -r /opt/cardano-api-service/apps/web/public /opt/cardano-api-service/apps/web/.next/standalone/apps/web/"

# 5. Fix ownership
ssh michael@192.168.170.10 "sudo chown -R cardano-api:cardano-api /opt/cardano-api-service/apps/web/.next"

# 6. Restart service
ssh michael@192.168.170.10 "sudo systemctl restart cardano-api-web"

# 7. Verify
curl -s -o /dev/null -w "%{http_code}" https://app.nacho.builders/
```

### Why Local Build Is Required

The `payment.ts` router imports `hdwallet.ts` which uses `@emurgo/cardano-serialization-lib-nodejs`. This library loads a WASM file at build time. On Node 20 (server), the WASM loading fails during Next.js's "Collecting page data" phase. On Node 18 (macOS), it works correctly.

### Standalone Mode Requirements

Next.js standalone output does NOT include:
- `.next/static/` - Must be copied to `standalone/apps/web/.next/static/`
- `public/` - Must be copied to `standalone/apps/web/public/`

The systemd service runs from the standalone directory, so these files must be in place.

### Ansible Playbook (10-deploy-webapp.yml)

The Ansible playbook syncs source code but **excludes** `.next/`. It should NOT build on the server. The playbook is useful for:
- Syncing source code changes (excludes .next)
- Updating environment files
- Running Prisma migrations
- Managing the systemd service

For a full deployment, build locally first, then use the manual rsync steps above.
