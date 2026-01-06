# Monitoring Guide
## Stake Pool Health and Performance Monitoring

This document covers monitoring strategies for the NACHO stake pool infrastructure.

---

## Monitoring Stack Overview

| Tool | Purpose | Location |
|------|---------|----------|
| gLiveView | Real-time node status | Each node |
| Prometheus | Metrics collection | cardano-monitor (192.168.160.2:9090) |
| Grafana | Visualization dashboard | cardano-monitor (192.168.160.2:3000) |
| Node Exporter | System metrics | All nodes (port 9100) |
| CNTools | Pool management | Block Producer |

---

## Quick Sync Status Check

The fastest way to check sync status across all nodes from your Mac:

### One-Liner Command

```bash
for host in 192.168.160.10 192.168.160.11 192.168.160.12; do
  echo "=== Node at $host ==="
  ssh -o ConnectTimeout=10 michael@$host "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'" 2>&1
  echo ""
done
```

### Sample Output

```json
=== Node at 192.168.160.10 ===
{
    "block": 11877911,
    "epoch": 558,
    "era": "Conway",
    "hash": "02125f5bc2deda6eaa7da1fbda7cf742896f4663fbac4ceb8138ec43a965b0fb",
    "slot": 155955489,
    "slotInEpoch": 262689,
    "slotsToEpochEnd": 169311,
    "syncProgress": "92.58"
}
```

### Understanding the Output

| Field | Description |
|-------|-------------|
| `block` | Current block number |
| `epoch` | Current epoch number |
| `era` | Current era (Babbage → Conway after Chang hard fork) |
| `slot` | Current slot number |
| `slotInEpoch` | Slots elapsed in current epoch |
| `slotsToEpochEnd` | Slots remaining until next epoch |
| `syncProgress` | Percentage synced (100.00 = fully synced) |

### Sync Status Interpretation

| syncProgress | Status | Action |
|--------------|--------|--------|
| < 50% | Early sync | Wait, check peers |
| 50-90% | Syncing | Normal progress |
| 90-99% | Almost synced | Nearly ready |
| 100.00 | Fully synced ✅ | Ready for operations |

### Using the check-sync.sh Script

A convenience script is available in the repository:

```bash
cd ~/claudecode/cardano-spo
./scripts/check-sync.sh
```

This script provides:
- Color-coded output
- Node names (Block Producer, Relay 1, Relay 2)
- Sync status indicators (✅ Fully synced, ⏳ Syncing)
- Timestamps

### Create a Shell Alias (Optional)

Add to your `~/.zshrc` or `~/.bashrc`:

```bash
# Check Cardano node sync status
alias cardano-sync='~/claudecode/cardano-spo/scripts/check-sync.sh'
```

Then simply run:
```bash
cardano-sync
```

### Check Single Node

```bash
# Block Producer
ssh michael@192.168.160.10 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"

# Relay 1
ssh michael@192.168.160.11 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"

# Relay 2
ssh michael@192.168.160.12 "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'"
```

### Why This Command Works

The command runs as the `cardano` user because:
1. The node socket (`node.socket`) is owned by the `cardano` user
2. The `cardano-cli` binary is in `/home/cardano/.local/bin/`
3. The `CARDANO_NODE_SOCKET_PATH` environment variable must be set

---

## gLiveView (Primary Monitoring)

### Starting gLiveView

```bash
cd $CNODE_HOME/scripts
./gLiveView.sh
```

### Key Metrics to Monitor

| Metric | Healthy Value | Warning |
|--------|---------------|---------|
| **Tip (Diff)** | 0-2 slots | >10 slots behind |
| **In Peers** | 5+ | <3 |
| **Out Peers** | 5+ | <3 |
| **Mem (RSS)** | <24 GB | >28 GB |
| **CPU** | <50% avg | >80% sustained |
| **KES Expiry** | >14 days | <14 days |
| **Epoch** | Current | N/A |

### gLiveView Commands

| Key | Action |
|-----|--------|
| `p` | Peer analysis |
| `i` | Show node info |
| `b` | Show block log |
| `q` | Quit |

---

## Daily Checks

### Morning Routine

```bash
# 1. Check all nodes are running
for node in bp relay1 relay2; do
  echo "=== $node ==="
  ssh cardano@192.168.160.${node#relay} "systemctl is-active cnode"
done

# 2. Check sync status on each node
cardano-cli query tip --mainnet

# 3. Quick gLiveView check
cd $CNODE_HOME/scripts && ./gLiveView.sh
```

