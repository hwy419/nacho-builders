# Cardano Stake Pool Documentation

## nacho.builders

Welcome to the documentation for the **NACHO** Cardano Stake Pool and API Platform. This knowledge base contains everything needed to deploy, operate, and maintain the complete infrastructure.

---

## Current Status

### Stake Pool

| Component | Status | Details |
|-----------|--------|---------|
| **Pool Registration** | Operational | Pool ID: `pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml` |
| **Block Producer** | Running | 192.168.160.10 - Producing blocks |
| **Relay 1** | Running | 192.168.160.11 - Port 6001, Ogmios 1337 |
| **Relay 2** | Running | 192.168.160.12 - Port 6002, Ogmios 1337 |
| **Monitoring** | Running | 192.168.160.2 - Prometheus + Grafana |
| **Cardano Node** | v10.5.3 | All nodes synced |

### API Platform

| Component | Status | Details |
|-----------|--------|---------|
| **Web App** | Live | https://app.nacho.builders |
| **API Gateway** | Live | https://api.nacho.builders |
| **Kong Gateway** | Running | 192.168.170.10:8000 |
| **Ogmios Cache Proxy** | Running | 97.5% cache hit rate |
| **DB-Sync** | Running | 192.168.170.20 - Blockchain indexer |
| **Payment System** | Active | ADA payments with 2s detection |
| **Preprod Testnet** | Running | 192.168.161.11 - Testnet API |

---

## Network Architecture Diagrams

**Interactive visualizations available:**

- **Interactive Diagram v2**: [`complete-network-diagram-v2.html`](complete-network-diagram-v2.html) - Reorganized layout with real-time verified data
- **Complete Reference**: [`architecture/complete-network-reference.md`](architecture/complete-network-reference.md) - Full technical documentation
- **Diagram Guide**: [`NETWORK-DIAGRAMS.md`](NETWORK-DIAGRAMS.md) - How to view and use diagrams

**What's included:**
- All 3 VLANs (160-Mainnet, 161-Preprod, 170-API Platform)
- Complete IP address allocation and port mappings
- Data flow diagrams and security boundaries
- Service inventory and configuration paths

---

## Documentation Structure

```
docs/
├── README.md                         <- You are here
├── NETWORK-DIAGRAMS.md               <- Guide to network diagrams
├── DIAGRAM-IMPROVEMENTS.md           <- v2 improvements
├── complete-network-diagram-v2.html  <- Interactive visualization (v2)
├── complete-network-diagram.html     <- Original network diagram
├── topology-diagram.html             <- Simplified topology
├── pool-config.md                    <- Pool configuration details
├── redis-cache-config.md             <- Redis caching documentation
├── architecture/
│   ├── overview.md                   <- Architecture overview
│   └── complete-network-reference.md <- Complete network reference
├── api-service/                      <- API platform documentation
│   ├── DEPLOYMENT-GUIDE.md           <- Deployment steps
│   ├── DEPLOYMENT-COMPLETE.md        <- Completion checklist
│   ├── dbsync-troubleshooting.md     <- DB-Sync debugging
│   └── ...
├── operations/                       <- Day-to-day procedures
│   ├── health-checks.md              <- Health monitoring
│   ├── monitoring.md                 <- Prometheus/Grafana setup
│   ├── maintenance.md                <- Maintenance procedures
│   ├── key-rotation.md               <- KES key rotation
│   └── pool-registration.md          <- Registration guide
├── security/
│   ├── checklist.md                  <- Security checklist
│   └── pentest-report-2024-12-24.md  <- Penetration test report
├── plans/                            <- Implementation guides
├── runbooks/                         <- Emergency procedures
├── grafana/                          <- Dashboard configurations
└── safe-keeping/                     <- Sensitive data (gitignored)
```

---

## Infrastructure Overview

### VLAN 160 - Mainnet Stake Pool

| Component | IP Address | Purpose |
|-----------|------------|---------|
| **Block Producer** | 192.168.160.10 | Creates blocks (PRIVATE - no internet) |
| **Relay 1** | 192.168.160.11 | Public relay (Port 6001), Ogmios (1337) |
| **Relay 2** | 192.168.160.12 | Public relay (Port 6002), Ogmios (1337) |
| **Monitoring** | 192.168.160.2 | Prometheus + Grafana |

### VLAN 161 - Preprod Testnet

| Component | IP Address | Purpose |
|-----------|------------|---------|
| **Preprod Relay** | 192.168.161.11 | Testnet relay, Ogmios (1337) |

### VLAN 170 - API Platform

| Component | IP Address | Purpose |
|-----------|------------|---------|
| **API Gateway** | 192.168.170.10 | Kong, Web App, Redis, PostgreSQL, Ogmios Proxies |
| **DB-Sync** | 192.168.170.20 | Blockchain indexer (cexplorer database) |

### Proxmox Virtual Machines

| ID | Name | Type | vCPUs | RAM | Storage | Status |
|----|------|------|-------|-----|---------|--------|
| 111 | cardano-bp | VM | 4 | 32 GB | 200 GB | Running |
| 112 | cardano-relay1 | VM | 4 | 32 GB | 200 GB | Running |
| 113 | cardano-relay2 | VM | 4 | 32 GB | 200 GB | Running |
| 116 | cardano-monitor | LXC | 2 | 2 GB | 20 GB | Running |
| - | preprod-relay | VM | 4 | 16 GB | 200 GB | Running |
| - | api-gateway | VM | 4 | 8 GB | 50 GB | Running |
| - | db-sync | VM | 4 | 32 GB | 500 GB | Running |

