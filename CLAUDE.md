# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Cardano stake pool infrastructure project with two main components:

1. **Stake Pool Operations** - A fully deployed Cardano stake pool (NACHO) with block producer, relay nodes, and monitoring
2. **API Service Platform** - A Cardano API-as-a-Service platform (similar to QuickNode) with ADA payments

## Common Development Commands

### Stake Pool Infrastructure (Ansible)

```bash
# Change to Ansible directory
cd ~/claudecode/cardano-spo/ansible

# Check connectivity to all nodes
ansible all -m ping

# Check mainnet node sync status
for host in 192.168.160.10 192.168.160.11 192.168.160.12; do
  echo "=== Mainnet Node at $host ==="
  ssh -o ConnectTimeout=10 michael@$host "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'" 2>&1
  echo ""
done

# Check preprod node sync status
echo "=== Preprod Node at 192.168.161.11 ==="
ssh -o ConnectTimeout=10 michael@192.168.161.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --testnet-magic 1'" 2>&1

# Run full deployment
ansible-playbook site.yml

# Run specific playbooks
ansible-playbook playbooks/00-bootstrap.yml
ansible-playbook playbooks/99-update-nodes.yml

# Restart nodes
ansible all -m systemd -a "name=cnode state=restarted" --become
```

### API Service Platform (Next.js/TypeScript)

```bash
# Change to API service directory
cd ~/claudecode/cardano-spo/cardano-api-service

# Install dependencies (uses pnpm)
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build

# Database commands
pnpm db:generate  # Generate Prisma client
pnpm db:push      # Push schema to database
pnpm db:migrate   # Run migrations

# Linting and formatting
pnpm lint
pnpm format
```

### Fast Deployment (Build Local, Deploy Remote)

Building on the server is slow due to memory constraints. Use this faster approach:

```bash
# 1. Build locally (~15 seconds)
cd ~/claudecode/cardano-spo/cardano-api-service/apps/web
export GOOGLE_CLIENT_ID="<from vault.yml>"
export GOOGLE_CLIENT_SECRET="<from vault.yml>"
# DATABASE_URL is needed for prisma generate (any valid format works for build)
export DATABASE_URL="postgresql://cardano:password@localhost:5432/cardano_api?schema=public"
pnpm exec prisma generate
pnpm run build

# 2. Clear remote and sync (~10 seconds)
ssh michael@192.168.170.10 "sudo rm -rf /opt/cardano-api-service/apps/web/.next && sudo mkdir -p /opt/cardano-api-service/apps/web/.next && sudo chown michael:michael /opt/cardano-api-service/apps/web/.next"
rsync -avz .next/ michael@192.168.170.10:/opt/cardano-api-service/apps/web/.next/

# 3. Copy static files to standalone folder (required for CSS/JS)
rsync -avz .next/static/ michael@192.168.170.10:/opt/cardano-api-service/apps/web/.next/standalone/apps/web/.next/static/

# 4. Fix permissions and restart
ssh michael@192.168.170.10 "sudo chown -R cardano-api:cardano-api /opt/cardano-api-service/apps/web/.next && sudo systemctl restart cardano-api-web"
```

## High-Level Architecture

### 🗺️ Visual Network Diagrams

For a complete visual overview of the architecture, see:
- **Interactive Diagram v2** ⭐: `docs/complete-network-diagram-v2.html` - **RECOMMENDED** - Reorganized layout with real-time verified data, all user interfaces, orthogonal connections
- **Diagram Guide**: `docs/NETWORK-DIAGRAMS.md` - How to view and use all diagrams
- **Complete Reference**: `docs/architecture/complete-network-reference.md` - Detailed text-based documentation
- **What's New**: `docs/DIAGRAM-IMPROVEMENTS.md` - v2 improvements and SSH verification results
- **Legacy Diagrams**: `docs/complete-network-diagram.html`, `docs/topology-diagram.html`

### Infrastructure Layout

- **Cardano-Stake Network (VLAN 160)**: 192.168.160.0/24 - Mainnet stake pool infrastructure
  - **Block Producer**: 192.168.160.10 - Creates blocks, isolated, no public access
  - **Relay 1**: 192.168.160.11 - Public relay on port 6001, Ogmios on 1337
  - **Relay 2**: 192.168.160.12 - Public relay on port 6002, Ogmios on 1337
  - **Monitoring**: 192.168.160.2 - Prometheus + Grafana
