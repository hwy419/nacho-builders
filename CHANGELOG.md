# Deployment Changelog
## NACHO Stake Pool - nacho.builders

This file tracks all significant changes and deployments to the stake pool infrastructure.

---

## [Initial Deployment] - December 23, 2025

### Infrastructure Setup

#### UniFi Network Configuration
- Created VLAN 160 (Cardano) with subnet 192.168.160.0/24
- Configured port forwarding:
  - WAN:6001 → 192.168.160.11:6000 (Relay 1)
  - WAN:6002 → 192.168.160.12:6000 (Relay 2)
- Created firewall rules:
  - Allow LAN/VPN → Cardano VLAN (SSH, Prometheus)
  - Block Cardano VLAN → LAN/VPN (isolation)
  - Allow Cardano internal communication

#### Proxmox Virtual Machines
- Created 3 VMs on NVME01 storage (1.8TB NVMe drive)
- VM specifications:
  | VM ID | Name | vCPUs | RAM | Disk |
  |-------|------|-------|-----|------|
  | 111 | cardano-bp | 4 | 32 GB | 200 GB |
  | 112 | cardano-relay1 | 4 | 32 GB | 200 GB |
  | 113 | cardano-relay2 | 4 | 32 GB | 200 GB |
- All VMs configured with VLAN tag 160 on vmbr0

#### Operating System
- Installed Ubuntu 22.04.5 LTS Server on all nodes
- Static IP configuration:
  - cardano-bp: 192.168.160.10
  - cardano-relay1: 192.168.160.11
  - cardano-relay2: 192.168.160.12
- Gateway: 192.168.160.1
- DNS: 1.1.1.1, 8.8.8.8

### Ansible Automation

#### Playbooks Created
- `00-bootstrap.yml` - Initial OS setup
- `01-harden.yml` - Security hardening
- `02-install-guild.yml` - Cardano node installation
- `03-configure-topology.yml` - P2P topology configuration
- `99-update-nodes.yml` - Routine maintenance

#### Security Hardening Applied
- SSH hardening:
  - Disabled root login
  - Disabled password authentication
  - Limited auth tries to 3
  - Disabled X11/TCP/Agent forwarding
- UFW firewall enabled with rules:
  - SSH from LAN (192.168.150.0/24) and VPN (192.168.2.0/24)
  - Cardano P2P (port 6000)
  - Prometheus metrics (port 12798)
- fail2ban configured for SSH protection
- Kernel security parameters hardened
- Disabled unused filesystems

### Cardano Node Deployment

#### Software Installed
- cardano-node v10.5.3
- Guild Operators tools (guild-deploy.sh)
- All dependencies and libraries

#### Configuration
- Network: mainnet
- Pool Name: NACHO
- Node Port: 6000 (all nodes)
- CNODE_HOME: /opt/cardano/cnode

#### Topology
- Block Producer connects only to own relays (192.168.160.11, 192.168.160.12)
- Relays connect to:
  - Block Producer (192.168.160.10)
  - IOG backbone (backbone.cardano.iog.io:3001)
  - Emurgo backbone (backbone.mainnet.emurgornd.com:3001)

### Status
- All nodes started and syncing blockchain
- Estimated sync completion: 24-48 hours from start

---

## [Pool Configuration] - December 23, 2025

### Pool Parameters Finalized
- **Fixed Fee:** 340 ADA (protocol minimum)
- **Margin:** 1.5%
- **Pledge:** 10,000 ADA

### DNS Configuration
- Configured A records in AWS Route 53:
  - `nacho.builders:6001` → Relay 1
  - `nacho.builders:6002` → Relay 2

### Pool Metadata
- Created `poolMetaData.json`:
  ```json
  {
    "name": "NACHO Pool",
    "description": "NACHO Pool - Secure, reliable infrastructure, competitive fees, community focused.",
    "ticker": "NACHO",
    "homepage": "https://nacho.builders"
  }
  ```
- Hosted on GitHub Pages: https://hwy419.github.io/nacho-builders/poolMetaData.json
- Extended metadata (with logo) to be added later

---

## [Security Audit] - December 24, 2025

### Penetration Test Completed

A comprehensive grey-box penetration test was conducted covering all attack vectors.

