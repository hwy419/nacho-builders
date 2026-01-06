# Cardano Stake Pool Documentation
## nacho.builders - Family Medical Supply

Welcome to the documentation for the **NACHO** Cardano Stake Pool project. This knowledge base contains everything needed to deploy, operate, and maintain a secure Cardano stake pool infrastructure.

---

## 🚦 Current Status

| Component | Status | Details |
|-----------|--------|---------|
| **UniFi Network** | ✅ Complete | VLAN 160, firewall rules, port forwarding |
| **Proxmox VMs** | ✅ Complete | 3 VMs + 1 LXC on NVME01 storage |
| **Ubuntu 22.04** | ✅ Complete | Installed on all nodes |
| **Security Hardening** | ✅ Complete | SSH, UFW, fail2ban configured |
| **Cardano Node** | ✅ Complete | v10.5.3 installed via Guild Operators |
| **Blockchain Sync** | ✅ Complete | All nodes 100% synced (Dec 27, 2025) |
| **DNS Records** | ✅ Complete | nacho.builders:6001/6002 via Route 53 |
| **Pool Metadata** | ✅ Complete | Hosted on GitHub Pages |
| **Security Audit** | ✅ Complete | Pentest Dec 24, 2025 - Strong posture |
| **Monitoring** | ✅ Complete | Prometheus + Grafana on dedicated container |
| **Air-Gapped VM** | ⬜ Pending | Key generation environment |
| **Pool Registration** | ⬜ Pending | Ready to begin |

---

## 🗺️ Network Architecture Diagrams

**📊 NEW: Complete architecture visualization available!**

See [`NETWORK-DIAGRAMS.md`](NETWORK-DIAGRAMS.md) for full documentation on viewing and using the diagrams.

### Quick Links:
- **Interactive Diagram**: [`complete-network-diagram.html`](complete-network-diagram.html) - Open in browser
- **Complete Reference**: [`architecture/complete-network-reference.md`](architecture/complete-network-reference.md) - Full technical documentation
- **Legacy Diagram**: [`topology-diagram.html`](topology-diagram.html) - Original Cardano-only topology

**What's included:**
- ✅ All 4 VLANs (150-LAN, 160-Cardano, 170-API, 2-VPN)
- ✅ Complete IP address allocation and port mappings
- ✅ Data flow diagrams and security boundaries
- ✅ Service inventory and configuration paths
- ✅ Troubleshooting and maintenance procedures

---

## 📚 Documentation Structure

```
cardano-spo/
├── docs/
│   ├── README.md                    ← You are here
│   ├── NETWORK-DIAGRAMS.md          ← NEW: Guide to network diagrams
│   ├── complete-network-diagram.html ← NEW: Interactive visualization
│   ├── topology-diagram.html        ← Legacy Cardano-only diagram
│   ├── plans/                       ← Detailed implementation guides
│   │   ├── cardano-stake-pool-plan.md
│   │   ├── cardano-quick-reference.md
│   │   ├── proxmox-networking-guide.md
│   │   ├── unifi-configuration-guide.md
│   │   ├── air-gapped-vm-setup.md
│   │   └── air-gapped-virtual-transfer.md  ← NEW: No USB required
│   ├── architecture/                ← System design & decisions
│   │   ├── overview.md
│   │   └── complete-network-reference.md  ← NEW: Full network docs
│   ├── operations/                  ← Day-to-day procedures
│   │   ├── key-rotation.md
│   │   ├── monitoring.md           ← Prometheus/Grafana setup guide
│   │   ├── maintenance.md
│   │   └── pool-registration.md    ← NEW: Complete registration guide
│   ├── security/                    ← Security guidelines
│   │   ├── checklist.md
│   │   └── pentest-report-2024-12-24.md
│   └── runbooks/                    ← Emergency procedures
│       └── troubleshooting.md
├── ansible/                         ← Automation playbooks
│   ├── README.md
│   ├── ansible.cfg
│   ├── site.yml
│   ├── inventory/
│   │   ├── hosts.yml               ← All hosts including monitoring
│   │   └── group_vars/
│   │       ├── cardano.yml
│   │       ├── cardano_bp.yml
│   │       ├── cardano_relays.yml
│   │       └── monitoring.yml      ← Monitoring config variables
│   ├── playbooks/
│   │   ├── 00-bootstrap.yml
│   │   ├── 01-harden.yml
│   │   ├── 02-install-guild.yml
│   │   ├── 03-configure-topology.yml
│   │   ├── 04-extend-storage.yml
│   │   ├── 05-setup-monitoring.yml ← Prometheus/Grafana deployment
│   │   └── 99-update-nodes.yml
│   └── templates/
│       ├── cardano-dashboard.json  ← Grafana dashboard
│       ├── chrony.conf.j2
│       └── cnode.service.j2
├── metadata/
│   ├── poolMetaData.json
│   └── extendedPoolMetaData.json
└── scripts/
    └── check-sync.sh              ← Quick sync status checker
```