- **Preprod Testnet (VLAN 161)**: 192.168.161.0/24 - Preprod testnet for API service
  - **Preprod Relay**: 192.168.161.11 - Preprod relay, Ogmios on 1337
  - *No block producer needed - API service only*
- **API Platform (VLAN 170)**: 192.168.170.0/24 - API service infrastructure
  - **Gateway**: 192.168.170.10 - Kong Gateway + Web App + Caching Proxies + Redis + PostgreSQL
    - Kong Gateway: `api.nacho.builders` (ports 80/443 → 8000)
    - Web App: `app.nacho.builders` (port 3000)
    - PostgreSQL: `localhost:5432` (database: `cardano_api`)
    - Ogmios Cache Proxy (Mainnet): `127.0.0.1:3001`
    - Ogmios Cache Proxy (Preprod): `127.0.0.1:3002`
    - Redis Cache: `127.0.0.1:6379` (shared cache storage)
    - Services: `kong`, `cardano-api-web`, `ogmios-cache-proxy`, `ogmios-cache-proxy-preprod`, `redis-server`, `postgresql`
  - **DB-Sync**: 192.168.170.20 - Cardano DB-Sync for blockchain indexing
    - PostgreSQL database: `cexplorer` (localhost)
    - Connects to Relay 1 via socat socket proxy (192.168.160.11:6100)
    - Services: `cardano-db-sync`, `postgresql`

### Key Design Patterns

1. **Security-First Architecture**
   - VLANs isolate different services (160 for mainnet stake pool, 161 for preprod testnet, 170 for API platform)
   - Block producer has no inbound internet access
   - Air-gapped machine for key management
   - Defense in depth with network, host, and application firewalls
   - Testnet isolated on separate VLAN to prevent cross-network contamination

2. **Infrastructure as Code**
   - All deployment via Ansible playbooks in `ansible/`
   - Consistent configuration through Jinja2 templates
   - Group variables for environment-specific settings

3. **Monorepo Structure (API Service)**
   - Turborepo for managing multiple apps/packages
   - Next.js 14 with App Router for the web application
   - Prisma for database management
   - tRPC for type-safe API layer

### Critical Paths and Services

**Cardano Node Paths (on deployed VMs):**
- `/opt/cardano/cnode` - Main installation directory (CNODE_HOME)
- `/opt/cardano/cnode/db` - Blockchain database
- `/opt/cardano/cnode/sockets/node.socket` - Node socket
- `/home/cardano/.local/bin` - Cardano binaries

**Service Accounts:**
- `michael` - Admin user with sudo access (SSH key auth)
- `cardano` - Service account running cardano-node (no direct SSH)
- `cardano-api` - Service account running the web app on API platform

**Key Services:**
- `cnode` - Cardano node systemd service (on relay/block producer nodes)
- `prometheus` - Metrics collection (on 192.168.160.2)
- `grafana-server` - Dashboard visualization (on 192.168.160.2)
- `kong` - API Gateway (on 192.168.170.10)
- `cardano-api-web` - Next.js web application (on 192.168.170.10)
- `payment-monitor-dbsync` - Payment monitor polling DB-Sync every 2 seconds (on 192.168.170.10)
- `ogmios-cache-proxy` - WebSocket caching proxy for Ogmios (on 192.168.170.10)
- `redis-server` - Cache storage for Ogmios responses (on 192.168.170.10)
- `postgresql` - Database server (on 192.168.170.10, localhost)
- `cardano-db-sync` - Blockchain indexer (on 192.168.170.20)
- `cardano-socket-server` - Socat socket proxy for db-sync (on 192.168.160.11)

**API Platform Paths (on 192.168.170.10):**
- `/opt/cardano-api-service` - Application root
- `/opt/cardano-api-service/apps/web/.next/standalone` - Production build
- `/opt/cardano-api-service/apps/web/.env` - Environment variables
- `/opt/ogmios-cache-proxy` - Ogmios caching proxy installation
- `/etc/kong/kong.conf` - Kong configuration
- `/etc/redis/redis.conf` - Redis configuration
- `/usr/local/share/lua/5.1/kong/plugins/cardano-api-auth/` - Custom Kong plugin
- Service files: `/etc/systemd/system/cardano-api-web.service`, `/etc/systemd/system/kong.service`, `/etc/systemd/system/ogmios-cache-proxy.service`, `/etc/systemd/system/payment-monitor-dbsync.service`

