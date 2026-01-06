# Cardano Stake Pool Quick Reference
## nacho.builders Implementation Cheat Sheet

---

## Current Status

| Node | IP | VM ID | Status |
|------|-----|-------|--------|
| Block Producer | 192.168.160.10 | 111 | ✅ Syncing |
| Relay 1 | 192.168.160.11 | 112 | ✅ Syncing |
| Relay 2 | 192.168.160.12 | 113 | ✅ Syncing |

**cardano-node version:** 10.5.3

---

## IP Address Assignments

| Node | IP Address | VLAN | External Port |
|------|------------|------|---------------|
| Block Producer | 192.168.160.10 | 160 | NONE |
| Relay 1 | 192.168.160.11 | 160 | 6001 |
| Relay 2 | 192.168.160.12 | 160 | 6002 |
| Gateway | 192.168.160.1 | 160 | — |

## DNS Records to Create

```
nacho.builders:6001  →  Relay 1
nacho.builders:6002  →  Relay 2
```

---

## SSH Access

### From Mac

```bash
# Using SSH config aliases
ssh cardano-bp
ssh cardano-relay1
ssh cardano-relay2

# Direct IP
ssh michael@192.168.160.10
```

### Switch to cardano user (for node operations)

```bash
sudo su - cardano
```

---

## Check Node Status

### Quick Status Check

```bash
# From Mac - all nodes
cd ~/claudecode/cardano-spo/ansible
ansible all -a "systemctl is-active cnode" --become
```

### Detailed Status

```bash
# SSH to node
ssh cardano-bp

# Check service
sudo systemctl status cnode

# View logs
sudo journalctl -u cnode -f

# Check sync with gLiveView
sudo su - cardano
cd /opt/cardano/cnode/scripts
./gLiveView.sh
```

### Check Sync Progress

```bash
# As cardano user
cardano-cli query tip --socket-path /opt/cardano/cnode/sockets/node.socket --mainnet
```

---

## Restart Nodes

### Single Node

```bash
ssh cardano-bp "sudo systemctl restart cnode"
```

### All Nodes (via Ansible)

```bash
cd ~/claudecode/cardano-spo/ansible
ansible all -m systemd -a "name=cnode state=restarted" --become
```

---

## Important Paths

| Path | Description |
|------|-------------|
| `/opt/cardano/cnode` | CNODE_HOME |
| `/opt/cardano/cnode/scripts/env` | Environment config |
| `/opt/cardano/cnode/scripts/gLiveView.sh` | Monitoring tool |
| `/opt/cardano/cnode/files/topology.json` | P2P topology |
| `/opt/cardano/cnode/files/config.json` | Node config |
| `/opt/cardano/cnode/db` | Blockchain database |
| `/opt/cardano/cnode/sockets/node.socket` | Node socket |
| `/home/cardano/.local/bin` | cardano-node, cardano-cli |

---

## Ansible Commands

```bash
cd ~/claudecode/cardano-spo/ansible

# Ping all nodes
ansible all -m ping

# Check service status
ansible all -m shell -a "systemctl status cnode --no-pager | head -10" --become

# Check disk space
ansible all -a "df -h /opt/cardano/cnode/db"

# View recent logs
ansible all -m shell -a "journalctl -u cnode -n 30 --no-pager" --become

# Restart all nodes
ansible all -m systemd -a "name=cnode state=restarted" --become

# Run updates
ansible-playbook playbooks/99-update-nodes.yml
```

---

## Topology Configuration

### Block Producer (/opt/cardano/cnode/files/topology.json)

```json
{
  "bootstrapPeers": null,
  "localRoots": [
    {
      "accessPoints": [
        {"address": "192.168.160.11", "port": 6000},
        {"address": "192.168.160.12", "port": 6000}
      ],
      "advertise": false,
      "trustable": true,
      "valency": 2
    }
  ],
  "publicRoots": [],
  "useLedgerAfterSlot": -1
}
```

### Relays (/opt/cardano/cnode/files/topology.json)

```json
{
  "bootstrapPeers": [
    {"address": "backbone.cardano.iog.io", "port": 3001},
    {"address": "backbone.mainnet.emurgornd.com", "port": 3001}
  ],
  "localRoots": [
    {
      "accessPoints": [
        {"address": "192.168.160.10", "port": 6000}
      ],
      "advertise": false,
      "trustable": true,
      "valency": 1
    }
  ],
  "publicRoots": [
    {
      "accessPoints": [
        {"address": "backbone.cardano.iog.io", "port": 3001}
      ],
      "advertise": false
    }
  ],
  "useLedgerAfterSlot": 128908821
}
```

---

## UFW Firewall Rules (Already Configured)

### Block Producer

```bash
sudo ufw status
# 22/tcp from 192.168.150.0/24 (LAN SSH)
# 22/tcp from 192.168.2.0/24 (VPN SSH)
# 6000/tcp from 192.168.160.11 (Relay 1)
# 6000/tcp from 192.168.160.12 (Relay 2)
# 12798/tcp from 192.168.150.0/24 (Prometheus LAN)
# 12798/tcp from 192.168.2.0/24 (Prometheus VPN)
```

### Relays

```bash
sudo ufw status
# 22/tcp from 192.168.150.0/24 (LAN SSH)
# 22/tcp from 192.168.2.0/24 (VPN SSH)
# 6000/tcp (Cardano P2P - open)
# 12798/tcp from 192.168.150.0/24 (Prometheus LAN)
# 12798/tcp from 192.168.2.0/24 (Prometheus VPN)
```

---

## Key Files Location (Block Producer - After Pool Registration)

```
/opt/cardano/cnode/priv/pool/NACHO/
├── vrf.skey     ← From air-gapped
├── vrf.vkey     ← From air-gapped
├── kes.skey     ← From air-gapped (rotate every 90 days)
├── kes.vkey     ← From air-gapped
└── op.cert      ← Generated on air-gapped
```

---

## Useful Commands

```bash
# Check sync status
cardano-cli query tip --socket-path /opt/cardano/cnode/sockets/node.socket --mainnet

# Watch logs
sudo journalctl -u cnode -f

# Restart node
sudo systemctl restart cnode

# Check KES expiry (after pool registration)
cardano-cli query kes-period-info --mainnet \
  --op-cert-file /opt/cardano/cnode/priv/pool/NACHO/op.cert \
  --socket-path /opt/cardano/cnode/sockets/node.socket
```

---

## Files NEVER on Network

These files must **only** exist on the air-gapped machine:

- `cold.skey` - Pool cold signing key
- `cold.counter` - Operational certificate counter  
- `stake.skey` - Stake signing key
- `payment.skey` - Payment signing key

Keep these ONLY on air-gapped machine + encrypted backups!

---

## Proxmox VM Settings (Reference)

| Setting | Value |
|---------|-------|
| VM IDs | 111, 112, 113 |
| vCPUs | 4 |
| RAM | 32 GB |
| Disk | 200 GB |
| Storage | NVME01 |
| Bridge | vmbr0 |
| VLAN Tag | 160 |

---

## UniFi Configuration (Reference)

### Network
- Name: `Cardano`
- VLAN ID: `160`
- Gateway: `192.168.160.1/24`
- DHCP: None

### Port Forwards

| Name | WAN Port | Forward IP | Forward Port |
|------|----------|------------|--------------|
| Cardano-Relay1 | 6001 | 192.168.160.11 | 6000 |
| Cardano-Relay2 | 6002 | 192.168.160.12 | 6000 |

---

*Last Updated: December 23, 2025*
