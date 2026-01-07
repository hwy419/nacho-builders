# Cardano Stake Pool - Ansible Automation

This directory contains Ansible playbooks for deploying and managing Cardano stake pool nodes and the API platform.

## Current Deployment Status

### Stake Pool (VLAN 160)

| Node | IP | Status | cardano-node |
|------|-----|--------|--------------|
| cardano-bp | 192.168.160.10 | Running | v10.5.3 |
| cardano-relay1 | 192.168.160.11 | Running | v10.5.3 |
| cardano-relay2 | 192.168.160.12 | Running | v10.5.3 |
| cardano-monitor | 192.168.160.2 | Running | Prometheus + Grafana |

### Preprod Testnet (VLAN 161)

| Node | IP | Status | Purpose |
|------|-----|--------|---------|
| preprod-relay | 192.168.161.11 | Running | Testnet API relay |

### API Platform (VLAN 170)

| Node | IP | Status | Services |
|------|-----|--------|----------|
| api-gateway | 192.168.170.10 | Running | Kong, Web App, Redis, PostgreSQL |
| db-sync | 192.168.170.20 | Running | Cardano DB-Sync |

---

## Prerequisites

### On your local machine (Mac):

```bash
# Install Ansible
brew install ansible
```

### SSH Configuration

Your `~/.ssh/config` should include:

```
Host cardano-bp
    HostName 192.168.160.10
    User michael
    IdentityFile ~/.ssh/cardano-spo

Host cardano-relay1
    HostName 192.168.160.11
    User michael
    IdentityFile ~/.ssh/cardano-spo

Host cardano-relay2
    HostName 192.168.160.12
    User michael
    IdentityFile ~/.ssh/cardano-spo

Host cardano-monitor
    HostName 192.168.160.2
    User michael
    IdentityFile ~/.ssh/cardano-spo

Host preprod-relay
    HostName 192.168.161.11
    User michael
    IdentityFile ~/.ssh/cardano-spo

Host api-gateway
    HostName 192.168.170.10
    User michael
    IdentityFile ~/.ssh/cardano-spo

Host db-sync
    HostName 192.168.170.20
    User michael
    IdentityFile ~/.ssh/cardano-spo

Host 192.168.160.* 192.168.161.* 192.168.170.*
    User michael
    IdentityFile ~/.ssh/cardano-spo
```

### SSH Agent (for passphrase-protected keys)

```bash
# Add key to agent (enter passphrase once)
ssh-add ~/.ssh/cardano-spo

# For persistent macOS keychain storage
ssh-add --apple-use-keychain ~/.ssh/cardano-spo
```

---

## Directory Structure

```
ansible/
├── ansible.cfg              # Ansible configuration
├── site.yml                 # Main playbook (runs all)
├── README.md                # This file
├── inventory/
│   ├── hosts.yml            # Node inventory
│   └── group_vars/
│       ├── cardano.yml      # Common Cardano variables
│       ├── cardano_bp.yml   # Block Producer specific
│       ├── cardano_relays.yml # Relay specific
│       ├── cardano_preprod.yml # Preprod testnet config
│       ├── monitoring.yml   # Monitoring config
│       ├── api_platform.yml # API platform config
│       └── api_platform/
│           └── vault.yml    # Encrypted secrets
├── playbooks/
│   ├── 00-bootstrap.yml         # Initial setup
│   ├── 01-harden.yml            # Security hardening
│   ├── 02-install-guild.yml     # Install Cardano node
│   ├── 03-configure-topology.yml # Configure P2P
│   ├── 04-extend-storage.yml    # Extend disk space
│   ├── 05-setup-monitoring.yml  # Prometheus + Grafana
│   ├── 06-install-ogmios.yml    # Ogmios on relays
│   ├── 07-setup-dbsync.yml      # DB-Sync setup
│   ├── 08-setup-gateway.yml     # Kong + Web App
│   ├── 09-extend-monitoring.yml # Extended monitoring
│   ├── 10-deploy-webapp.yml     # Web app deployment
│   ├── 10-enhanced-monitoring.yml # Enhanced monitoring
│   ├── 99-update-nodes.yml      # Routine updates
│   ├── diagnose-bp-cpu.yml      # BP CPU diagnostics
│   └── diagnose-relay-issue.yml # Relay diagnostics
├── files/
│   └── kong/plugins/cardano-api-auth/
│       ├── handler.lua      # Auth plugin logic
│       └── schema.lua       # Plugin schema
└── templates/
    ├── cnode.service.j2     # Cardano node service
    ├── ogmios.service.j2    # Ogmios service
    ├── cardano-db-sync.service.j2  # DB-Sync service
    ├── kong.conf.j2         # Kong configuration
    ├── configure-kong.sh.j2 # Kong setup script
    ├── webapp.env.j2        # Web app environment
    ├── cardano-dashboard.json # Grafana dashboard
    └── ...
```