### What to Look For

- [ ] All nodes synced to tip
- [ ] Peer count healthy (5+ in/out)
- [ ] No unusual memory/CPU usage
- [ ] KES expiry >14 days
- [ ] No errors in recent logs

---

## Log Monitoring

### View Live Logs

```bash
# Follow cnode logs
journalctl -u cnode -f

# Last 100 lines
journalctl -u cnode -n 100 --no-pager

# Errors only
journalctl -u cnode -p err -n 50
```

### Common Log Patterns

**Healthy:**
```
Switched to a fork
Adopted block
Tip changed
```

**Warning:**
```
Connection refused
Peer unreachable
Timeout
```

**Critical:**
```
KES key expired
Cannot decode
Disk full
Out of memory
```

---

## Prometheus Metrics

### Metrics Endpoint

Each node exposes metrics on port 12798:

```bash
curl http://localhost:12798/metrics
```

### Key Metrics

| Metric | Description |
|--------|-------------|
| `cardano_node_metrics_slotNum_int` | Current slot |
| `cardano_node_metrics_blockNum_int` | Current block |
| `cardano_node_metrics_density_real` | Chain density |
| `cardano_node_metrics_epoch_int` | Current epoch |
| `cardano_node_metrics_mempoolBytes_int` | Mempool size |
| `cardano_node_metrics_txsInMempool_int` | Pending transactions |
| `cardano_node_metrics_connectedPeers_int` | Connected peers |

### Quick Metrics Check

```bash
# Get connected peers
curl -s localhost:12798/metrics | grep connectedPeers

# Get current slot
curl -s localhost:12798/metrics | grep slotNum
```

---

## Prometheus + Grafana Setup

### Architecture

The monitoring stack runs on a **dedicated Proxmox container**, separate from the Cardano nodes:

```
┌─────────────────────────────────────────────────────────────┐
│                   cardano-monitor                            │
│                    192.168.160.2                            │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Prometheus  │  │   Grafana   │  │Node Exporter│         │
│  │   :9090     │  │    :3000    │  │    :9100    │         │
│  └──────┬──────┘  └─────────────┘  └─────────────┘         │
└─────────┼───────────────────────────────────────────────────┘
          │ scrapes metrics
          ▼
┌─────────────────────────────────────────────────────────────┐
│                     VLAN 160 - Cardano                       │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ cardano-bp  │  │cardano-relay1│  │cardano-relay2│        │
│  │ .160.10     │  │  .160.11    │  │  .160.12    │         │
│  │ :12798      │  │  :12798     │  │  :12798     │         │
│  │ :9100       │  │  :9100      │  │  :9100      │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└─────────────────────────────────────────────────────────────┘
```

### Prerequisites

1. **Create a Proxmox LXC container** for monitoring:
   - Hostname: `cardano-monitor`
   - Template: Ubuntu 22.04
   - Resources: 2 vCPUs, 2-4 GB RAM, 20 GB disk
   - Network: VLAN 160
   - IP: 192.168.160.2

2. **Inventory is pre-configured** at `ansible/inventory/hosts.yml`:
   ```yaml
   monitoring:
     hosts:
       cardano-monitor:
         ansible_host: 192.168.160.2
   ```

3. **Ensure SSH access** is configured for the monitoring host

### Installation

Deploy the monitoring stack using Ansible:

```bash
cd ansible

# Optional: Set a custom Grafana password
export GRAFANA_ADMIN_PASSWORD="YourSecurePassword123!"

# Run the playbook
ansible-playbook -i inventory/hosts.yml playbooks/05-setup-monitoring.yml
```

This installs:
- **Node Exporter** on all Cardano nodes + monitoring host (port 9100)
- **Prometheus** on monitoring host (port 9090)
- **Grafana** on monitoring host (port 3000)

### Accessing Grafana

After installation, access Grafana at:

```
http://192.168.160.2:3000
```

**Default credentials:**
- Username: `admin`
- Password: `ChangeMeNow!` (or set via `GRAFANA_ADMIN_PASSWORD` env var)

### Pre-configured Dashboard

The playbook installs a "Cardano Stake Pool - NACHO" dashboard with:

