# Cardano Stake Pool - Ansible Automation

This directory contains Ansible playbooks for deploying and managing Cardano stake pool nodes.

## Current Deployment Status

| Node | IP | Status | cardano-node |
|------|-----|--------|--------------|
| cardano-bp | 192.168.160.10 | ✅ Syncing | v10.5.3 |
| cardano-relay1 | 192.168.160.11 | ✅ Syncing | v10.5.3 |
| cardano-relay2 | 192.168.160.12 | ✅ Syncing | v10.5.3 |

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

Host 192.168.160.*
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
│       ├── cardano.yml      # Common variables
│       ├── cardano_bp.yml   # Block Producer specific
│       └── cardano_relays.yml # Relay specific
├── playbooks/
│   ├── 00-bootstrap.yml     # Initial setup
│   ├── 01-harden.yml        # Security hardening
│   ├── 02-install-guild.yml # Install Cardano node
│   ├── 03-configure-topology.yml # Configure P2P
│   └── 99-update-nodes.yml  # Routine updates
└── templates/
    ├── chrony.conf.j2       # NTP configuration
    └── cnode.service.j2     # Systemd service
```

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

### Run Individual Playbooks

```bash
# Bootstrap (initial setup)
ansible-playbook playbooks/00-bootstrap.yml

# Security hardening
ansible-playbook playbooks/01-harden.yml

# Install Guild Operators / Cardano node
ansible-playbook playbooks/02-install-guild.yml

# Configure topology
ansible-playbook playbooks/03-configure-topology.yml

# Routine updates
ansible-playbook playbooks/99-update-nodes.yml
```

### Target Specific Nodes

```bash
# Only Block Producer
ansible-playbook playbooks/99-update-nodes.yml --limit cardano_bp

# Only Relays
ansible-playbook playbooks/99-update-nodes.yml --limit cardano_relays

# Single node
ansible-playbook playbooks/99-update-nodes.yml --limit cardano-relay1
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

```bash
# Restart all nodes
ansible all -m systemd -a "name=cnode state=restarted" --become

# Restart only relays
ansible cardano_relays -m systemd -a "name=cnode state=restarted" --become
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

---

## Node Information

| Node | VM ID | IP | Type | Ansible Group |
|------|-------|-----|------|---------------|
| cardano-bp | 111 | 192.168.160.10 | Block Producer | cardano_bp |
| cardano-relay1 | 112 | 192.168.160.11 | Relay | cardano_relays |
| cardano-relay2 | 113 | 192.168.160.12 | Relay | cardano_relays |

### User Accounts

| User | Purpose | Notes |
|------|---------|-------|
| `michael` | SSH admin | Has passwordless sudo |
| `cardano` | Service account | Runs cardano-node, owns binaries |

### Important Paths

| Path | Description |
|------|-------------|
| `/opt/cardano/cnode` | CNODE_HOME |
| `/opt/cardano/cnode/scripts/env` | Environment config |
| `/opt/cardano/cnode/scripts/gLiveView.sh` | Monitoring tool |
| `/opt/cardano/cnode/files/topology.json` | P2P topology |
| `/opt/cardano/cnode/db` | Blockchain database |
| `/home/cardano/.local/bin` | cardano-node, cardano-cli |

---

## Customization

### Change Network (mainnet/preprod)

Edit `inventory/group_vars/cardano.yml`:

```yaml
cardano_network: preprod  # or mainnet
```

### Add More Relays

Edit `inventory/hosts.yml` and add under `cardano_relays`:

```yaml
cardano-relay3:
  ansible_host: 192.168.160.13
  cardano_node_type: relay
  cardano_node_port: 6000
  cardano_public_port: 6003
```

Then update topology and UniFi port forwarding.

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

# Restart node
ansible all -m systemd -a "name=cnode state=restarted" --become
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
- Creates directory structure
- Downloads and runs guild-deploy.sh
- Installs cardano-node binaries
- Configures systemd service

### 03-configure-topology.yml
- Creates topology.json for BP (connects to relays only)
- Creates topology.json for relays (connects to BP + public network)
- Restarts nodes to apply changes

### 99-update-nodes.yml
- Updates system packages
- Updates Guild Operators scripts
- Checks node status
- Runs one node at a time for safety

---

*Last Updated: December 23, 2025*
