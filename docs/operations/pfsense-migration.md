# pfSense Migration Plan

Replace UniFi Dream Router 7 (UDR7) with pfSense for the Cardano stake pool infrastructure.

> **Status: COMPLETED** (January 2026)
>
> The migration was successfully completed using a dedicated pfSense server with 10Gb SFP connectivity to Proxmox, rather than the originally planned VM approach.

## Summary

| Component | Before | After |
|-----------|--------|-------|
| Router/Firewall | UDR7 | pfSense (dedicated server) |
| VPN | L2TP | WireGuard (see [VPN Administration](wireguard-vpn-administration.md)) |
| WiFi | UDR7 built-in | Standalone AP |
| 10Gb Link | N/A | pfSense ↔ Proxmox via SFP (vmbr3) |
| UDR7 | Active | Kept as offline backup |

**Related Documentation:**
- [Network Configuration](network-configuration.md) - Current pfSense network setup, NAT, DNS
- [WireGuard VPN Administration](wireguard-vpn-administration.md) - VPN client management, troubleshooting

## Implementation Notes

The actual implementation differed from the original plan:

**Original Plan:** pfSense as a VM on Proxmox with PCIe passthrough for WAN NIC (eno1).

**Actual Implementation:** Dedicated pfSense server with:
- Intel 1Gb NICs for WAN (igb0) and LAN (igb1)
- QLogic BCM57810 10Gb SFP (bxe0) for VLAN trunk to Proxmox

This approach provides better performance and eliminates PCIe passthrough complexity.

### Proxmox Bridge Configuration

| Bridge | Purpose | Physical Connection |
|--------|---------|---------------------|
| vmbr0 | Management LAN (1Gb) | Connected to pfSense igb1 |
| vmbr3 | VLAN trunk (10Gb) | Connected to pfSense bxe0 via SFP |

### Post-Migration Fixes

1. **NAT Reflection**: Had to enable NAT reflection in pfSense (System → Advanced → Firewall & NAT) for internal access to public URLs.

2. **NPM VLAN Interfaces**: Nginx Proxy Manager's VLAN interfaces (net1, net2) had to be moved from vmbr0 to vmbr3 for proper inter-VLAN routing through pfSense:
   ```bash
   qm set 102 --net1 virtio=...,bridge=vmbr3,tag=160 --net2 virtio=...,bridge=vmbr3,tag=170
   ```

3. **Split-Horizon DNS**: Configured host overrides in pfSense DNS Resolver for api.nacho.builders and app.nacho.builders.

---

## Phase 1: Proxmox Preparation

### 1.1 Current Network Topology

**Physical NICs on eth-node:**
| NIC | Status | Use After Migration |
|-----|--------|---------------------|
| eno1 | Not Active | **WAN** (PCIe passthrough to pfSense) |
| eno2 | Not Active | **WiFi AP** (direct connection for VLAN support) |
| eno3 | Active | Part of vmbr0 bond |
| eno4 | Active | Part of vmbr0 bond |

**Bridges:**
| Bridge | CIDR | VLAN Aware | Purpose |
|--------|------|------------|---------|
| vmbr0 | 192.168.150.222/24 | Yes | Main network (eno3+eno4 bond) |
| vmbr1 | 10.10.10.1/24 | No | Legacy - can remove |
| vmbr2 | 10.10.11.1/24 | No | Legacy - can remove |

### 1.2 IOMMU Status: ALREADY ENABLED

**Verified:** Intel VT-d (IOMMU) is already active on the HP ProLiant server.
```
DMAR: Intel(R) Virtualization Technology for Directed I/O
```

**No reboot required for IOMMU.**

### 1.3 NIC Details (Verified)

All NICs are **Broadcom NetXtreme BCM5719** using `tg3` driver:

| NIC | PCI Address | MAC Address | Status |
|-----|-------------|-------------|--------|
| eno1 | **0000:02:00.0** | 3c:a8:2a:0a:ae:7c | DOWN (available for WAN) |
| eno2 | **0000:02:00.1** | 3c:a8:2a:0a:ae:7d | DOWN (available for AP) |
| eno3 | 0000:02:00.2 | 3c:a8:2a:0a:ae:7e | In vmbr0 bond |
| eno4 | 0000:02:00.3 | 3c:a8:2a:0a:ae:7f | In vmbr0 bond (active) |

### 1.4 Passthrough eno1 for WAN

**Unbind at runtime (no reboot) - RECOMMENDED**
```bash
# Unbind eno1 from tg3 driver
echo "0000:02:00.0" > /sys/bus/pci/drivers/tg3/unbind

# Load vfio-pci module
modprobe vfio-pci

# Bind eno1 to vfio-pci for passthrough
echo "14e4 1657" > /sys/bus/pci/drivers/vfio-pci/new_id
echo "0000:02:00.0" > /sys/bus/pci/drivers/vfio-pci/bind
```

