# Cardano API Service Platform

> QuickNode-style Cardano API as a Service with ADA payments

## Overview

This platform provides RESTful and WebSocket access to the Cardano blockchain through multiple API types:
- **Ogmios** - WebSocket JSON-RPC for chain queries and transaction submission
- **Submit API** - REST endpoint for transaction submission
- **GraphQL** - Rich query interface powered by Cardano DB-Sync

## Architecture

- **Frontend:** Next.js 14 with TypeScript, Tailwind CSS
- **Auth:** NextAuth.js (Google, Microsoft, Email)
- **Database:** PostgreSQL 15 with Prisma ORM
- **API Gateway:** Kong Gateway with HAProxy load balancing
- **Backend:** Cardano relay nodes with Ogmios, Submit API, DB-Sync

## Pricing

**Free Tier:** 10,000 credits/month (resets monthly)
**Paid Tier:** Buy credits with ADA (never expire, roll over)

## Project Structure

```
cardano-api-service/
├── apps/
│   ├── web/          # Main Next.js application
│   └── docs/         # API documentation site
├── packages/
│   ├── database/     # Shared Prisma schema
│   ├── api/          # tRPC API definitions
│   └── ui/           # Shared UI components
```

## Development

### Prerequisites

- Node.js 20+ LTS
- pnpm 8+
- PostgreSQL 15
- Access to Cardano relay nodes

### Setup

```bash
# Install dependencies
pnpm install

# Setup database
cd apps/web
cp .env.example .env
# Edit .env with your database credentials

# Run migrations
pnpm db:push

# Start development server
pnpm dev
```

### Services

- Web app: http://localhost:3000
- API docs: http://localhost:3001
- Kong Gateway: http://192.168.170.10:8000
- PostgreSQL: 192.168.170.10:5432

## Deployment

### Infrastructure Requirements

- Ubuntu 22.04 LTS VMs on VLAN 170
- Nginx Proxy Manager for TLS termination
- Kong Gateway for API management
- HAProxy for load balancing

### Ansible Deployment

```bash
# From the ansible/ directory in the parent project

# Install Ogmios + Submit API on relay nodes
ansible-playbook playbooks/06-install-ogmios.yml

# Setup DB-Sync
ansible-playbook playbooks/07-setup-dbsync.yml

# Setup API Gateway (Kong + HAProxy)
ansible-playbook playbooks/08-setup-gateway.yml

# Extend monitoring
ansible-playbook playbooks/09-extend-monitoring.yml
```

## Monitoring

- **Grafana:** http://192.168.160.2:3000
  - Technical Operations Dashboard
  - Business Analytics Dashboard
- **Prometheus:** http://192.168.160.2:9090

## API Endpoints

```
https://api.nacho.builders/v1/ogmios     # Ogmios WebSocket
https://api.nacho.builders/v1/submit     # Transaction submission
https://api.nacho.builders/v1/graphql    # GraphQL queries
```

## License

Private - All Rights Reserved

## Contact

support@nacho.builders