#### Test Phases Completed
1. **External Attack Surface** - DNS recon, port scanning, protocol testing
2. **Network Segmentation** - VLAN isolation, lateral movement testing
3. **Host Security** - SSH hardening, UFW, fail2ban verification
4. **Cardano-Specific** - Key security, topology audit, metrics exposure
5. **Privilege Escalation** - User privileges, process audit
6. **Logging & Detection** - Log coverage, fail2ban effectiveness
7. **UniFi Firewall** - Port forwards, rule verification

#### Results Summary
| Severity | Count | Details |
|----------|-------|---------|
| CRITICAL | 0 | None found |
| HIGH | 0 | None found |
| MEDIUM | 2 | NOPASSWD sudo for michael and cardano users |
| LOW | 1 | PeerSharing disabled on relays |

#### Key Findings
- ✅ External attack surface properly minimized (only ports 6001/6002 exposed)
- ✅ VLAN isolation working correctly (Cardano nodes cannot reach LAN)
- ✅ Lateral movement blocked (relays cannot SSH to Block Producer)
- ✅ SSH hardening verified (password auth disabled, key-only)
- ✅ Fail2ban actively working (blocked test IP during assessment)
- ✅ No sensitive keys on relay nodes
- ✅ Prometheus metrics bound to localhost only
- ⚠️ NOPASSWD sudo should be restricted

#### Documentation
- Full report: `docs/security/pentest-report-2024-12-24.md`

---

## [Monitoring Setup] - December 27, 2025

### Infrastructure

#### Monitoring Container Created
- Created Proxmox LXC container (CT 116) for dedicated monitoring
- Container specifications:
  | Setting | Value |
  |---------|-------|
  | CT ID | 116 |
  | Hostname | cardano-monitor |
  | vCPUs | 2 |
  | RAM | 2 GB |
  | Storage | 20 GB (NVME01) |
  | IP Address | 192.168.160.2 |
  | VLAN | 160 |

### Monitoring Stack Deployed

#### Prometheus
- Installed Prometheus v2.48.1 on cardano-monitor
- Configured to scrape all Cardano nodes and system metrics
- Retention: 30 days
- Scrape interval: 15 seconds
- Web UI: http://192.168.160.2:9090

#### Grafana
- Installed Grafana (latest) on cardano-monitor
- Pre-configured Prometheus datasource
- Custom "Cardano Stake Pool - NACHO" dashboard deployed
- Web UI: http://192.168.160.2:3000

#### Node Exporter
- Installed Node Exporter v1.7.0 on all hosts:
  - cardano-bp (192.168.160.10:9100)
  - cardano-relay1 (192.168.160.11:9100)
  - cardano-relay2 (192.168.160.12:9100)
  - cardano-monitor (192.168.160.2:9100)

### Prometheus Targets Configured

| Job | Targets | Metrics |
|-----|---------|---------|
| cardano-node | BP, Relay1, Relay2 (:12798) | Cardano node metrics |
| node-exporter | All 4 hosts (:9100) | System metrics |
| prometheus | localhost:9090 | Self-monitoring |
| monitoring | localhost:9100 | Monitoring host metrics |

### Grafana Dashboard Features

The custom dashboard displays:
- **Overview Row**: Epoch per node, current block, active peers
- **Blockchain Metrics**: Slot number over time, peer connections
- **Mempool**: Transactions in mempool, mempool size
- **System Resources**: CPU usage, Cardano node memory (RSS), disk usage
- **Network**: Receive/transmit bandwidth per node

### Ansible Automation

#### New Playbook Created
- `05-setup-monitoring.yml` - Deploys complete monitoring stack

#### Inventory Updated
- Added `monitoring` host group with `cardano-monitor` host
- Created `group_vars/monitoring.yml` for monitoring-specific variables

### Firewall Rules Added

**On Cardano Nodes:**
- Port 12798 (Cardano metrics) - Allow from monitoring host
- Port 9100 (Node Exporter) - Allow from monitoring host

**On Monitoring Host:**
- Port 3000 (Grafana) - Allow from internal networks
- Port 9090 (Prometheus) - Allow from internal networks

### Configuration Changes