**Make persistent (optional, after testing):**
Create `/etc/modprobe.d/vfio.conf`:
```
options vfio-pci ids=14e4:1657
```
And add to `/etc/modules`: `vfio-pci`

Note: Since all 4 NICs share the same PCI ID, you may need to use a startup script to selectively unbind only eno1.

### 1.5 Optional Cleanup

Remove legacy bridges and interfaces (after pfSense is working):
```bash
# In Proxmox UI: Network > Remove these:
# - vmbr1 (Relay Network - legacy)
# - vmbr2 (Core Network - legacy)
# - corenet (alias ada-core-network - legacy)
# - relaynet (alias ada-relay-network - legacy)
# Then: Apply Configuration
```

---

## Phase 2: pfSense VM Creation

### 2.1 VM Specifications

| Parameter | Value |
|-----------|-------|
| VM ID | 100 |
| Name | pfsense-gw |
| CPU | 2 vCPU (host type) |
| Memory | 4096 MB (no ballooning) |
| BIOS | OVMF (UEFI) |
| Machine | q35 |
| Disk | 32 GB virtio on local-lvm |
| Start at boot | Yes |
| Start order | 1 (first) |

### 2.2 Network Interfaces

| Interface | Type | Configuration |
|-----------|------|---------------|
| WAN | PCIe Passthrough | **eno1** passed through (PCI address from step 1.3) |
| LAN | virtio | Bridge: vmbr0, No VLAN tag, Firewall: No |

**Physical cabling during cutover:**
- Disconnect ISP modem cable from UDR7 WAN port
- Connect ISP modem cable to **eno1** port on Proxmox server

### 2.3 Installation Steps

1. Download pfSense CE ISO, upload to Proxmox
2. Create VM with specs above (WAN passthrough added later)
3. Boot from ISO, install to virtio disk
4. Initial console config:
   - Assign LAN interface
   - Set temporary IP: 192.168.150.250/24
5. Access web UI, complete setup wizard

---

## Phase 3: pfSense Configuration

### 3.1 VLAN Interfaces

Create on LAN parent interface:

| VLAN ID | Interface Name | IP Address | Description |
|---------|---------------|------------|-------------|
| (native) | LAN | 192.168.150.1/24 | Management |
| 10 | GUEST | 192.168.10.1/24 | Guest WiFi (isolated) |
| 160 | CARDANO_MAINNET | 192.168.160.1/24 | Stake Pool |
| 161 | CARDANO_PREPROD | 192.168.161.1/24 | Testnet |
| 170 | API_PLATFORM | 192.168.170.1/24 | API Services |
| 2 | VPN_CLIENTS | 192.168.2.1/24 | WireGuard |

### 3.2 DHCP Configuration

**VLAN 150 (Management) - DHCP Enabled**:
- Range: 192.168.150.100 - 192.168.150.199
- Static reservations (optional, for reference):
  - 192.168.150.222 - eth-node (Proxmox)
  - 192.168.150.224 - nginx-proxy

**VLAN 10 (Guest) - DHCP Enabled**:
- Range: 192.168.10.100 - 192.168.10.199
- DNS: 1.1.1.1, 8.8.8.8 (external, not pfSense)
- No access to internal networks

**VLANs 160, 161, 170 - NO DHCP**:
- All hosts use static IPs configured in their netplan/network config
- pfSense only needs to route these subnets, not provide DHCP

### 3.3 Port Forwarding (NAT)

> **Status: CONFIGURED** (January 2026)
>
> NAT port forward rules configured via Ansible playbook `92-pfsense-nat-rules.yml`

| WAN Port | Destination | Protocol | Description |
|----------|-------------|----------|-------------|
| 80 | 192.168.150.224:80 | TCP | NPM HTTP |
| 443 | 192.168.150.224:443 | TCP | NPM HTTPS |
| 6001 | 192.168.160.11:6000 | TCP | Mainnet Relay 1 P2P |
| 6002 | 192.168.160.12:6000 | TCP | Mainnet Relay 2 P2P |
| 6003 | 192.168.161.11:6000 | TCP | Preprod Relay P2P |
| 51820 | (pfSense) | UDP | WireGuard VPN |

**Ansible Management:**
```bash
# Configure/verify NAT rules
ansible-playbook -i inventory/hosts.yml playbooks/92-pfsense-nat-rules.yml

# Backup pfSense config
ansible-playbook -i inventory/hosts.yml playbooks/91-backup-pfsense.yml
```