---

## Playbooks

### Infrastructure Setup (Run in Order)

| Playbook | Purpose | Target Hosts |
|----------|---------|--------------|
| `00-bootstrap.yml` | Initial OS setup, packages, NTP | All nodes |
| `01-harden.yml` | Security hardening (SSH, UFW, fail2ban) | All nodes |
| `02-install-guild.yml` | Install Cardano node via Guild Operators | Cardano nodes |
| `03-configure-topology.yml` | Configure P2P topology | Cardano nodes |
| `04-extend-storage.yml` | Extend disk storage if needed | As needed |
| `05-setup-monitoring.yml` | Deploy Prometheus + Grafana | Monitoring host |

### API Platform (Run After Base Setup)

| Playbook | Purpose | Target Hosts |
|----------|---------|--------------|
| `06-install-ogmios.yml` | Install Ogmios on relay nodes | Relays |
| `07-setup-dbsync.yml` | Deploy DB-Sync blockchain indexer | DB-Sync host |
| `08-setup-gateway.yml` | Kong API Gateway + Web App | API Gateway |
| `09-extend-monitoring.yml` | Additional monitoring config | Monitoring host |
| `10-deploy-webapp.yml` | Web application deployment | API Gateway |
| `10-enhanced-monitoring.yml` | Enhanced monitoring setup | Monitoring host |

### Maintenance & Diagnostics

| Playbook | Purpose | Target Hosts |
|----------|---------|--------------|
| `99-update-nodes.yml` | Routine system updates | All nodes |
| `diagnose-bp-cpu.yml` | Block producer CPU diagnostics | Block Producer |
| `diagnose-relay-issue.yml` | Relay connectivity diagnostics | Relays |

---

## Quick Start

### Test Connectivity

```bash
cd ~/claudecode/cardano-spo/ansible

# Ping all nodes
ansible all -m ping

# Check node service status
ansible all -a "systemctl is-active cnode" --become
```

### Run Full Deployment

```bash
# Run all playbooks in order
ansible-playbook site.yml

# Or run individual playbooks
ansible-playbook playbooks/00-bootstrap.yml
ansible-playbook playbooks/01-harden.yml
# ... etc
```

### Target Specific Nodes

```bash
# Only Block Producer
ansible-playbook playbooks/99-update-nodes.yml --limit cardano_bp

# Only Relays
ansible-playbook playbooks/99-update-nodes.yml --limit cardano_relays

# Only API Platform
ansible-playbook playbooks/10-deploy-webapp.yml --limit api_platform

# Single node
ansible-playbook playbooks/99-update-nodes.yml --limit cardano-relay1
```

### Working with Vault (Encrypted Secrets)

```bash
# Edit vault file
ansible-vault edit inventory/group_vars/api_platform/vault.yml

# Run playbook with vault password
ansible-playbook playbooks/08-setup-gateway.yml --ask-vault-pass
```

---

## Common Operations

### Check Node Status

```bash
# Service status
ansible all -m shell -a "systemctl status cnode --no-pager | head -10" --become

# Check if syncing (view logs)
ansible all -m shell -a "journalctl -u cnode -n 20 --no-pager" --become

# Check disk usage
ansible all -a "df -h /opt/cardano/cnode/db"

# Check memory usage
ansible all -a "free -h"
```

### Restart Nodes

**CRITICAL: Never restart both relays simultaneously!**

```bash
# Restart Relay 1, wait for sync, then Relay 2
ansible cardano-relay1 -m systemd -a "name=cnode state=restarted" --become
# Wait for 100% sync...
ansible cardano-relay2 -m systemd -a "name=cnode state=restarted" --become
```

### View Logs

```bash
# Recent logs
ansible all -m shell -a "journalctl -u cnode -n 50 --no-pager" --become

# Follow logs (run on single node)
ssh cardano-bp "sudo journalctl -u cnode -f"
```

### Check Sync Progress

```bash
# SSH to node and use gLiveView
ssh cardano-bp
sudo su - cardano
cd /opt/cardano/cnode/scripts
./gLiveView.sh

# Or check tip via cardano-cli
cardano-cli query tip --socket-path /opt/cardano/cnode/sockets/node.socket --mainnet
```

### API Platform Operations

```bash
# Check Kong status
ansible api_platform -m shell -a "systemctl status kong --no-pager | head -10" --become

# Check web app status
ansible api_platform -m shell -a "systemctl status cardano-api-web --no-pager | head -10" --become

# Check DB-Sync status
ansible db_sync -m shell -a "systemctl status cardano-db-sync --no-pager | head -10" --become

# Restart web app
ansible api_platform -m systemd -a "name=cardano-api-web state=restarted" --become
```

---

## Host Groups

