# Cardano API Service Platform

> Cardano API as a Service with ADA payments - Similar to QuickNode/Blockfrost

## Overview

This platform provides WebSocket and REST access to the Cardano blockchain through multiple API types:
- **Ogmios** - WebSocket JSON-RPC for chain queries (tip, UTxOs, protocol parameters, etc.)
- **Submit API** - REST endpoint for transaction submission
- **Multi-Network** - Support for both Mainnet and Preprod testnet

## Live Services

| Service | URL |
|---------|-----|
| **Web App** | https://app.nacho.builders |
| **API Gateway** | https://api.nacho.builders |

## Architecture

```
                    ┌─────────────────────────────────────┐
                    │         Kong API Gateway            │
                    │       api.nacho.builders            │
                    └─────────────┬───────────────────────┘
                                  │
          ┌───────────────────────┼───────────────────────┐
          │                       │                       │
          ▼                       ▼                       ▼
┌─────────────────┐   ┌─────────────────────┐   ┌─────────────────┐
│ /v1/ogmios      │   │ /v1/preprod/ogmios  │   │ /v1/submit      │
│ Cache Proxy 3001│   │ Cache Proxy 3002    │   │ Submit API      │
└────────┬────────┘   └─────────┬───────────┘   └────────┬────────┘
         │                      │                        │
         ▼                      ▼                        ▼
┌─────────────────┐   ┌─────────────────┐       ┌───────────────┐
│ Mainnet Relays  │   │  Preprod Relay  │       │ Relay Nodes   │
│ .11:1337, .12   │   │  161.11:1337    │       │ :8090         │
└─────────────────┘   └─────────────────┘       └───────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | Next.js 14, TypeScript, Tailwind CSS |
| **Auth** | NextAuth.js v4 (Google OAuth, Magic Link via AWS SES) |
| **Database** | PostgreSQL 15 with Prisma ORM |
| **API Gateway** | Kong Gateway with custom auth plugin |
| **Caching** | Redis + Custom WebSocket Proxy (97.5% hit rate) |
| **Backend** | Cardano relay nodes with Ogmios |
| **Indexer** | Cardano DB-Sync for payment detection |

## API Endpoints

### Mainnet

| Endpoint | Type | Description |
|----------|------|-------------|
| `wss://api.nacho.builders/v1/ogmios` | WebSocket | Ogmios JSON-RPC |
| `https://api.nacho.builders/v1/submit` | REST | Transaction submission |

### Preprod Testnet

| Endpoint | Type | Description |
|----------|------|-------------|
| `wss://api.nacho.builders/v1/preprod/ogmios` | WebSocket | Ogmios JSON-RPC (testnet) |
| `https://api.nacho.builders/v1/preprod/submit` | REST | Transaction submission (testnet) |

**Authentication:** All endpoints require an API key via `apikey` header.

## Pricing

### API Tiers

| Feature | FREE | PAID |
|---------|------|------|
| Keys per user | 1 (auto-created) | Unlimited |
| Rate limit | 100 req/s | 500 req/s |
| Daily limit | 100,000 requests | Unlimited |
| WebSocket connections | 5 | 50 |
| Credits consumed | None | 1 per request |
| Submit API | 10 tx/hour | Unlimited |

### Credit Packages (ADA)

| Package | Credits | ADA | USD* |
|---------|---------|-----|------|
| Starter | 400,000 | 3 | ~$1.14 |
| Standard | 2,000,000 | 12 | ~$4.56 |
| Pro | 8,000,000 | 40 | ~$15.20 |
| Enterprise | 40,000,000 | 125 | ~$47.50 |

*USD estimates at ~$0.38/ADA. Credits never expire.

## Project Structure

```
cardano-api-service/
├── apps/
│   └── web/                    # Main Next.js application
│       ├── src/
│       │   ├── app/            # Next.js App Router pages
│       │   │   ├── (public)/   # Public pages (landing, docs)
│       │   │   ├── (auth)/     # Authentication pages
│       │   │   ├── (dashboard)/ # Protected dashboard
│       │   │   ├── (admin)/    # Admin pages
│       │   │   └── api/        # API routes
│       │   ├── components/     # React components
│       │   ├── lib/            # Utilities and services
│       │   │   ├── auth.ts     # NextAuth configuration
│       │   │   ├── cardano/    # Cardano integration
│       │   │   └── jobs/       # Background jobs
│       │   └── server/         # Server-side utilities
│       ├── prisma/
│       │   └── schema.prisma   # Database schema
│       ├── scripts/
│       │   ├── ogmios-cache-proxy.js  # WebSocket caching proxy
│       │   └── load-test.js    # Performance testing
│       └── public/             # Static assets
├── package.json                # Monorepo root
├── pnpm-workspace.yaml         # Workspace config
└── turbo.json                  # Turborepo config
```