---

## 🏗️ Infrastructure Overview

### Network Architecture

| Component | IP Address | VLAN | Purpose |
|-----------|------------|------|---------|
| **Block Producer** | 192.168.160.10 | 160 | Creates blocks (PRIVATE) |
| **Relay 1** | 192.168.160.11 | 160 | Public relay (Port 6001) |
| **Relay 2** | 192.168.160.12 | 160 | Public relay (Port 6002) |
| **Monitoring** | 192.168.160.2 | 160 | Prometheus + Grafana |
| **Proxmox Host** | 192.168.150.222 | 1 | VM hypervisor |
| **UniFi DR7** | 192.168.150.1 | — | Network gateway |

### Proxmox Virtual Machines & Containers

| ID | Name | Type | vCPUs | RAM | Storage | Status |
|----|------|------|-------|-----|---------|--------|
| 111 | cardano-bp | VM | 4 | 32 GB | 200 GB (NVME01) | ✅ Running |
| 112 | cardano-relay1 | VM | 4 | 32 GB | 200 GB (NVME01) | ✅ Running |
| 113 | cardano-relay2 | VM | 4 | 32 GB | 200 GB (NVME01) | ✅ Running |
| 116 | cardano-monitor | LXC | 2 | 2 GB | 20 GB (NVME01) | ✅ Running |

### DNS Endpoints
- `nacho.builders:6001` → Relay 1
- `nacho.builders:6002` → Relay 2

---

## 🚀 Quick Start

### Check Node Sync Status

The fastest way to check sync progress across all nodes:

```bash
# Check sync status on all 3 nodes
for host in 192.168.160.10 192.168.160.11 192.168.160.12; do
  echo "=== Node at $host ==="
  ssh -o ConnectTimeout=10 michael@$host "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'" 2>&1
  echo ""
done
```

Look for `"syncProgress": "100.00"` to confirm full sync.

### Check Node Service Status

```bash
# From your Mac - check all nodes are running
cd ~/claudecode/cardano-spo/ansible
ansible all -a "systemctl is-active cnode" --become

# Interactive monitoring via gLiveView
ssh michael@192.168.160.10  # or .11, .12
sudo -u cardano /opt/cardano/cnode/scripts/gLiveView.sh
```

### Monitoring Dashboard

Access the Grafana dashboard to monitor all nodes:

| Service | URL | Credentials |
|---------|-----|-------------|
| **Grafana** | http://192.168.160.2:3000 | admin / (your password) |
| **Prometheus** | http://192.168.160.2:9090 | (no auth required) |

The dashboard shows:
- Epoch and block numbers for all nodes
- Active peer connections
- Slot progression over time
- Mempool transactions
- Node memory usage (RSS)
- CPU, disk, and network metrics

### Common Ansible Commands