### Technology Stack

- **Infrastructure**: Proxmox VE 8.2.2, Ubuntu 22.04 LTS
- **Cardano**: cardano-node 10.5.3, Guild Operators scripts
- **API Service**: Next.js 14, TypeScript, PostgreSQL, Prisma, Kong Gateway
- **Caching**: Redis 6.x (ioredis client) for Ogmios response caching
- **Authentication**: NextAuth.js v4 with Google OAuth, AWS SES for magic links
- **Monitoring**: Prometheus, Grafana, Node Exporter
- **Automation**: Ansible 2.9+

### Kong API Gateway

The API platform uses Kong Gateway to proxy requests to Cardano services (Ogmios, Submit API) with authentication, rate limiting, and usage tracking.

**Architecture:**
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
    Ogmios Cache Proxy (port 3001)
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

**Kong Services & Routes:**

| Route | Upstream | Network |
|-------|----------|---------|
| `/v1/ogmios` | Ogmios Cache Proxy (127.0.0.1:3001) → Mainnet relays | Mainnet |
| `/v1/submit` | Submit API (relay nodes on ports 8090) | Mainnet |
| `/v1/preprod/ogmios` | Ogmios Cache Proxy (127.0.0.1:3002) → Preprod relay | Preprod |
| `/v1/preprod/submit` | Submit API (192.168.161.11:8090) | Preprod |

*Same API key works for all networks - network is determined by URL path only.*

**Custom Kong Plugin (`cardano-api-auth`):**
- Location: `/usr/local/share/lua/5.1/kong/plugins/cardano-api-auth/`
- Source: `ansible/files/kong/plugins/cardano-api-auth/`
- Validates `napi_` prefixed API keys against PostgreSQL
- Sets headers for upstream: `X-Api-Key-Id`, `X-User-Id`, `X-Api-Tier`

**Kong Configuration:**
- Config file: `/etc/kong/kong.conf`
- Plugins enabled: `bundled,cardano-api-auth,rate-limiting,prometheus,http-log`
- Admin API: `http://localhost:8001` (on gateway server)

**Key Files:**
- `ansible/files/kong/plugins/cardano-api-auth/handler.lua` - Plugin logic
- `ansible/files/kong/plugins/cardano-api-auth/schema.lua` - Plugin config schema
- `ansible/templates/configure-kong.sh.j2` - Kong setup script
- `apps/web/src/app/api/auth/validate-key/route.ts` - Key validation endpoint

**Environment Variables:**
- `KONG_INTERNAL_SECRET` - Shared secret for Kong ↔ Web App communication

**Useful Commands:**
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

### Usage Tracking System

API usage is tracked in real-time for analytics and billing.

**Data Flow:**
1. Kong's `http-log` plugin sends request/response data to `/api/usage/log`
2. Endpoint extracts API key ID, user ID from headers (set by auth plugin)
3. Creates `UsageLog` entry in PostgreSQL
4. Deducts credits for PAID tier users

**Key Files:**
- `apps/web/src/app/api/usage/log/route.ts` - Receives Kong logs
- `apps/web/src/app/(dashboard)/usage/page.tsx` - Usage analytics dashboard
- `apps/web/prisma/schema.prisma` - `UsageLog` model definition

**UsageLog Schema:**
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

**Tier Limits:**
| Tier | Rate Limit | Daily Limit | Credits |
|------|------------|-------------|---------|
| FREE | 100 req/s | 100,000/day | N/A (daily limits) |
| PAID | 500 req/s | Unlimited | 1 credit/request |

**Load Testing:**
```bash
# Run load test (from apps/web directory)
node scripts/load-test.js [requests] [concurrency]

# Example: 50 requests with 10 concurrent
node scripts/load-test.js 50 10
```

### Ogmios Caching Proxy

The API platform uses WebSocket caching proxies that sit between Kong and the relay nodes. This dramatically reduces relay load by caching Ogmios responses in Redis. Separate proxy instances handle each network.

**Architecture:**
```
Kong (port 8000)
    ├─ /v1/ogmios         → Cache Proxy (port 3001) → Redis → Mainnet Relays
    └─ /v1/preprod/ogmios → Cache Proxy (port 3002) → Redis → Preprod Relay
```