## Development

### Prerequisites

- Node.js 20+ LTS
- pnpm 8+
- PostgreSQL 15
- Redis (for caching proxy)

### Setup

```bash
# Install dependencies
pnpm install

# Setup database
cd apps/web
cp .env.example .env
# Edit .env with your credentials

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:push

# Start development server
pnpm dev
```

### Environment Variables

Key environment variables (see `.env.example` for full list):

```bash
# Database
DATABASE_URL="postgresql://..."

# Auth
NEXTAUTH_SECRET="..."
GOOGLE_CLIENT_ID="..."
GOOGLE_CLIENT_SECRET="..."
EMAIL_SERVER="smtp://..."

# Cardano
CARDANO_PAYMENT_XPRV="..."   # Master key for payment addresses

# DB-Sync (for payment detection)
DBSYNC_DATABASE_URL="postgresql://..."

# Internal
KONG_INTERNAL_SECRET="..."   # Kong <-> Web App auth
CRON_SECRET="..."            # Payment monitor auth
```

### Commands

```bash
# Development
pnpm dev              # Start dev server
pnpm build            # Build for production
pnpm lint             # Run linter
pnpm format           # Format code

# Database
pnpm db:generate      # Generate Prisma client
pnpm db:push          # Push schema to database
pnpm db:migrate       # Run migrations
pnpm db:studio        # Open Prisma Studio

# Testing
cd apps/web
node scripts/load-test.js 50 10  # 50 requests, 10 concurrent
```

## Deployment

### Fast Deploy (Build Local, Deploy Remote)

Building on the server is slow. Use this faster approach:

```bash
# 1. Build locally (~15 seconds)
cd ~/claudecode/cardano-spo/cardano-api-service/apps/web
export GOOGLE_CLIENT_ID="..."
export GOOGLE_CLIENT_SECRET="..."
export DATABASE_URL="postgresql://localhost/dummy"
pnpm exec prisma generate
pnpm run build

# 2. Sync to server
ssh michael@192.168.170.10 "sudo rm -rf /opt/cardano-api-service/apps/web/.next"
rsync -avz .next/ michael@192.168.170.10:/opt/cardano-api-service/apps/web/.next/
rsync -avz .next/static/ michael@192.168.170.10:/opt/cardano-api-service/apps/web/.next/standalone/apps/web/.next/static/

# 3. Restart service
ssh michael@192.168.170.10 "sudo chown -R cardano-api:cardano-api /opt/cardano-api-service/apps/web/.next && sudo systemctl restart cardano-api-web"
```

### Ansible Deployment

```bash
cd ~/claudecode/cardano-spo/ansible

# Full gateway setup (Kong + Web App + Redis + Proxy)
ansible-playbook playbooks/08-setup-gateway.yml

# Web app only
ansible-playbook playbooks/10-deploy-webapp.yml
```

## Services

### On API Gateway (192.168.170.10)

| Service | Port | Description |
|---------|------|-------------|
| `kong` | 8000/8443 | API Gateway |
| `cardano-api-web` | 3000 | Next.js web app |
| `ogmios-cache-proxy` | 3001 | Mainnet WebSocket proxy |
| `ogmios-cache-proxy-preprod` | 3002 | Preprod WebSocket proxy |
| `redis-server` | 6379 | Cache storage |
| `postgresql` | 5432 | Application database |
| `payment-monitor-dbsync` | - | Payment detection (2s polling) |

### Monitoring

- **Grafana:** http://192.168.160.2:3000
- **Prometheus:** http://192.168.160.2:9090

## Database Schema

Key models in Prisma schema:

```prisma
model User {
  id        String   @id
  email     String   @unique
  credits   Int      @default(0)
  role      Role     @default(USER)
  apiKeys   ApiKey[]
  payments  Payment[]
}

model ApiKey {
  id        String   @id
  keyPrefix String   // "napi_xxx" format
  keyHash   String   // Hashed full key
  name      String
  tier      Tier     @default(FREE)
  active    Boolean  @default(true)
  userId    String
}

model Payment {
  id             String        @id
  userId         String
  amount         Decimal       // ADA amount
  credits        Int           // Credits to add
  paymentAddress String        // Unique per payment
  status         PaymentStatus // PENDING, CONFIRMING, CONFIRMED
  txHash         String?       // Cardano tx hash
}

model UsageLog {
  id           String   @id
  apiKeyId     String
  endpoint     String   // "v1/ogmios", "v1/preprod/ogmios"
  network      String   // "mainnet" or "preprod"
  statusCode   Int
  responseTime Int      // milliseconds
  creditsUsed  Int
}
```

## License

Private - All Rights Reserved

## Contact

support@nacho.builders