| Group | Hosts | Description |
|-------|-------|-------------|
| `cardano_bp` | cardano-bp | Block Producer |
| `cardano_relays` | cardano-relay1, cardano-relay2 | Mainnet Relays |
| `cardano_preprod` | preprod-relay | Preprod Testnet Relay |
| `monitoring` | cardano-monitor | Prometheus + Grafana |
| `api_platform` | api-gateway | Kong, Web App, Redis |
| `db_sync` | db-sync | Cardano DB-Sync |
| `all` | All hosts | Every managed host |

---

## User Accounts

| User | Purpose | Notes |
|------|---------|-------|
| `michael` | SSH admin | Has passwordless sudo |
| `cardano` | Cardano node service | Runs cardano-node, owns binaries |
| `cardano-api` | API platform service | Runs web app on API gateway |

---

## Important Paths

### Cardano Nodes

| Path | Description |
|------|-------------|
| `/opt/cardano/cnode` | CNODE_HOME |
| `/opt/cardano/cnode/scripts/env` | Environment config |
| `/opt/cardano/cnode/scripts/gLiveView.sh` | Monitoring tool |
| `/opt/cardano/cnode/files/topology.json` | P2P topology |
| `/opt/cardano/cnode/db` | Blockchain database |
| `/home/cardano/.local/bin` | cardano-node, cardano-cli |

### API Platform (192.168.170.10)

| Path | Description |
|------|-------------|
| `/opt/cardano-api-service` | Application root |
| `/opt/cardano-api-service/apps/web/.next/standalone` | Production build |
| `/opt/cardano-api-service/apps/web/.env` | Environment variables |
| `/opt/ogmios-cache-proxy` | Caching proxy installation |
| `/etc/kong/kong.conf` | Kong configuration |
| `/usr/local/share/lua/5.1/kong/plugins/cardano-api-auth/` | Custom Kong plugin |

### DB-Sync (192.168.170.20)

| Path | Description |
|------|-------------|
| `/opt/cardano-db-sync` | DB-Sync installation |
| `/opt/cardano-db-sync/config` | Configuration files |
| `/opt/cardano-db-sync/ledger-state` | Ledger state snapshots |

---

## Troubleshooting

### SSH Connection Issues

```bash
# Test SSH manually
ssh cardano-bp

# Check SSH agent has key
ssh-add -l

# Verbose Ansible output
ansible all -m ping -vvv
```

### Playbook Failures

```bash
# Run with verbose output
ansible-playbook playbooks/00-bootstrap.yml -vvv

# Start from specific task
ansible-playbook playbooks/00-bootstrap.yml --start-at-task="Task Name"

# Check syntax only
ansible-playbook playbooks/00-bootstrap.yml --syntax-check
```

### Node Not Syncing

```bash
# Check service is running
ansible all -a "systemctl is-active cnode" --become

# Check logs for errors
ansible all -m shell -a "journalctl -u cnode -n 100 --no-pager | grep -i error" --become

# Check topology file
ansible all -a "cat /opt/cardano/cnode/files/topology.json"

# Check socket exists
ansible all -a "ls -la /opt/cardano/cnode/sockets/"
```

### Permission Issues

```bash
# Fix cardano user permissions
ansible all -m shell -a "chown -R cardano:cardano /opt/cardano/cnode" --become
```

---

## Playbook Details

### 00-bootstrap.yml
- Updates packages
- Installs essential tools (jq, htop, tmux, etc.)
- Configures NTP (chrony)
- Sets timezone to UTC
- Creates cardano user
- Installs QEMU guest agent

### 01-harden.yml
- Hardens SSH (no root login, no password auth)
- Configures UFW firewall
- Sets up fail2ban
- Applies kernel security parameters

### 02-install-guild.yml
- Installs build dependencies
- Downloads and runs guild-deploy.sh
- Installs cardano-node binaries
- Configures systemd service

### 03-configure-topology.yml
- Creates topology.json for BP (connects to relays only)
- Creates topology.json for relays (connects to BP + public network)

### 05-setup-monitoring.yml
- Installs Prometheus and Grafana
- Deploys Node Exporter on all hosts
- Configures Cardano metrics scraping
- Deploys custom dashboards

### 06-install-ogmios.yml
- Installs Ogmios on relay nodes
- Configures WebSocket query layer
- Sets up systemd service

### 07-setup-dbsync.yml
- Installs Cardano DB-Sync
- Configures PostgreSQL (cexplorer database)
- Sets up socket proxy to relay node

### 08-setup-gateway.yml
- Installs Kong Gateway
- Deploys custom auth plugin
- Configures routes and upstreams
- Sets up Ogmios caching proxy
- Installs Redis for caching
- Deploys Next.js web application

### 10-deploy-webapp.yml
- Deploys web application updates
- Runs database migrations
- Restarts services

---

*Last Updated: January 2026*
