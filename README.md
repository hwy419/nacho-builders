# Cardano NACHO Stake Pool Infrastructure

A production-grade Cardano stake pool (NACHO) with an integrated API-as-a-Service platform for Cardano blockchain access.

## Overview

This project contains two main components:

1. **Stake Pool Operations** - A fully deployed Cardano stake pool with block producer, relay nodes, and monitoring
2. **API Service Platform** - A Cardano API-as-a-Service platform (similar to QuickNode/Blockfrost) with ADA payments

### Live Services

| Service | URL | Description |
|---------|-----|-------------|
| **API Gateway** | https://api.nacho.builders | Ogmios WebSocket & Submit API |
| **Web App** | https://app.nacho.builders | Dashboard, billing, API key management |
| **Pool Relays** | nacho.builders:6001, :6002 | Public Cardano relay endpoints |
| **Monitoring** | http://192.168.160.2:3000 | Grafana dashboards (internal) |

## Architecture

### Network Layout

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           VLAN 160 - Mainnet Stake Pool                      │
│  ┌──────────────┐   ┌──────────────┐   ┌──────────────┐   ┌──────────────┐  │
│  │ Block Producer│   │   Relay 1   │   │   Relay 2   │   │  Monitoring  │  │
│  │ 192.168.160.10│   │192.168.160.11│   │192.168.160.12│   │192.168.160.2 │  │
│  │   (private)   │◄─►│  Port 6001  │◄─►│  Port 6002  │   │Prometheus/   │  │
│  │               │   │  Ogmios 1337│   │  Ogmios 1337│   │  Grafana     │  │
│  └──────────────┘   └──────────────┘   └──────────────┘   └──────────────┘  │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           VLAN 161 - Preprod Testnet                         │
│  ┌──────────────┐                                                            │
│  │ Preprod Relay│                                                            │
│  │192.168.161.11│  Testnet relay for API service development                 │
│  │  Ogmios 1337 │                                                            │
│  └──────────────┘                                                            │
└─────────────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                           VLAN 170 - API Platform                            │
│  ┌─────────────────────────────────────┐   ┌──────────────────────────────┐ │
│  │            API Gateway              │   │          DB-Sync             │ │
│  │          192.168.170.10             │   │       192.168.170.20         │ │
│  │  ┌─────────────────────────────┐   │   │                              │ │
│  │  │ Kong Gateway (api.nacho.*)  │   │   │  Blockchain indexer for      │ │
│  │  │ Web App (app.nacho.*)       │   │   │  fast payment detection      │ │
│  │  │ Ogmios Cache Proxies        │   │   │  PostgreSQL (cexplorer)      │ │
│  │  │ PostgreSQL (cardano_api)    │   │   │                              │ │
│  │  │ Redis Cache                 │   │   │                              │ │
│  │  │ Payment Monitor             │   │   │                              │ │
│  │  └─────────────────────────────┘   │   │                              │ │
│  └─────────────────────────────────────┘   └──────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Technology Stack

| Layer | Technologies |
|-------|-------------|
| **Infrastructure** | Proxmox VE 8.2, Ubuntu 22.04 LTS, UniFi networking |
| **Cardano** | cardano-node 10.5.3, Ogmios, DB-Sync, Guild Operators |
| **API Platform** | Next.js 14, TypeScript, PostgreSQL, Prisma, Kong Gateway |
| **Caching** | Redis 6.x, custom WebSocket proxy (97.5% cache hit rate) |
| **Auth** | NextAuth.js v4, Google OAuth, AWS SES magic links |
| **Monitoring** | Prometheus, Grafana, Node Exporter |
| **Automation** | Ansible 2.9+ |

## Quick Start

### Check Node Status

```bash
# Check sync status on all mainnet nodes
for host in 192.168.160.10 192.168.160.11 192.168.160.12; do
  echo "=== Mainnet Node at $host ==="
  ssh michael@$host "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"
done

# Check preprod node
ssh michael@192.168.161.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --testnet-magic 1'"
```

### Ansible Operations

```bash
cd ~/claudecode/cardano-spo/ansible

# Test connectivity
ansible all -m ping

# Run full deployment
ansible-playbook site.yml

# Update nodes (one at a time for safety)
ansible-playbook playbooks/99-update-nodes.yml
```

### API Service Development

```bash
cd ~/claudecode/cardano-spo/cardano-api-service

# Install dependencies
pnpm install

# Run development server
pnpm dev

# Build for production
pnpm build
```

## Project Structure