**Multi-Network Proxy Configuration:**

| Network | Port | Service | Upstreams | Cache Prefix |
|---------|------|---------|-----------|--------------|
| Mainnet | 3001 | `ogmios-cache-proxy` | 192.168.160.11:1337, 192.168.160.12:1337 | `ogmios:mainnet:` |
| Preprod | 3002 | `ogmios-cache-proxy-preprod` | 192.168.161.11:1337 | `ogmios:preprod:` |

**Proxy Configuration:**
- **Location**: `/opt/ogmios-cache-proxy/ogmios-cache-proxy.js`
- **Environment Variables**: `OGMIOS_NETWORK`, `OGMIOS_PROXY_PORT`
- **Service files**: `ogmios-cache-proxy.service`, `ogmios-cache-proxy-preprod.service`

**Redis Configuration:**
- **Server**: 127.0.0.1:6379
- **Memory Limit**: 512MB
- **Eviction Policy**: allkeys-lru (Least Recently Used)
- **Persistence**: Disabled (pure in-memory cache)

**Cache TTL Configuration:**
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

**Key Files:**
- `apps/web/scripts/ogmios-cache-proxy.js` - WebSocket caching proxy
- `apps/web/scripts/load-test.js` - Load testing script
- `ansible/templates/ogmios-cache-proxy.service.j2` - Systemd service
- `ansible/templates/configure-kong.sh.j2` - Kong routing to proxy
- `docs/redis-cache-config.md` - Full cache configuration documentation

**Monitoring Commands:**
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

**Load Testing:**
```bash
# Run load test (from apps/web directory)
cd ~/claudecode/cardano-spo/cardano-api-service/apps/web
node scripts/load-test.js [requests] [concurrency]

# Example: 200 requests with 20 concurrent
node scripts/load-test.js 200 20
```

**Performance Results (tested):**
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

### Billing & Pricing System

The platform uses a pay-as-you-go model with ADA cryptocurrency payments. No subscriptions - users purchase credit packages that never expire.

**Two-Tier API Key Model:**

| Feature | FREE Key | PAID Keys |
|---------|----------|-----------|
| Keys per user | 1 (auto-created) | Unlimited |
| Rate limit | 100 req/s | 500 req/s |
| Daily limit | 100,000 requests | Unlimited |
| WebSocket connections | 5 | 50 |
| Data retention | 30 days | 90 days |
| Credits consumed | None | 1 per request |
| Submit API | 10 tx/hour | Unlimited |

**Credit Packages (competitive USD pricing, Jan 2026):**

| Package | Credits | ADA | USD* | Cost/1M | Credits/ADA |
|---------|---------|-----|------|---------|-------------|
| Starter | 400,000 | 3 | ~$1.14 | $2.85 | 133k |
| Standard | 2,000,000 | 12 | ~$4.56 | $2.28 | 167k |
| Pro | 8,000,000 | 40 | ~$15.20 | $1.90 | 200k |
| Enterprise | 40,000,000 | 125 | ~$47.50 | $1.19 | 320k |

*USD estimates at ~$0.38/ADA. Beats Blockfrost ($2.90/1M) at all tiers, beats Koios ($1.39/1M) at Enterprise.*

*Note: Packages are configurable via Admin → System page. Database packages override defaults.*

**Payment Flow:**
```
User selects package → Payment created (PENDING)
        ↓
    Unique payment address generated
        ↓
    User sends ADA from wallet
        ↓
    DB-Sync Payment Monitor polls every 2 seconds
        ↓ queries DB-Sync PostgreSQL directly (~10ms)
    Transaction detected → Status: CONFIRMING
        ↓
    2 confirmations reached → Status: CONFIRMED
        ↓
    Credits added to user balance
```

**Payment Monitor Architecture:**
```
payment-monitor-dbsync.service (every 2 seconds)
        ↓
    /api/cron/payments-dbsync endpoint
        ↓ queries pending payments
    Web App PostgreSQL (cardano_api)
        ↓ for each payment address
    DB-Sync PostgreSQL (cexplorer on 192.168.170.20)
        ↓ fast UTxO lookups (~10ms vs 27s with Ogmios)
    Update payment status + credit user
```