**Verify active rules:**
```bash
ssh admin@192.168.150.1 "pfctl -sn | grep rdr"
```

### 3.4 Critical Firewall Rules

**Block Producer Isolation** (CRITICAL):
- Block ALL traffic to 192.168.160.10 except from relays (192.168.160.11, .12)
- Block BP outbound internet access

**API Platform Access**:
- Allow 192.168.170.0/24 -> Relays on ports 1337, 8090, 6000
- Block 192.168.170.0/24 -> Block Producer

**Admin Access**:
- Allow 192.168.150.0/24 (LAN) -> All VLANs on port 22
- Allow 192.168.2.0/24 (VPN) -> All VLANs on port 22
- Allow VPN -> Grafana (3000), Prometheus (9090), Proxmox (8006)

**Guest Network Isolation** (VLAN 10):
- Allow GUEST -> Internet (any)
- Block GUEST -> All internal networks (192.168.0.0/16 except 192.168.10.0/24)
- Block GUEST -> pfSense management (192.168.10.1)

### 3.5 DNS Resolver (Split-Horizon)

Host overrides to resolve internal IPs:

| Host | Domain | IP |
|------|--------|-----|
| api | nacho.builders | 192.168.170.10 |
| app | nacho.builders | 192.168.170.10 |

### 3.6 WireGuard VPN

| Setting | Value |
|---------|-------|
| Listen Port | 51820 |
| Tunnel Address | 192.168.2.1/24 |
| Client Range | 192.168.2.10-99 |

### 3.7 Remote Management Access

**Via WireGuard VPN**, you can remotely access:

| Service | URL/Address | Port |
|---------|-------------|------|
| **Proxmox Web UI** | https://192.168.150.222:8006 | 8006 |
| **pfSense Web UI** | https://192.168.150.1 | 443 |
| Grafana | http://192.168.160.2:3000 | 3000 |
| Prometheus | http://192.168.160.2:9090 | 9090 |
| SSH to any host | 192.168.X.X | 22 |

**WireGuard Client Config Template:**
```ini
[Interface]
PrivateKey = <your_private_key>
Address = 192.168.2.10/24
DNS = 192.168.150.1

[Peer]
PublicKey = <pfsense_public_key>
AllowedIPs = 192.168.0.0/16
Endpoint = nacho.builders:51820
PersistentKeepalive = 25
```

**Remote workflow:**
1. Connect to WireGuard VPN from laptop/phone
2. Access Proxmox at https://192.168.150.222:8006
3. Access pfSense at https://192.168.150.1
4. SSH to any internal host

---

## Phase 4: Ansible Integration

pfSense has been added to the Ansible inventory:

- **Host**: `pfsense-gw` in the `network` group
- **Group vars**: `ansible/inventory/group_vars/network.yml`
- **Backup playbook**: `ansible/playbooks/91-backup-pfsense.yml`

### Enable SSH on pfSense

1. System > Advanced > Admin Access > Enable Secure Shell
2. Set to "Public Key Only"
3. Add SSH public key to admin user

### Test Ansible Connectivity

```bash
cd ~/claudecode/cardano-spo/ansible
ansible pfsense-gw -m ping
```

### Backup pfSense Configuration

```bash
ansible-playbook -i inventory/hosts.yml playbooks/91-backup-pfsense.yml
```

---

## Phase 5: WiFi AP Setup

### Recommended Hardware

| Option | Model | Price | Notes |
|--------|-------|-------|-------|
| Budget | TP-Link EAP225 | ~$60 | 802.11ac, standalone mode |
| **Recommended** | UniFi U6 Lite | ~$100 | WiFi 6, app-managed |
| Premium | UniFi U6 Pro | ~$150 | Higher capacity |

### WiFi Networks to Configure

| SSID | Band | VLAN | Purpose |
|------|------|------|---------|
| FMS-24Ghz | 2.4 GHz | 150 | Primary network (full access) |
| FMS-5Ghz | 5 GHz | 150 | Primary network (full access) |
| FMSGuest-24Ghz | 2.4 GHz | **10** | Guest network (internet only) |
| FMSGuest-5Ghz | 5 GHz | **10** | Guest network (internet only) |

**Note:** WiFi passwords stored separately (not in version control).

### Proxmox Bridge for AP (eno2)

Create in Proxmox UI (Network > Create > Linux Bridge):
```
Name: vmbr3
Ports/Slaves: eno2
VLAN aware: Yes
Comment: WiFi AP trunk
```

Then add vmbr3 to pfSense VM as a third interface for AP traffic.

### Setup (Standalone Mode)