```
cardano-spo/
├── README.md                 # This file
├── CLAUDE.md                 # AI assistant instructions (comprehensive)
├── CHANGELOG.md              # Deployment changelog
├── ansible/                  # Infrastructure automation
│   ├── playbooks/           # 17 deployment playbooks
│   ├── inventory/           # Host definitions and variables
│   ├── templates/           # Jinja2 templates
│   └── files/               # Static files (Kong plugins)
├── cardano-api-service/      # API platform (Next.js monorepo)
│   └── apps/web/            # Main web application
├── docs/                     # Documentation
│   ├── architecture/        # System design
│   ├── operations/          # Operational procedures
│   ├── security/            # Security docs and audits
│   ├── api-service/         # API platform docs
│   └── *.html               # Interactive network diagrams
├── scripts/                  # Operational helper scripts
└── metadata/                 # Pool metadata files
```

## API Endpoints

### Public API (requires API key)

| Endpoint | Network | Description |
|----------|---------|-------------|
| `wss://api.nacho.builders/v1/ogmios` | Mainnet | Ogmios WebSocket JSON-RPC |
| `https://api.nacho.builders/v1/submit` | Mainnet | Transaction submission |
| `wss://api.nacho.builders/v1/preprod/ogmios` | Preprod | Ogmios WebSocket (testnet) |
| `https://api.nacho.builders/v1/preprod/submit` | Preprod | Transaction submission (testnet) |

**Authentication:** Include `apikey: napi_xxx` header in requests.

### API Tiers

| Feature | FREE | PAID |
|---------|------|------|
| Rate limit | 100 req/s | 500 req/s |
| Daily limit | 100,000 | Unlimited |
| WebSocket connections | 5 | 50 |
| Credits | N/A | 1 per request |

## Pricing (ADA Payments)

| Package | Credits | ADA | USD* |
|---------|---------|-----|------|
| Starter | 400,000 | 3 | ~$1.14 |
| Standard | 2,000,000 | 12 | ~$4.56 |
| Pro | 8,000,000 | 40 | ~$15.20 |
| Enterprise | 40,000,000 | 125 | ~$47.50 |

*USD estimates at ~$0.38/ADA

## Key Services

### On Relay Nodes (192.168.160.11, .12)
- `cnode` - Cardano node
- `ogmios` - WebSocket query layer (port 1337)

### On API Gateway (192.168.170.10)
- `kong` - API gateway
- `cardano-api-web` - Next.js web app
- `ogmios-cache-proxy` - Mainnet caching proxy (port 3001)
- `ogmios-cache-proxy-preprod` - Preprod caching proxy (port 3002)
- `redis-server` - Cache storage
- `postgresql` - Application database
- `payment-monitor-dbsync` - Payment detection (2s polling)

### On DB-Sync Server (192.168.170.20)
- `cardano-db-sync` - Blockchain indexer
- `postgresql` - Indexed blockchain data (cexplorer)

## Documentation

| Document | Location | Description |
|----------|----------|-------------|
| **Complete Reference** | `CLAUDE.md` | Comprehensive technical documentation |
| **Network Diagrams** | `docs/complete-network-diagram-v2.html` | Interactive architecture visualization |
| **API Service Docs** | `docs/api-service/` | Deployment and troubleshooting guides |
| **Operations Guide** | `docs/operations/` | Day-to-day procedures |
| **Security Audit** | `docs/security/pentest-report-2024-12-24.md` | Security assessment |

## Critical Operations

### Safe Relay Restart Procedure

**Never restart both relay nodes simultaneously.** The block producer depends on relay connectivity.

```bash
# 1. Restart Relay 1 and wait for 100% sync
ssh michael@192.168.160.11 "sudo systemctl restart cnode"
# Wait for syncProgress: "100.00"

# 2. Verify block producer has connectivity
ssh michael@192.168.160.10 "curl -s http://localhost:12798/metrics | grep ActivePeers"

# 3. Only then restart Relay 2
ssh michael@192.168.160.12 "sudo systemctl restart cnode"
```

## Pool Information

| Property | Value |
|----------|-------|
| **Ticker** | NACHO |
| **Network** | Mainnet |
| **Node Version** | 10.5.3 |
| **Fixed Fee** | 340 ADA |
| **Margin** | 1.5% |
| **Pledge** | 10,000 ADA |
| **Metadata** | https://hwy419.github.io/nacho-builders/poolMetaData.json |

## Security

- VLANs isolate stake pool, testnet, and API platform
- Block producer has no public internet access
- Air-gapped machine for cold key management
- SSH key-only authentication
- fail2ban active on all nodes
- Regular security audits

See `docs/security/checklist.md` for the complete security checklist.

## Contributing

This is a private infrastructure project. For support, contact support@nacho.builders.

## License

Private - All Rights Reserved

---

*Last Updated: January 2026*