**Why DB-Sync vs Ogmios:**
| Metric | Ogmios (old) | DB-Sync (current) |
|--------|--------------|-------------------|
| Query time | 27 seconds | ~10ms |
| Poll interval | 60 seconds | 2 seconds |
| Detection latency | Up to 90+ seconds | ~4 seconds |
| API credits used | Yes | None |
| Kong gateway | Yes | Bypassed |

**Key Database Models:**

```prisma
model User {
  credits    Int    @default(0)  // Credit balance
  // ... other fields
}

model Payment {
  id              String   @id
  userId          String
  amount          Decimal  // ADA amount
  credits         Int      // Credits to add
  packageName     String?
  bonusPercent    Int      @default(0)
  paymentAddress  String   // Unique per payment
  txHash          String?  // Cardano transaction hash
  status          PaymentStatus  // PENDING, CONFIRMING, CONFIRMED, EXPIRED, FAILED
  confirmations   Int      @default(0)
  expiresAt       DateTime // 24 hours from creation
}

model CreditPackage {
  id           String  @id
  name         String
  credits      Int
  adaPrice     Decimal
  bonusPercent Int     @default(0)
  active       Boolean @default(true)
  popular      Boolean @default(false)
  displayOrder Int     @default(0)
}
```

**Key Files:**
- `apps/web/src/app/(dashboard)/billing/page.tsx` - Billing dashboard with credit balance
- `apps/web/src/app/(dashboard)/billing/checkout/page.tsx` - Payment flow with QR code
- `apps/web/src/components/billing/credit-packages.tsx` - Package selection component
- `apps/web/src/app/api/cron/payments-dbsync/route.ts` - DB-Sync payment monitor endpoint
- `apps/web/src/lib/jobs/payment-monitor-dbsync.ts` - DB-Sync payment monitor logic
- `apps/web/src/lib/cardano/dbsync.ts` - DB-Sync PostgreSQL client
- `apps/web/src/app/(admin)/admin/system/page.tsx` - Admin package configuration
- `apps/web/src/app/(public)/page.tsx` - Landing page with pricing display

**Payment Address Generation:**
- Uses `@emurgo/cardano-serialization-lib-nodejs` for Cardano address derivation
- Each payment gets a unique address derived from a master key
- Master key stored in environment: `CARDANO_PAYMENT_XPRV`

**Payment Monitor Service:**
The `payment-monitor-dbsync` systemd service polls every 2 seconds:
```bash
# Check payment monitor status
ssh michael@192.168.170.10 "sudo systemctl status payment-monitor-dbsync"

# Watch payment monitor logs
ssh michael@192.168.170.10 "sudo journalctl -u payment-monitor-dbsync -f"

# Restart payment monitor
ssh michael@192.168.170.10 "sudo systemctl restart payment-monitor-dbsync"
```

**Environment Variables (on gateway):**
- `DBSYNC_DATABASE_URL` - Connection string to DB-Sync PostgreSQL (192.168.170.20)
- `CRON_SECRET` - Auth secret for payment monitor endpoint

**Admin Commands:**
```bash
# Check pending payments
ssh michael@192.168.170.10 "sudo -u postgres psql -d cardano_api -c \"SELECT id, amount, status, \\\"paymentAddress\\\" FROM \\\"Payment\\\" WHERE status = 'PENDING'\""

# Check user credits
ssh michael@192.168.170.10 "sudo -u postgres psql -d cardano_api -c \"SELECT email, credits FROM \\\"User\\\" ORDER BY credits DESC LIMIT 10\""

# View configured packages
ssh michael@192.168.170.10 "sudo -u postgres psql -d cardano_api -c \"SELECT name, credits, \\\"adaPrice\\\", \\\"bonusPercent\\\", active FROM \\\"CreditPackage\\\" ORDER BY \\\"displayOrder\\\"\""
```

### Authentication System

The web app (app.nacho.builders) uses NextAuth.js v4 for authentication:

**Supported Providers:**
- **Google OAuth** - Primary SSO provider (configured in Google Cloud Console)
- **Magic Link Email** - Via AWS SES (us-east-2 region)

**Key Files:**
- `apps/web/src/lib/auth.ts` - NextAuth configuration with PrismaAdapter
- `apps/web/src/app/api/auth/[...nextauth]/route.ts` - Auth API routes
- `apps/web/src/components/providers.tsx` - SessionProvider wrapper
- `apps/web/src/app/(auth)/login/page.tsx` - Login page with signIn handlers