```bash
cd ~/claudecode/cardano-spo/ansible

# Ping all nodes
ansible all -m ping

# Check node status
ansible all -m shell -a "systemctl status cnode --no-pager | head -5" --become

# Restart all nodes
ansible all -m systemd -a "name=cnode state=restarted" --become

# Update all nodes (one at a time)
ansible-playbook playbooks/99-update-nodes.yml
```

### SSH Access

```bash
# Using SSH config aliases
ssh cardano-bp      # Block Producer
ssh cardano-relay1  # Relay 1
ssh cardano-relay2  # Relay 2

# Switch to cardano user for node operations
sudo su - cardano
```

---

## 🔧 Deployment Playbooks

| Playbook | Purpose | Run Order |
|----------|---------|-----------|
| `00-bootstrap.yml` | Initial OS setup, packages, NTP | 1st |
| `01-harden.yml` | Security hardening (SSH, UFW, fail2ban) | 2nd |
| `02-install-guild.yml` | Install Cardano node via Guild Operators | 3rd |
| `03-configure-topology.yml` | Configure P2P topology | 4th |
| `04-extend-storage.yml` | Extend disk storage if needed | As needed |
| `05-setup-monitoring.yml` | Deploy Prometheus + Grafana stack | 5th |
| `99-update-nodes.yml` | Routine updates and maintenance | As needed |

### Full Deployment

```bash
cd ~/claudecode/cardano-spo/ansible
ansible-playbook site.yml
```

---

## 🔑 Key Information

### Pool Details
- **Ticker:** NACHO
- **Domain:** nacho.builders
- **Network:** Mainnet
- **Node Version:** 10.5.3
- **Fixed Fee:** 340 ADA
- **Margin:** 1.5%
- **Pledge:** 10,000 ADA
- **Metadata URL:** https://hwy419.github.io/nacho-builders/poolMetaData.json

### Software Versions
| Component | Version |
|-----------|---------|
| Ubuntu | 22.04.5 LTS |
| cardano-node | 10.5.3 |
| Guild Operators | master branch |
| Proxmox VE | 8.2.2 |
| UniFi OS | 4.3.9+ |

### Critical Ports
| Port | Protocol | Purpose |
|------|----------|---------|
| 6000 | TCP | Cardano node P2P (internal) |
| 6001 | TCP | Relay 1 external (NAT) |
| 6002 | TCP | Relay 2 external (NAT) |
| 22 | TCP | SSH management |
| 3000 | TCP | Grafana dashboard |
| 9090 | TCP | Prometheus web UI |
| 9100 | TCP | Node Exporter metrics |
| 12798 | TCP | Cardano Prometheus metrics |

### Important Paths (on nodes)
| Path | Purpose |
|------|---------|
| `/opt/cardano/cnode` | CNODE_HOME - main installation |
| `/opt/cardano/cnode/scripts` | Guild Operators scripts |
| `/opt/cardano/cnode/db` | Blockchain database |
| `/opt/cardano/cnode/files` | Config and topology files |
| `/opt/cardano/cnode/sockets/node.socket` | Node socket |
| `/home/cardano/.local/bin` | cardano-node, cardano-cli binaries |

---

## ⚠️ Security Reminders

### Latest Security Audit (December 24, 2025)

**Overall Posture: STRONG** - Full pentest report: `security/pentest-report-2024-12-24.md`

| Finding | Severity | Status |
|---------|----------|--------|
| NOPASSWD sudo for users | MEDIUM | Pending remediation |
| PeerSharing disabled | LOW | Acceptable |
| All other controls | N/A | ✅ Verified working |

### Files NEVER on Network
These files must **only** exist on the air-gapped machine:
- `cold.skey` - Pool cold signing key
- `cold.counter` - Operational certificate counter
- `stake.skey` - Stake signing key
- `payment.skey` - Payment signing key