- Updated Cardano node config to expose Prometheus metrics on all interfaces
- Nodes restarted to apply configuration changes

---

## [First Full Sync] - December 27, 2025 @ 11:05 PM CST

### 🎉 MILESTONE: All Nodes Fully Synchronized!

After approximately 4 days of syncing from genesis, all three Cardano nodes reached 100% synchronization with the mainnet blockchain.

#### Final Sync Status

| Node | IP | Epoch | Block | Sync |
|------|-----|-------|-------|------|
| Block Producer | 192.168.160.10 | 603 | 12,834,161 | ✅ 100% |
| Relay 1 | 192.168.160.11 | 603 | 12,834,161 | ✅ 100% |
| Relay 2 | 192.168.160.12 | 603 | 12,834,161 | ✅ 100% |

#### Key Details
- **Era**: Conway
- **Network**: Mainnet
- **Cardano Node Version**: v10.5.3
- **Total Sync Time**: ~4 days (December 23-27, 2025)

#### What This Means
- The stake pool infrastructure is now ready for pool registration
- All nodes are receiving and validating new blocks in real-time
- The Block Producer and Relays are in perfect sync (identical block hashes)

---

## [Pool Registration] - December 28, 2025

### 🎉 MILESTONE: NACHO Pool Successfully Registered on Mainnet!

The stake pool has been officially registered on the Cardano mainnet blockchain.

#### Pool Identity

| Field | Value |
|-------|-------|
| **Pool ID** | `pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml` |
| **Ticker** | NACHO |
| **Name** | NACHO Pool |
| **Homepage** | https://nacho.builders |

#### Registration Transaction
- **Tx Hash**: `8122e9b880ca366262c6e18ee7f801cbc51f50b8a761cdb5c85c306ecd05e5cb`
- **Pool Deposit**: 500 ADA
- **Fee**: ~0.2 ADA

#### Pool Parameters
| Parameter | Value |
|-----------|-------|
| **Fixed Cost** | 340 ADA (protocol minimum) |
| **Margin** | 2% |
| **Pledge** | 10,000 ADA |
| **Relays** | nacho.builders:6001, nacho.builders:6002 |
| **Metadata URL** | https://nacho.builders/poolMetaData.json |

#### Key Generation Process
- Used air-gapped VM (Proxmox VM 114) with no network access
- Virtual disk transfer mechanism for secure file exchange
- Yoroi wallet stake key used as pool owner for existing rewards tracking
- Cold keys securely generated and stored offline

#### View Pool
- CardanoScan: https://cardanoscan.io/pool/pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml
- Pool.pm: https://pool.pm/pool1dhugawja82wkmrq0lhd24uyrhm02v7grdhnren9r2qgujsh5kml

---

## Pending Tasks

### Completed ✅
- [x] ~~Complete blockchain synchronization~~ ✅ Completed December 27, 2025
- [x] ~~Set up monitoring (Grafana/Prometheus)~~ ✅ Completed December 27, 2025
- [x] ~~Air-gapped VM setup (VM 114)~~ ✅ Completed December 28, 2025
- [x] ~~Generate cold keys and operational certificate~~ ✅ Completed December 28, 2025
- [x] ~~Register stake pool on-chain~~ ✅ Completed December 28, 2025

### In Progress
- [ ] Configure Block Producer with pool keys (hot keys)
- [ ] Verify pool is producing blocks

### Phase 3: Operations
- [ ] Create pool logo/icon for extended metadata
- [ ] Document KES key rotation procedure
- [ ] Restrict NOPASSWD sudo access (from pentest findings)
- [ ] Set up alerting rules in Prometheus/Grafana
- [ ] Create encrypted backups of cold keys

---

## Notes

### SSH Access
- Admin user: `michael` (passwordless sudo)
- Service user: `cardano` (runs cardano-node)
- SSH key: `~/.ssh/cardano-spo`

### Useful Commands
```bash
# Check sync status
ssh cardano-bp
sudo su - cardano
cd /opt/cardano/cnode/scripts
./gLiveView.sh

# Check all nodes via Ansible
cd ~/claudecode/cardano-spo/ansible
ansible all -a "systemctl is-active cnode" --become
```

---

*Maintained by: Michael Jones*