**Secrets (stored in Ansible vault):**
- `vault_google_client_id` / `vault_google_client_secret` - Google OAuth credentials
- `vault_email_server` - AWS SES SMTP connection string
- `vault_nextauth_secret` - Session encryption key

**Important Notes:**
- Uses NextAuth.js v4.24.x (NOT v5 beta - has standalone build issues)
- Prisma schema includes `binaryTargets = ["native", "debian-openssl-3.0.x"]` for cross-platform builds
- Login page is a client component using `signIn()` from `next-auth/react`
- SessionProvider wraps the app in `layout.tsx` via the Providers component

### Cardano DB-Sync

DB-Sync indexes the Cardano blockchain into a PostgreSQL database for efficient querying. Used by the API platform for block explorer features and historical data.

**Architecture:**
```
Relay 1 (192.168.160.11)
    │
    │ cardano-socket-server (socat)
    │ TCP port 6100 → node.socket
    │
    ▼
DB-Sync Server (192.168.170.20)
    │
    │ socat (local)
    │ /var/run/cardano/node.socket → TCP 192.168.160.11:6100
    │
    ▼
cardano-db-sync process
    │
    │ indexes blocks/transactions
    │
    ▼
PostgreSQL (cexplorer database)
```

**Server Details:**
- **Host**: 192.168.170.20
- **Service**: `cardano-db-sync`
- **Database**: `cexplorer` (PostgreSQL on localhost)
- **Config**: `/opt/cardano-db-sync/config/db-sync-config.yaml`
- **Ledger State**: `/opt/cardano-db-sync/ledger-state`
- **Schema Dir**: `/opt/cardano-db-sync/schema`
- **Socket**: `/var/run/cardano/node.socket` (via socat to relay)

**Check Sync Status:**
```bash
# Check service status
ssh michael@192.168.170.20 "sudo systemctl status cardano-db-sync"

# Get current sync progress (compare to chain tip)
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -t -c \"SELECT block_no, slot_no, epoch_no, time FROM block ORDER BY id DESC LIMIT 1;\""

# Get chain tip from relay for comparison
ssh michael@192.168.160.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"

# View recent logs
ssh michael@192.168.170.20 "sudo journalctl -u cardano-db-sync -n 50 --no-pager"

# Check sync percentage (slots)
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -t -c \"SELECT MAX(slot_no) FROM block;\"" | xargs -I {} echo "DB-Sync slot: {}"
```

**Useful Database Queries:**
```bash
# Count total blocks synced
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -t -c \"SELECT COUNT(*) FROM block;\""

# Get current epoch
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -t -c \"SELECT MAX(epoch_no) FROM block;\""

# Check database size
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -t -c \"SELECT pg_size_pretty(pg_database_size('cexplorer'));\""

# List tables
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -c \"\\dt\""
```

**Restart Services:**
```bash
# Restart db-sync
ssh michael@192.168.170.20 "sudo systemctl restart cardano-db-sync"

# Restart socket proxy on relay (if connection issues)
ssh michael@192.168.160.11 "sudo systemctl restart cardano-socket-server"

# Restart local socat on db-sync server
ssh michael@192.168.170.20 "sudo systemctl restart cardano-socket-proxy"
```

## Important Reminders

- Never commit sensitive keys or credentials
- Block producer should never have public internet exposure
- Always test playbooks on one node before running on all
- **CRITICAL: Never restart both relay nodes simultaneously** - See "Safe Relay Restart Procedure" below
- API service requires pnpm (not npm or yarn)
- Database changes should use Prisma migrations
- Monitoring dashboards are at http://192.168.160.2:3000
- Web app is at https://app.nacho.builders
- API gateway is at https://api.nacho.builders
- Encrypt vault files with: `ansible-vault encrypt ansible/inventory/group_vars/api_platform/vault.yml`

## Critical Operational Procedures

### Safe Relay Restart Procedure

**NEVER restart both relay nodes at the same time.** The block producer depends on relay connectivity to propagate blocks. If both relays go down simultaneously, the block producer loses network connectivity and cannot mint blocks.

**Correct procedure for restarting relay nodes:**