1. **Connect AP to eno2 port** on Proxmox server (not the unmanaged switch)
2. Factory reset AP
3. Configure via mobile app or web UI
4. Create all 4 SSIDs:
   - FMS-24Ghz and FMS-5Ghz -> untagged (VLAN 150)
   - FMSGuest-24Ghz and FMSGuest-5Ghz -> VLAN 10
5. Configure band steering if AP supports it (optional)

---

## Phase 6: Migration Execution

### Pre-Cutover Checklist

- [ ] pfSense VM created and fully configured (except WAN)
- [ ] All firewall rules entered
- [ ] DHCP configured for VLAN 150 only
- [ ] WireGuard tunnel configured
- [ ] UDR7 backup saved
- [ ] All MAC addresses documented
- [ ] Block producer slot schedule checked (no blocks during window)
- [ ] WiFi AP ready to deploy

### Cutover Sequence (Target: < 5 min downtime)

| Step | Action | Rollback |
|------|--------|----------|
| 1 | Shutdown pfSense VM | - |
| 2 | Add WAN NIC passthrough to VM | Remove passthrough |
| 3 | Disconnect WAN cable from UDR7 | Reconnect to UDR7 |
| 4 | Connect WAN cable to Proxmox NIC | - |
| 5 | Power off UDR7 | Power on UDR7 |
| 6 | Start pfSense VM | Stop VM |
| 7 | Assign WAN interface in console | - |
| 8 | Change LAN IP to 192.168.150.1 | - |
| 9 | Enable DHCP on LAN (VLAN 150 only) | - |
| 10 | Connect WiFi AP to switch | - |

### Post-Cutover Verification

**Mainnet Stake Pool**:
- [x] Relay 1 (192.168.160.11) synced and reachable externally on port 6001
- [x] Relay 2 (192.168.160.12) synced and reachable externally on port 6002
- [x] Block producer (192.168.160.10) shows 2 active peers
- [x] Monitoring (192.168.160.2) - Grafana accessible, all metrics flowing

**Preprod Testnet**:
- [x] Preprod relay (192.168.161.11) synced and operational
- [x] Ogmios on preprod relay responding (port 1337)

**API Platform**:
- [x] Gateway (192.168.170.10) responding
- [x] DB-Sync (192.168.170.20) connected and syncing
- [x] https://api.nacho.builders accessible externally
- [x] https://app.nacho.builders accessible externally
- [x] GraphQL endpoint responding

**Network & Security**:
- [x] WireGuard VPN connects successfully
- [x] SSH works via VPN to all hosts
- [x] Split-horizon DNS working (internal resolution to 192.168.170.10)
- [x] BP isolation verified (cannot reach from API platform VLAN)
- [x] Inter-VLAN routing working (API can reach relays on 1337, 8090)

---

## Rollback Procedure

If issues occur during or after cutover:

1. Stop pfSense VM
2. Remove WAN NIC passthrough from VM config
3. Reconnect WAN cable to UDR7
4. Power on UDR7
5. Wait 2-3 minutes for UDR7 to boot
6. Verify all services restored

**Keep UDR7 stored with**: power adapter, current config intact, cables ready.

---

## Verification Commands

After migration is complete:

```bash
# Test Ansible connectivity to pfSense
cd ~/claudecode/cardano-spo/ansible
ansible pfsense-gw -m ping

# Verify external relay connectivity
nc -zv nacho.builders 6001
nc -zv nacho.builders 6002

# Check block producer peers
ssh michael@192.168.160.10 "curl -s localhost:12798/metrics | grep cardano_node_metrics_peers"

# Check mainnet relay sync status
ssh michael@192.168.160.11 "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet"
ssh michael@192.168.160.12 "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet"

# Check preprod relay sync status
ssh michael@192.168.161.11 "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --testnet-magic 1"

# Verify preprod Ogmios
curl -s http://192.168.161.11:1337/health

# Test API endpoints
curl -I https://api.nacho.builders/health
curl -I https://app.nacho.builders

# Check DB-Sync status
ssh michael@192.168.170.20 "sudo -u postgres psql -d cexplorer -c 'SELECT MAX(block_no) FROM block;'"

# Test GraphQL
curl -s https://api.nacho.builders/graphql/preprod -H 'Content-Type: application/json' \
  -d '{"query": "{ cardano { tip { slotNo } } }"}'

# Verify DNS resolution (from internal host)
dig api.nacho.builders @192.168.150.1  # Should return 192.168.170.10

# Check Grafana
curl -I http://192.168.160.2:3000

# Test BP isolation (should fail/timeout)
ssh michael@192.168.170.10 "ping -c 1 192.168.160.10"  # Should fail
```