---

## API Platform

### Public Endpoints

| Endpoint | Network | Description |
|----------|---------|-------------|
| `wss://api.nacho.builders/v1/ogmios` | Mainnet | Ogmios WebSocket JSON-RPC |
| `https://api.nacho.builders/v1/submit` | Mainnet | Transaction submission |
| `wss://api.nacho.builders/v1/preprod/ogmios` | Preprod | Ogmios WebSocket (testnet) |
| `https://api.nacho.builders/v1/preprod/submit` | Preprod | Transaction submission (testnet) |

### API Tiers

| Feature | FREE | PAID |
|---------|------|------|
| Rate limit | 100 req/s | 500 req/s |
| Daily limit | 100,000 | Unlimited |
| WebSocket connections | 5 | 50 |
| Credits consumed | None | 1 per request |

### Pricing (ADA)

| Package | Credits | ADA | USD* |
|---------|---------|-----|------|
| Starter | 400,000 | 3 | ~$1.14 |
| Standard | 2,000,000 | 12 | ~$4.56 |
| Pro | 8,000,000 | 40 | ~$15.20 |
| Enterprise | 40,000,000 | 125 | ~$47.50 |

*USD estimates at ~$0.38/ADA

---

## Quick Start

### Check Node Sync Status

```bash
# Mainnet nodes
for host in 192.168.160.10 192.168.160.11 192.168.160.12; do
  echo "=== Node at $host ==="
  ssh michael@$host "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"
done

# Preprod testnet
ssh michael@192.168.161.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --testnet-magic 1'"
```

### Monitoring Dashboards

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://192.168.160.2:3000 | admin / (configured) |
| **Prometheus** | http://192.168.160.2:9090 | No auth |

### Common Ansible Commands

```bash
cd ~/claudecode/cardano-spo/ansible

# Ping all nodes
ansible all -m ping

# Check node status
ansible all -m shell -a "systemctl status cnode --no-pager | head -5" --become

# Run full deployment
ansible-playbook site.yml

# Deploy specific components
ansible-playbook playbooks/06-install-ogmios.yml    # Ogmios on relays
ansible-playbook playbooks/07-setup-dbsync.yml      # DB-Sync server
ansible-playbook playbooks/08-setup-gateway.yml     # Kong + Web App
ansible-playbook playbooks/10-deploy-webapp.yml     # Web app updates
```

---

## Deployment Playbooks

| Playbook | Purpose |
|----------|---------|
| `00-bootstrap.yml` | Initial OS setup, packages, NTP |
| `01-harden.yml` | Security hardening (SSH, UFW, fail2ban) |
| `02-install-guild.yml` | Install Cardano node via Guild Operators |
| `03-configure-topology.yml` | Configure P2P topology |
| `04-extend-storage.yml` | Extend disk storage if needed |
| `05-setup-monitoring.yml` | Deploy Prometheus + Grafana |
| `06-install-ogmios.yml` | Install Ogmios on relay nodes |
| `07-setup-dbsync.yml` | Deploy DB-Sync blockchain indexer |
| `08-setup-gateway.yml` | Kong API Gateway + Web App |
| `09-extend-monitoring.yml` | Additional monitoring config |
| `10-deploy-webapp.yml` | Web app deployment |
| `99-update-nodes.yml` | Routine updates and maintenance |

---

## Pool Information

| Property | Value |
|----------|-------|
| **Pool ID** | `pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml` |
| **Ticker** | NACHO |
| **Network** | Mainnet |
| **Node Version** | 10.5.3 |
| **Fixed Fee** | 340 ADA |
| **Margin** | 2% |
| **Pledge** | 10,000 ADA |
| **Metadata URL** | https://nacho.builders/poolMetaData.json |

### View Pool

- [CardanoScan](https://cardanoscan.io/pool/pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml)
- [Pool.pm](https://pool.pm/pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml)

---

## Security

### Latest Security Audit (December 24, 2025)

**Overall Posture: STRONG** - Full report: `security/pentest-report-2024-12-24.md`

| Finding | Severity | Status |
|---------|----------|--------|
| NOPASSWD sudo for users | MEDIUM | Pending remediation |
| PeerSharing disabled | LOW | Acceptable |
| All other controls | N/A | Verified working |

### Verified Security Controls

- VLAN isolation (stake pool, testnet, API platform separated)
- Block producer has no public internet access
- Lateral movement blocked (relays cannot SSH to BP)
- SSH password authentication disabled
- fail2ban actively blocking attacks
- Prometheus metrics bound to localhost only
- Air-gapped VM for cold key operations

### Files NEVER on Network

These files exist **only** on the air-gapped machine:
- `cold.skey` - Pool cold signing key
- `cold.counter` - Operational certificate counter
- `stake.skey` - Stake signing key
- `payment.skey` - Payment signing key

---

## Software Versions

| Component | Version |
|-----------|---------|
| Ubuntu | 22.04.5 LTS |
| cardano-node | 10.5.3 |
| Proxmox VE | 8.2.2 |
| Next.js | 14.x |
| Kong Gateway | 3.x |
| PostgreSQL | 15.x |
| Redis | 6.x |

---

## Resources

### Official Documentation
- [Cardano Developer Portal](https://developers.cardano.org/)
- [Guild Operators](https://cardano-community.github.io/guild-operators/)
- [Ogmios Documentation](https://ogmios.dev/)

### Community
- [SPO Telegram](https://t.me/CardanoStakePoolWorkgroup)
- [Cardano Forum](https://forum.cardano.org/)

---

*Last Updated: January 2026*