```bash
# Step 1: Restart Relay 1
ssh michael@192.168.160.11 "sudo systemctl restart cnode"

# Step 2: Wait for Relay 1 to fully sync (may take 1-2 minutes)
# Check sync status - must show syncProgress: "100.00"
ssh michael@192.168.160.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"

# Step 3: Verify block producer has connectivity (should show 1+ active peers)
ssh michael@192.168.160.10 "curl -s http://localhost:12798/metrics | grep ActivePeers_int"

# Step 4: Only after Relay 1 is 100% synced, restart Relay 2
ssh michael@192.168.160.12 "sudo systemctl restart cnode"

# Step 5: Wait for Relay 2 to sync and verify
ssh michael@192.168.160.12 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"

# Step 6: Final verification - block producer should have 2 active peers
ssh michael@192.168.160.10 "curl -s http://localhost:12798/metrics | grep ActivePeers_int"
```

**Why this matters:**
- Block producer ONLY connects to relay nodes (no public internet)
- If both relays are down, BP is isolated and cannot propagate minted blocks
- Missed blocks = lost rewards and reduced pool performance
- Even 60 seconds of isolation during a slot leadership could mean a missed block

## API Endpoints

**Public API (api.nacho.builders):**

| Endpoint | Network | Description | Auth Required |
|----------|---------|-------------|---------------|
| `wss://api.nacho.builders/v1/ogmios` | Mainnet | Ogmios WebSocket JSON-RPC | Yes (`apikey` header) |
| `https://api.nacho.builders/v1/submit` | Mainnet | Transaction submission | Yes (`apikey` header) |
| `wss://api.nacho.builders/v1/preprod/ogmios` | Preprod | Ogmios WebSocket JSON-RPC (testnet) | Yes (`apikey` header) |
| `https://api.nacho.builders/v1/preprod/submit` | Preprod | Transaction submission (testnet) | Yes (`apikey` header) |

*Same API key works for all networks - network is determined by URL path.*

**Internal Endpoints (app.nacho.builders):**

| Endpoint | Description |
|----------|-------------|
| `https://app.nacho.builders/api/auth/validate-key` | Internal key validation (Kong → Web App) |
| `https://app.nacho.builders/api/usage/log` | Internal usage logging (Kong → Web App) |

## Troubleshooting

**Kong not responding (502 Bad Gateway):**
```bash
# Check for stale socket file
ssh michael@192.168.170.10 "sudo systemctl stop kong && sudo rm -f /usr/local/kong/worker_events.sock && sudo systemctl start kong"
```

**API key not working:**
```bash
# Verify key exists in database
ssh michael@192.168.170.10 "sudo -u postgres psql -d cardano_api -c \"SELECT \\\"keyPrefix\\\", active, tier FROM \\\"ApiKey\\\" WHERE \\\"keyPrefix\\\" LIKE 'napi_%'\""

# Check Kong plugins are configured
ssh michael@192.168.170.10 "curl -s http://localhost:8001/routes/ogmios-route/plugins | python3 -m json.tool"
```

**Usage logs not appearing:**
```bash
# Check http-log plugin is configured
ssh michael@192.168.170.10 "curl -s http://localhost:8001/plugins | python3 -c \"import sys,json; d=json.load(sys.stdin); print([p['name'] for p in d['data']])\""

# Check usage log endpoint health
ssh michael@192.168.170.10 "curl -s http://localhost:3000/api/usage/log"
```

**Ogmios cache proxy not working:**
```bash
# Check proxy service status (mainnet)
ssh michael@192.168.170.10 "sudo systemctl status ogmios-cache-proxy"

# Check proxy service status (preprod)
ssh michael@192.168.170.10 "sudo systemctl status ogmios-cache-proxy-preprod"

# Check proxy logs for errors
ssh michael@192.168.170.10 "sudo journalctl -u ogmios-cache-proxy -n 50"
ssh michael@192.168.170.10 "sudo journalctl -u ogmios-cache-proxy-preprod -n 50"

# Check proxy stats
ssh michael@192.168.170.10 "curl -s http://localhost:3001/stats"  # Mainnet
ssh michael@192.168.170.10 "curl -s http://localhost:3002/stats"  # Preprod

# Check Kong is routing to proxy (mainnet should show 127.0.0.1:3001)
ssh michael@192.168.170.10 "curl -s http://localhost:8001/upstreams/ogmios-upstream/targets | python3 -c \"import sys,json; print([t['target'] for t in json.load(sys.stdin)['data']])\""

# Check Kong is routing to proxy (preprod should show 127.0.0.1:3002)
ssh michael@192.168.170.10 "curl -s http://localhost:8001/upstreams/ogmios-preprod-upstream/targets | python3 -c \"import sys,json; print([t['target'] for t in json.load(sys.stdin)['data']])\""

# Restart proxies
ssh michael@192.168.170.10 "sudo systemctl restart ogmios-cache-proxy ogmios-cache-proxy-preprod"
```