| Panel | Description |
|-------|-------------|
| Sync Progress | Shows sync % for all 3 nodes |
| Current Epoch/Block | Real-time blockchain position |
| Connected Peers | Peer count per node |
| Slot Number | Slot progression over time |
| Mempool | Transaction count and size |
| CPU/Memory/Disk | System resource usage |
| Network I/O | Bandwidth utilization |

### Prometheus Targets

Prometheus scrapes the following endpoints:

| Target | Port | Metrics |
|--------|------|---------|
| cardano-bp:12798 | 12798 | Cardano node metrics |
| cardano-relay1:12798 | 12798 | Cardano node metrics |
| cardano-relay2:12798 | 12798 | Cardano node metrics |
| cardano-bp:9100 | 9100 | System metrics |
| cardano-relay1:9100 | 9100 | System metrics |
| cardano-relay2:9100 | 9100 | System metrics |
| monitoring:9100 | 9100 | Monitoring host metrics |

### Verify Prometheus Targets

Check that all targets are being scraped:

```bash
# On the monitoring host
curl -s http://localhost:9090/api/v1/targets | jq '.data.activeTargets[] | {job: .labels.job, instance: .labels.instance, health: .health}'
```

### Custom Grafana Password

To set a custom Grafana admin password during installation:

```bash
export GRAFANA_ADMIN_PASSWORD="YourSecurePassword123!"
ansible-playbook -i inventory/hosts.yml playbooks/05-setup-monitoring.yml
```

### Firewall Configuration

The playbook configures these firewall rules:

**On Monitoring Host:**

| Port | Service | Access |
|------|---------|--------|
| 3000 | Grafana | 192.168.0.0/16 |
| 9090 | Prometheus | 192.168.0.0/16 |

**On Cardano Nodes:**

| Port | Service | Access |
|------|---------|--------|
| 9100 | Node Exporter | Monitoring host only |
| 12798 | Cardano metrics | Monitoring host only |

### Post-Installation: Restart Cardano Nodes

After running the playbook, you may need to restart the Cardano nodes to apply the Prometheus configuration change (exposing metrics on all interfaces):

```bash
# ⚠️ Only during maintenance window!
# Restart one node at a time to maintain availability

# On Block Producer
ssh michael@192.168.160.10 "sudo systemctl restart cnode"

# On Relay 1
ssh michael@192.168.160.11 "sudo systemctl restart cnode"

# On Relay 2
ssh michael@192.168.160.12 "sudo systemctl restart cnode"
```

---

## Grafana Dashboard Panels

The pre-installed "Cardano Stake Pool - NACHO" dashboard includes:

### Overview Row
| Panel | Metric | Description |
|-------|--------|-------------|
| BP Epoch | `cardano_node_metrics_epoch_int` | Current epoch on Block Producer |
| Relay 1 Epoch | `cardano_node_metrics_epoch_int` | Current epoch on Relay 1 |
| Relay 2 Epoch | `cardano_node_metrics_epoch_int` | Current epoch on Relay 2 |
| Current Block | `cardano_node_metrics_blockNum_int` | Latest block number |
| BP Active Peers | `cardano_node_metrics_peerSelection_ActivePeers_int` | BP peer count |
| Total Relay Peers | Sum of relay peer counts | Combined relay peers |

### Blockchain Metrics
- **Slot Number by Node**: Time series of slot progression
- **Active Peers by Node**: Peer connections over time

### Mempool
- **Transactions in Mempool**: Pending transaction count
- **Mempool Size (Bytes)**: Memory usage by mempool

### System Resources
- **CPU Usage**: Percentage CPU utilization per node
- **Cardano Node Memory (RSS)**: Resident memory of cardano-node process
- **Disk Usage (/)**: Root filesystem usage percentage

### Network
- **Network Receive**: Incoming bandwidth per node
- **Network Transmit**: Outgoing bandwidth per node

---

## Updating the Dashboard

To update the Grafana dashboard after making changes:

```bash
# Edit the dashboard JSON
vim ansible/templates/cardano-dashboard.json

# Copy to monitoring server and restart Grafana
scp ansible/templates/cardano-dashboard.json michael@192.168.160.2:/tmp/
ssh michael@192.168.160.2 "sudo cp /tmp/cardano-dashboard.json /var/lib/grafana/dashboards/ && sudo chown grafana:grafana /var/lib/grafana/dashboards/cardano-dashboard.json && sudo systemctl restart grafana-server"
```

