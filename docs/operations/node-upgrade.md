# Cardano Node Upgrade Guide

> **WARNING:** Never restart or upgrade both relay nodes simultaneously. The block producer depends on relay connectivity to propagate blocks. See [Safe Relay Restart Procedure](../../.claude/infrastructure.md#safe-relay-restart-procedure).

## Overview

This guide covers the complete procedure for upgrading cardano-node on the NACHO stake pool infrastructure using Guild Operators tools.

| Component | Current Version | Check Command |
|-----------|-----------------|---------------|
| cardano-node | 10.5.3 | `cardano-node --version` |
| cardano-cli | 10.5.3 | `cardano-cli --version` |

## Important Changes in Node 10.5.x+

Node 10.5.x introduced significant changes that affect operations:

| Change | Impact |
|--------|--------|
| **New logging format** | stdout via journald (no JSON log files) |
| **EKG monitoring removed** | Use SimplePrometheus backend instead |
| **blockperf/logmonitor** | Temporarily disabled in Guild tools |
| **Major upgrades** | May require ledger replay (hours) or Mithril snapshots |

---

## Upgrade Types

### Minor Upgrade (Binaries Only)

For patch releases (e.g., 10.5.2 → 10.5.3) that don't require configuration changes:

```bash
./guild-deploy.sh -s dlm -b master -n mainnet -t cnode -p /opt/cardano
```

**Flags explained:**
- `-s dlm` — Download and install: **d**ownload binaries, **l**ibsodium/secp256k1, **m**igrate data
- `-b master` — Use master branch (stable releases)
- `-n mainnet` — Network (mainnet or preprod)
- `-t cnode` — Install type
- `-p /opt/cardano` — Installation path

### Major Upgrade (Binaries + Config)

For major releases (e.g., 10.x → 11.x) that require configuration updates:

```bash
./guild-deploy.sh -s dlfm -b master -n mainnet -t cnode -p /opt/cardano
```

**Flags explained:**
- `-s dlfm` — Download and install: **d**ownload binaries, **l**ibsodium/secp256k1, **f**iles (config), **m**igrate data

**Note:** User-modified files (`env`, `gLiveView.sh`) are automatically backed up before overwriting.

---

## Pre-Upgrade Checklist

### 1. Check Slot Leader Schedule

**Never upgrade close to a scheduled block.** Check the pool's slot leader schedule:

```bash
# On block producer (as cardano user)
ssh michael@192.168.160.10
sudo -u cardano bash
export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket
cd /opt/cardano/cnode/scripts
./cncli.sh leaderlog current
```

Ensure no blocks are scheduled within the maintenance window.

### 2. Create Proxmox VM Snapshots

Create snapshots before upgrading each node for instant rollback capability.

**Proxmox VM IDs:**

| Node | VM ID | IP Address |
|------|-------|------------|
| Block Producer | TBD | 192.168.160.10 |
| Relay 1 | TBD | 192.168.160.11 |
| Relay 2 | TBD | 192.168.160.12 |
| Preprod Relay | TBD | 192.168.161.11 |

> **Note:** Run `ssh root@192.168.150.222 "qm list"` to get current VM IDs.

**Create snapshot for a node:**

```bash
# Replace <VMID> with actual VM ID and <VERSION> with target version
ssh root@192.168.150.222 "qm snapshot <VMID> pre-upgrade-<VERSION>-$(date +%Y%m%d) --description 'Before cardano-node upgrade to <VERSION>'"

# Example for Relay 1 upgrading to 10.6.0:
ssh root@192.168.150.222 "qm snapshot 101 pre-upgrade-10.6.0-$(date +%Y%m%d) --description 'Before cardano-node upgrade to 10.6.0'"
```

**List existing snapshots:**

```bash
ssh root@192.168.150.222 "qm listsnapshot <VMID>"
```

### 3. Verify Current Versions

```bash
# Check all nodes
for host in 192.168.160.10 192.168.160.11 192.168.160.12 192.168.161.11; do
  echo "=== Node at $host ==="
  ssh michael@$host "cardano-node --version | head -1"
done
```

### 4. Backup Configuration Files

```bash
# On each node before upgrade
ssh michael@<NODE_IP> "sudo -u cardano cp /opt/cardano/cnode/scripts/env /opt/cardano/cnode/scripts/env.backup.$(date +%Y%m%d)"
ssh michael@<NODE_IP> "sudo -u cardano cp /opt/cardano/cnode/files/config.json /opt/cardano/cnode/files/config.json.backup.$(date +%Y%m%d)"
ssh michael@<NODE_IP> "sudo -u cardano cp /opt/cardano/cnode/files/topology.json /opt/cardano/cnode/files/topology.json.backup.$(date +%Y%m%d)"
```

---

## Safe Upgrade Order

Always upgrade in this order, waiting for each node to fully sync before proceeding:

```
1. Preprod Relay (192.168.161.11)    ← Test upgrade procedure first
       ↓
2. Relay 2 (192.168.160.12)          ← Secondary relay
       ↓
3. Relay 1 (192.168.160.11)          ← Primary relay
       ↓
4. Block Producer (192.168.160.10)   ← Most critical, upgrade last
```

---

## Step-by-Step Upgrade Procedure

### Step 1: Upgrade Preprod Relay (Test)

```bash
# SSH to preprod relay
ssh michael@192.168.161.11

# Create Proxmox snapshot first (from local machine)
# ssh root@192.168.150.222 "qm snapshot <PREPROD_VMID> pre-upgrade-<VERSION>-$(date +%Y%m%d)"

# Switch to cardano user
sudo -u cardano -i
cd /opt/cardano/cnode/scripts

# Download latest guild-deploy.sh
curl -sS -o guild-deploy.sh https://raw.githubusercontent.com/cardano-community/guild-operators/master/scripts/cnode-helper-scripts/guild-deploy.sh
chmod 755 guild-deploy.sh

# Run minor upgrade (or use -s dlfm for major upgrade)
./guild-deploy.sh -s dlm -b master -n preprod -t cnode -p /opt/cardano

# Restart node
sudo systemctl restart cnode

# Verify version
cardano-node --version

# Check sync status (wait for 100%)
./gLiveView.sh
```

### Step 2: Upgrade Relay 2

```bash
# SSH to relay 2
ssh michael@192.168.160.12

# Create Proxmox snapshot first

# Switch to cardano user
sudo -u cardano -i
cd /opt/cardano/cnode/scripts

# Download and run upgrade
curl -sS -o guild-deploy.sh https://raw.githubusercontent.com/cardano-community/guild-operators/master/scripts/cnode-helper-scripts/guild-deploy.sh
chmod 755 guild-deploy.sh
./guild-deploy.sh -s dlm -b master -n mainnet -t cnode -p /opt/cardano

# Restart and verify
sudo systemctl restart cnode
cardano-node --version
./gLiveView.sh  # Wait for sync
```

### Step 3: Upgrade Relay 1

**Wait for Relay 2 to reach 100% sync before proceeding.**

```bash
# Verify Relay 2 is synced
ssh michael@192.168.160.12 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"

# Verify Block Producer still has connectivity
ssh michael@192.168.160.10 "curl -s http://localhost:12798/metrics | grep ActivePeers_int"
# Should show at least 1 active peer

# Now upgrade Relay 1 (same procedure as Relay 2)
ssh michael@192.168.160.11
sudo -u cardano -i
cd /opt/cardano/cnode/scripts
curl -sS -o guild-deploy.sh https://raw.githubusercontent.com/cardano-community/guild-operators/master/scripts/cnode-helper-scripts/guild-deploy.sh
chmod 755 guild-deploy.sh
./guild-deploy.sh -s dlm -b master -n mainnet -t cnode -p /opt/cardano
sudo systemctl restart cnode
./gLiveView.sh  # Wait for sync
```

### Step 4: Upgrade Block Producer

**Wait for Relay 1 to reach 100% sync before proceeding.**

```bash
# Verify both relays are synced and BP has connectivity
ssh michael@192.168.160.10 "curl -s http://localhost:12798/metrics | grep ActivePeers_int"
# Should show 2 active peers

# Upgrade Block Producer
ssh michael@192.168.160.10
sudo -u cardano -i
cd /opt/cardano/cnode/scripts
curl -sS -o guild-deploy.sh https://raw.githubusercontent.com/cardano-community/guild-operators/master/scripts/cnode-helper-scripts/guild-deploy.sh
chmod 755 guild-deploy.sh
./guild-deploy.sh -s dlm -b master -n mainnet -t cnode -p /opt/cardano
sudo systemctl restart cnode
cardano-node --version
./gLiveView.sh
```

---

## Post-Upgrade Verification

### 1. Verify All Nodes Running Correct Version

```bash
for host in 192.168.160.10 192.168.160.11 192.168.160.12 192.168.161.11; do
  echo "=== $host ==="
  ssh michael@$host "cardano-node --version | head -1"
done
```

### 2. Verify Sync Status

```bash
# Check mainnet nodes
for host in 192.168.160.10 192.168.160.11 192.168.160.12; do
  echo "=== Mainnet Node at $host ==="
  ssh michael@$host "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"
done
```

### 3. Verify Block Producer Connectivity

```bash
ssh michael@192.168.160.10 "curl -s http://localhost:12798/metrics | grep -E '(ActivePeers|ConnectedPeers)'"
# Should show 2 active peers (both relays)
```

### 4. Clean Up Snapshots (After Verification)

After confirming stable operation for 24-48 hours:

```bash
# List snapshots
ssh root@192.168.150.222 "qm listsnapshot <VMID>"

# Delete old snapshot
ssh root@192.168.150.222 "qm delsnapshot <VMID> pre-upgrade-<VERSION>-YYYYMMDD"
```

---

## Rollback Procedures

If issues occur after upgrade, choose the appropriate rollback method:

### Option 1: Proxmox Snapshot Restore (Fastest)

Use this for critical issues requiring immediate rollback.

```bash
# 1. Stop the VM
ssh root@192.168.150.222 "qm stop <VMID>"

# 2. Rollback to pre-upgrade snapshot
ssh root@192.168.150.222 "qm rollback <VMID> pre-upgrade-<VERSION>-YYYYMMDD"

# 3. Start the VM
ssh root@192.168.150.222 "qm start <VMID>"

# 4. Verify node is running
ssh michael@<NODE_IP> "sudo systemctl status cnode"
```

### Option 2: Guild Operators Version Downgrade

Install a specific previous version:

```bash
# SSH to affected node
ssh michael@<NODE_IP>
sudo -u cardano -i
cd /opt/cardano/cnode/scripts

# Install specific version (use appropriate branch tag)
./guild-deploy.sh -s dlm -b tags/10.5.2 -n mainnet -t cnode -p /opt/cardano

sudo systemctl restart cnode
```

### Option 3: Mithril Snapshot Re-sync

If database corruption occurs:

```bash
# SSH to affected node
ssh michael@<NODE_IP>
sudo -u cardano -i

# Stop the node
sudo systemctl stop cnode

# Download fresh snapshot via Mithril
cd /opt/cardano/cnode/scripts
./mithril-client.sh download

# Restart node
sudo systemctl restart cnode
./gLiveView.sh  # Monitor sync progress
```

---

## Troubleshooting

### Node Won't Start After Upgrade

```bash
# Check systemd logs
sudo journalctl -u cnode -n 100 --no-pager

# Check for configuration errors
cardano-node run --help  # Verify binary works

# Restore config from backup
sudo -u cardano cp /opt/cardano/cnode/files/config.json.backup.YYYYMMDD /opt/cardano/cnode/files/config.json
```

### Ledger Replay Taking Too Long

Major upgrades may require ledger replay. Options:
1. Wait (can take several hours)
2. Use Mithril snapshot: `./mithril-client.sh download`
3. Restore from Proxmox snapshot

### Peers Not Connecting

```bash
# Check topology configuration
cat /opt/cardano/cnode/files/topology.json

# Check firewall
sudo ufw status

# Check node logs for connection errors
sudo journalctl -u cnode -n 50 | grep -i "connect\|peer"
```

### EKG Metrics Unavailable (10.5.x+)

EKG was removed in 10.5.x. Update monitoring to use Prometheus:

```bash
# Check Prometheus metrics are available
curl -s http://localhost:12798/metrics | head -20
```

---

## Quick Reference

| Action | Command |
|--------|---------|
| Check version | `cardano-node --version` |
| Minor upgrade | `./guild-deploy.sh -s dlm -b master -n mainnet -t cnode -p /opt/cardano` |
| Major upgrade | `./guild-deploy.sh -s dlfm -b master -n mainnet -t cnode -p /opt/cardano` |
| Restart node | `sudo systemctl restart cnode` |
| Check sync | `./gLiveView.sh` |
| Check tip | `cardano-cli query tip --mainnet` |
| Check peers | `curl -s http://localhost:12798/metrics \| grep ActivePeers` |
| Create snapshot | `qm snapshot <VMID> <name> --description '<desc>'` |
| Rollback snapshot | `qm stop <VMID> && qm rollback <VMID> <name> && qm start <VMID>` |

---

## Related Documentation

- [Infrastructure Overview](../../.claude/infrastructure.md) - Network layout and service details
- [Maintenance Procedures](maintenance.md) - Routine maintenance tasks
- [Troubleshooting Guide](../../.claude/troubleshooting.md) - Common issues and solutions

---

*Document Version: 1.0*
*Last Updated: January 2025*