**Redis cache not working:**
```bash
# Check Redis is running
ssh michael@192.168.170.10 "systemctl status redis-server"

# Test Redis connectivity
ssh michael@192.168.170.10 "redis-cli ping"

# Check cached keys by network
ssh michael@192.168.170.10 "redis-cli keys 'ogmios:mainnet:*'"
ssh michael@192.168.170.10 "redis-cli keys 'ogmios:preprod:*'"

# Check cache stats from proxies
ssh michael@192.168.170.10 "curl -s http://localhost:3001/stats"  # Mainnet
ssh michael@192.168.170.10 "curl -s http://localhost:3002/stats"  # Preprod

# Clear cache if needed (affects both networks)
ssh michael@192.168.170.10 "redis-cli flushdb"

# Restart all services
ssh michael@192.168.170.10 "sudo systemctl restart redis-server ogmios-cache-proxy ogmios-cache-proxy-preprod"
```

**Preprod relay node issues:**
```bash
# Check preprod node sync status
ssh michael@192.168.161.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --testnet-magic 1'"

# Check Ogmios status on preprod relay
ssh michael@192.168.161.11 "sudo systemctl status ogmios"

# Test Ogmios directly on preprod relay
ssh michael@192.168.161.11 "curl -s http://localhost:1337/health"

# Restart preprod services
ssh michael@192.168.161.11 "sudo systemctl restart cnode ogmios"
```

**DB-Sync not syncing or stuck:**
```bash
# Check db-sync service status
ssh michael@192.168.170.20 "sudo systemctl status cardano-db-sync"

# Check for errors in logs
ssh michael@192.168.170.20 "sudo journalctl -u cardano-db-sync -n 100 --no-pager | grep -i error"

# Verify socket connection (should show socat process)
ssh michael@192.168.170.20 "ps aux | grep socat"

# Test socket connectivity to relay
ssh michael@192.168.170.20 "nc -zv 192.168.160.11 6100"

# Check socket server on relay is running
ssh michael@192.168.160.11 "sudo systemctl status cardano-socket-server"

# Restart the full chain if needed
ssh michael@192.168.160.11 "sudo systemctl restart cardano-socket-server"
ssh michael@192.168.170.20 "sudo systemctl restart cardano-db-sync"

# Check sync progress vs chain tip
echo "=== DB-Sync Progress ===" && \
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -t -c \"SELECT 'Block: ' || block_no || ', Slot: ' || slot_no || ', Epoch: ' || epoch_no || ', Time: ' || time FROM block ORDER BY id DESC LIMIT 1;\"" && \
echo "=== Chain Tip ===" && \
ssh michael@192.168.160.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"
```

**Payment monitor not detecting payments:**
```bash
# Check payment monitor service status
ssh michael@192.168.170.10 "sudo systemctl status payment-monitor-dbsync"

# Watch payment monitor logs (shows each poll)
ssh michael@192.168.170.10 "sudo journalctl -u payment-monitor-dbsync -f"

# Test payment endpoint manually
ssh michael@192.168.170.10 "curl -s -H 'Authorization: Bearer \$CRON_SECRET' http://localhost:3000/api/cron/payments-dbsync"

# Check DB-Sync connectivity from gateway
ssh michael@192.168.170.10 "nc -zv 192.168.170.20 5432"

# Verify DBSYNC_DATABASE_URL is set
ssh michael@192.168.170.10 "grep DBSYNC /opt/cardano-api-service/apps/web/.env"

# Check pending payments in database
ssh michael@192.168.170.10 "sudo -u postgres psql -d cardano_api -c \"SELECT id, status, amount FROM \\\"Payment\\\" WHERE status IN ('PENDING', 'CONFIRMING')\""

# Restart payment monitor
ssh michael@192.168.170.10 "sudo systemctl restart payment-monitor-dbsync"
```