Or re-run the Ansible playbook:
```bash
ansible-playbook -i inventory/hosts.yml playbooks/05-setup-monitoring.yml --tags grafana
```

---

## Block Production Monitoring

### Check If Pool Produced Blocks

```bash
# Using CNTools
cd $CNODE_HOME/scripts
./cntools.sh
# Navigate to: Pool → Show → Block Production

# Or check pool.vet
# https://pool.vet/pool/YOUR_POOL_ID
```

### Expected Block Production

Calculate expected blocks per epoch:

```
Expected Blocks = (Pool Stake / Total Stake) × 21,600 slots per epoch
```

### Block Log

```bash
# View block log (if enabled)
cat $CNODE_HOME/logs/blocks.log

# Or in gLiveView, press 'b'
```

---

## Alerting Setup

### Simple Bash Monitoring Script

Create `/home/cardano/scripts/monitor.sh`:

```bash
#!/bin/bash

# Configuration
ALERT_EMAIL="your@email.com"
MIN_PEERS=3
MAX_SLOT_DIFF=30

# Get current metrics
PEERS=$(curl -s localhost:12798/metrics | grep connectedPeers | awk '{print $2}')
CURRENT_SLOT=$(curl -s localhost:12798/metrics | grep slotNum_int | awk '{print $2}')
TIP_SLOT=$(cardano-cli query tip --mainnet | jq -r '.slot')
SLOT_DIFF=$((TIP_SLOT - CURRENT_SLOT))

# Check peers
if [ "$PEERS" -lt "$MIN_PEERS" ]; then
    echo "WARNING: Low peer count: $PEERS" | mail -s "Cardano Alert" $ALERT_EMAIL
fi

# Check sync
if [ "$SLOT_DIFF" -gt "$MAX_SLOT_DIFF" ]; then
    echo "WARNING: Node behind by $SLOT_DIFF slots" | mail -s "Cardano Alert" $ALERT_EMAIL
fi
```

Add to crontab:

```bash
# Run every 5 minutes
*/5 * * * * /home/cardano/scripts/monitor.sh
```

---

## External Monitoring Services

### PoolTool

- Register at https://pooltool.io
- Provides external monitoring
- Block production tracking
- Alerts for missed blocks

### Adapools

- https://adapools.org
- Pool statistics
- Delegation tracking
- Historical performance

### Pool.vet

- https://pool.vet
- Relay connectivity testing
- Pool health checks

---

## Performance Baselines

### Normal Operating Parameters

| Metric | Block Producer | Relay |
|--------|----------------|-------|
| Memory (RSS) | 12-20 GB | 12-20 GB |
| CPU (avg) | 10-30% | 20-40% |
| Disk I/O | Low | Medium |
| Network | Low | Medium-High |
| Peers In | 2 (relays only) | 10-50 |
| Peers Out | 2 (relays only) | 10-50 |

### Resource Alerts

| Resource | Warning | Critical |
|----------|---------|----------|
| Memory | >28 GB | >30 GB |
| CPU | >70% sustained | >90% |
| Disk | >80% used | >90% |
| Slot Diff | >10 | >60 |
| Peers | <5 | <2 |

---

## Troubleshooting Common Issues

### Node Not Syncing

```bash
# Check network connectivity
ping 1.1.1.1

# Check DNS
dig backbone.cardano.iog.io

# Check topology
cat $CNODE_HOME/files/topology.json

# Restart node
sudo systemctl restart cnode
```

### High Memory Usage

```bash
# Check memory details
free -h
ps aux --sort=-%mem | head

# May need to restart node
sudo systemctl restart cnode
```

### Low Peer Count

```bash
# Check firewall
sudo ufw status

# Check topology file has correct peers
cat $CNODE_HOME/files/topology.json

# Check if ports are open
ss -tlnp | grep 6000
```

---

## Monitoring Checklist

### Daily
- [ ] All nodes synced
- [ ] Peer count healthy
- [ ] No critical errors in logs
- [ ] Memory/CPU normal

### Weekly
- [ ] Review block production
- [ ] Check KES expiry
- [ ] Review delegator changes
- [ ] Check disk usage

### Monthly
- [ ] Review performance trends
- [ ] Check for software updates
- [ ] Backup configurations
- [ ] Test recovery procedures

---

*Document Version: 1.0*
*Last Updated: December 2024*




