# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

This is a Cardano stake pool infrastructure project with three main components:

1. **Stake Pool Operations** - A fully deployed Cardano stake pool (NACHO) with block producer, relay nodes, and monitoring
2. **API Service Platform** - A Cardano API-as-a-Service platform (similar to QuickNode) with ADA payments
3. **Marketing Website** - WordPress site at nacho.builders with GeneratePress child theme

## Documentation Modules

Detailed documentation is organized in `.claude/`:

| Module | Description |
|--------|-------------|
| [infrastructure.md](.claude/infrastructure.md) | Network architecture, VLANs, nodes, Ansible deployment, safe relay restart |
| [api-platform.md](.claude/api-platform.md) | Kong Gateway, Ogmios caching, Redis, usage tracking, API endpoints |
| [billing.md](.claude/billing.md) | ADA payments, credit packages, pricing, payment monitor |
| [db-sync.md](.claude/db-sync.md) | Cardano DB-Sync, Hasura GraphQL, blockchain indexing |
| [wordpress.md](.claude/wordpress.md) | Marketing site, theme customization, CSS variables |
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
| 150 | 192.168.150.0/24 | Web Services | pfSense (.1), Proxmox (.222), NPM (.224), WordPress (.223) |
| 2 | 192.168.2.0/24 | WireGuard VPN | Remote management access |

**Key URLs:**
- Web App: https://app.nacho.builders
- API Gateway: https://api.nacho.builders
- Marketing: https://nacho.builders
- Monitoring: http://192.168.160.2:3000

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
- Block producer should never have public internet exposure
- API service requires **pnpm** (not npm or yarn)
- Database changes should use Prisma migrations
- Encrypt vault files: `ansible-vault encrypt ansible/inventory/group_vars/api_platform/vault.yml`

## Visual Architecture

For diagrams, see:
- **Interactive Diagram v2** ⭐: `docs/complete-network-diagram-v2.html`
- **Diagram Guide**: `docs/NETWORK-DIAGRAMS.md`
- **Complete Reference**: `docs/architecture/complete-network-reference.md`
