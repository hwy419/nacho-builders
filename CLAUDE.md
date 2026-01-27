# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Cardano stake pool infrastructure project with two main components:

1. **Stake Pool Operations** - A fully deployed Cardano stake pool (NACHO) with block producer, relay nodes, and monitoring
2. **API Service Platform** - A Cardano API-as-a-Service platform (similar to QuickNode) with ADA payments, includes pool marketing site at nacho.builders

## Documentation Modules

Detailed documentation is organized in `.claude/`:

| Module | Description |
|--------|-------------|
| [infrastructure.md](.claude/infrastructure.md) | Network architecture, VLANs, nodes, Ansible deployment, safe relay restart |
| [api-platform.md](.claude/api-platform.md) | Kong Gateway, Ogmios caching, Redis, usage tracking, API endpoints |
| [billing.md](.claude/billing.md) | ADA payments, credit packages, pricing, payment monitor |
| [db-sync.md](.claude/db-sync.md) | Cardano DB-Sync, Hasura GraphQL, blockchain indexing |
| [wordpress.md](.claude/wordpress.md) | Legacy WordPress (nacho.builders now served by Next.js) |
| [authentication.md](.claude/authentication.md) | NextAuth.js, Google OAuth, magic links |
| [commands.md](.claude/commands.md) | Quick reference for all common commands |
| [troubleshooting.md](.claude/troubleshooting.md) | Debugging procedures for all services |

## Quick Start Commands

```bash
# API Service (Next.js)
cd ~/claudecode/cardano-spo/cardano-api-service
pnpm install && pnpm dev

# Ansible
cd ~/claudecode/cardano-spo/ansible
ansible all -m ping
ansible-playbook site.yml

# Check node sync status
ssh michael@192.168.160.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"
```

## Infrastructure Summary

| VLAN | Network | Purpose | Key Hosts |
|------|---------|---------|-----------|
| 160 | 192.168.160.0/24 | Mainnet Stake Pool | BP (.10), Relay1 (.11), Relay2 (.12), Monitoring (.2) |
| 161 | 192.168.161.0/24 | Preprod Testnet | Preprod Relay (.11) |
| 170 | 192.168.170.0/24 | API Platform | Gateway (.10), DB-Sync (.20) |
| 150 | 192.168.150.0/24 | Infrastructure | pfSense (.1), Proxmox (.222) |
| 2 | 192.168.2.0/24 | WireGuard VPN | Remote management access |

**Key URLs (all routed via Kong Gateway on 192.168.170.10):**
- Pool Landing: https://nacho.builders (Next.js /pool page)
- Web App: https://app.nacho.builders (Next.js dashboard)
- API Gateway: https://api.nacho.builders (Kong API routes)
- Monitoring: http://192.168.160.2:3000 (Grafana)

## Technology Stack

| Layer | Technologies |
|-------|-------------|
| Infrastructure | Proxmox VE 8.2.2, Ubuntu 22.04 LTS, Ansible |
| Cardano | cardano-node 10.5.3, Guild Operators scripts, DB-Sync |
| API Service | Next.js 14, TypeScript, PostgreSQL, Prisma, Kong Gateway |
| Caching | Redis 6.x, Ogmios WebSocket proxy |
| Auth | NextAuth.js v4, Google OAuth, AWS SES |
| Monitoring | Prometheus, Grafana |

## Important Reminders

- **Never commit sensitive keys or credentials**
- **CRITICAL: Never restart both relay nodes simultaneously** (see [infrastructure.md](.claude/infrastructure.md#safe-relay-restart-procedure))
- **CRITICAL: Web app must be built locally, not on the server** - The WASM build fails on Node 20 (server). Build on macOS (Node 18), then rsync `.next/` to server. See [api-platform.md](.claude/api-platform.md#web-app-deployment) for full procedure.
- Block producer should never have public internet exposure
- API service requires **pnpm** (not npm or yarn)
- Database changes should use Prisma migrations
- Encrypt vault files: `ansible-vault encrypt ansible/inventory/group_vars/api_platform/vault.yml`

## Visual Architecture

For diagrams, see:
- **Interactive Diagram v2** ⭐: `docs/complete-network-diagram-v2.html`
- **Diagram Guide**: `docs/NETWORK-DIAGRAMS.md`
- **Complete Reference**: `docs/architecture/complete-network-reference.md`