### Key Rotation Schedule
| Key Type | Frequency | Next Due |
|----------|-----------|----------|
| KES Keys | ~90 days | TBD |
| Op Cert | With KES | TBD |
| Cold Keys | Never | N/A |

### User Accounts
| User | Purpose | SSH Access |
|------|---------|------------|
| `michael` | Admin user | Yes (key-based) |
| `cardano` | Service user | No direct SSH |

### Verified Security Controls (from pentest)
- ✅ VLAN isolation (Cardano nodes cannot reach LAN/VPN)
- ✅ Lateral movement blocked (relays cannot SSH to BP)
- ✅ External attack surface minimized (only 6001/6002 exposed)
- ✅ Fail2ban actively blocking attacks
- ✅ SSH password authentication disabled
- ✅ No sensitive keys on relay nodes
- ✅ Prometheus metrics localhost-only

---

## 📋 Next Steps

**🎉 Blockchain sync complete!** Ready for pool registration:

### Phase 1: Air-Gapped Setup & Key Generation
1. [x] ~~Verify all nodes are fully synced (100%)~~ ✅ Completed Dec 27, 2025
2. [ ] Set up air-gapped VM for key generation (see `plans/air-gapped-vm-setup.md`)
3. [ ] Generate cold keys (cold.skey, cold.vkey, cold.counter)
4. [ ] Generate VRF keys (vrf.skey, vrf.vkey)
5. [ ] Generate KES keys (kes.skey, kes.vkey)
6. [ ] Generate stake keys (stake.skey, stake.vkey)
7. [ ] Generate payment keys (payment.skey, payment.vkey)
8. [ ] Create operational certificate (op.cert)

### Phase 2: Pool Registration
9. [ ] Transfer hot keys to Block Producer (vrf.skey, kes.skey, op.cert)
10. [ ] Configure Block Producer with pool keys
11. [ ] Fund payment address (~515 ADA for deposit + fees)
12. [ ] Build pool registration certificate
13. [ ] Sign registration transaction (air-gapped)
14. [ ] Submit pool registration to mainnet

### Phase 3: Post-Registration
15. [ ] Verify pool appears on-chain
16. [ ] Create pool logo/icon for extended metadata
17. [ ] Announce pool to community
18. [x] ~~Set up monitoring (Grafana/Prometheus)~~ ✅ Completed Dec 27, 2025

---

## 📞 Resources

### Official Documentation
- [Cardano Developer Portal](https://developers.cardano.org/)
- [Guild Operators](https://cardano-community.github.io/guild-operators/)
- [CIP Standards](https://cips.cardano.org/)

### Community
- [SPO Telegram](https://t.me/CardanoStakePoolWorkgroup)
- [Cardano Forum](https://forum.cardano.org/)

---

## 📝 Deployment Log

| Date | Action | Notes |
|------|--------|-------|
| Dec 23, 2025 | UniFi VLAN 160 configured | Firewall rules and port forwarding |
| Dec 23, 2025 | VMs created (111-113) | 200GB each on NVME01 |
| Dec 23, 2025 | Ubuntu 22.04.5 installed | All 3 nodes |
| Dec 23, 2025 | Ansible automation deployed | Bootstrap, harden, install playbooks |
| Dec 23, 2025 | Guild Operators installed | cardano-node 10.1.4 |
| Dec 23, 2025 | Nodes started syncing | Topology configured, services enabled |
| Dec 24, 2025 | Security pentest completed | Strong posture, 2 medium findings |
| Dec 27, 2025 | Monitoring container created | LXC 116 (cardano-monitor) on NVME01 |
| Dec 27, 2025 | Prometheus + Grafana deployed | Full monitoring stack operational |
| Dec 27, 2025 | Node Exporter installed | System metrics on all nodes |
| Dec 27, 2025 | Grafana dashboard configured | Custom Cardano SPO dashboard |
| Dec 27, 2025 | **All nodes fully synced** | 100% sync achieved @ 11:05 PM CST |

---

*Last Updated: December 27, 2025*
