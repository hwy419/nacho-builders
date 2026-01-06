# Proxmox VE Networking Configuration Guide
## Cardano Stake Pool Infrastructure - nacho.builders

This guide covers complete Proxmox VE 8.2.2 networking configuration for hosting Cardano stake pool VMs with VLAN isolation.

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Prerequisites](#2-prerequisites)
3. [Current Network Assessment](#3-current-network-assessment)
4. [Configure VLAN-Aware Bridge](#4-configure-vlan-aware-bridge)
5. [Create Virtual Machines](#5-create-virtual-machines)
6. [Configure VM Networking](#6-configure-vm-networking)
7. [Proxmox Firewall (Optional)](#7-proxmox-firewall-optional)
8. [Verification & Testing](#8-verification--testing)
9. [Troubleshooting](#9-troubleshooting)
10. [Backup & Recovery](#10-backup--recovery)

---

## 1. Architecture Overview

### Network Design

```
                    UniFi DR7
                   ┌─────────┐
                   │         │
         VLAN 1   │         │  VLAN 160
       (untagged) │         │  (tagged)
                   │         │
                   └────┬────┘
                        │
                        │ Trunk Port
                        │ (carries all VLANs)
                        │
              ┌─────────▼─────────┐
              │   Physical NIC    │
              │    (enp3s0)       │
              └─────────┬─────────┘
                        │
              ┌─────────▼─────────┐
              │   Linux Bridge    │
              │      vmbr0        │
              │                   │
              │  VLAN-Aware: YES  │
              │  IP: 192.168.150.222/24 (untagged)
              │                   │
              └─────────┬─────────┘
                        │
        ┌───────────────┼───────────────┐
        │               │               │
   ┌────▼────┐    ┌─────▼─────┐   ┌─────▼─────┐
   │  VM 111 │    │  VM 112   │   │  VM 113   │
   │   BP    │    │  Relay1   │   │  Relay2   │
   │         │    │           │   │           │
   │ VLAN:160│    │ VLAN:160  │   │ VLAN:160  │
   │.160.10  │    │ .160.11   │   │ .160.12   │
   └─────────┘    └───────────┘   └───────────┘
```

### Why Single VLAN-Aware Bridge?

| Approach | Description | Our Choice |
|----------|-------------|------------|
| **Single VLAN-aware bridge** | One bridge handles all VLANs via tagging | ✅ **Selected** |
| Separate bridges per VLAN | Multiple bridges, each for one VLAN | Not needed |
| OVS (Open vSwitch) | Advanced software switch | Overkill for this use case |

**Rationale:**
- UniFi DR7 handles Layer 3 routing and VLAN separation
- Proxmox only needs to tag frames correctly
- Simpler configuration and easier troubleshooting
- Industry standard approach

---

## 2. Prerequisites

### Hardware Requirements

- [x] Proxmox VE 8.2.2 installed (your current version)
- [x] Physical NIC connected to UniFi switch/router
- [x] Network cable supporting at least 1Gbps

### Access Requirements

- [x] Root SSH access to Proxmox host
- [x] Web UI access to Proxmox (https://192.168.150.222:8006)

### Pre-Configuration Checklist

- [ ] Backup current `/etc/network/interfaces`
- [ ] Note current IP configuration
- [ ] Have console access ready (in case network breaks)
- [ ] UniFi VLAN 160 already created

### ⚠️ Important Warning

**Network configuration changes can disconnect you from the server!**

Before proceeding:
1. Ensure you have physical console access OR
2. Ensure you have IPMI/iLO/iDRAC access OR
3. Have someone who can physically access the server

---

## 3. Current Network Assessment

### Step 3.1: Check Current Configuration

SSH into Proxmox host:

```bash
ssh root@192.168.150.222
```

View current network config:

```bash
cat /etc/network/interfaces
```

**Expected current configuration:**
```
auto lo
iface lo inet loopback

iface enp3s0 inet manual

auto vmbr0
iface vmbr0 inet static
    address 192.168.150.222/24
    gateway 192.168.150.1
    bridge-ports enp3s0
    bridge-stp off
    bridge-fd 0
```

### Step 3.2: Identify Physical Interface

```bash
# List all network interfaces
ip link show

# Check which interface has carrier (cable connected)
cat /sys/class/net/*/carrier

# Most likely your interface is one of:
# - enp3s0 (common for onboard NICs)
# - eno1/eno2 (enterprise naming)
# - eth0 (legacy naming)
```

**Note your physical interface name:** `_______________`

### Step 3.3: Backup Current Configuration

```bash
cp /etc/network/interfaces /etc/network/interfaces.backup.$(date +%Y%m%d)
```

---

## 4. Configure VLAN-Aware Bridge

### Step 4.1: Edit Network Interfaces

Open the network configuration file:

```bash
nano /etc/network/interfaces
```

### Step 4.2: Replace with VLAN-Aware Configuration

Replace the contents with (adjust interface name if needed):

```bash
# Loopback interface
auto lo
iface lo inet loopback

# Physical interface - no IP, member of bridge
iface enp3s0 inet manual

# Main bridge - VLAN aware
auto vmbr0
iface vmbr0 inet static
    address 192.168.150.222/24
    gateway 192.168.150.1
    bridge-ports enp3s0
    bridge-stp off
    bridge-fd 0
    bridge-vlan-aware yes
    bridge-vids 2-4094
#
# VLAN Configuration Notes:
# - bridge-vlan-aware yes : Enables 802.1Q VLAN tagging
# - bridge-vids 2-4094   : Allows all VLANs (we use 160)
# - Proxmox host IP is on VLAN 1 (untagged/native)
# - VMs get VLAN tag assigned per-VM in Proxmox
```

### Step 4.3: Validate Configuration Syntax

Before applying, check for syntax errors:

```bash
# Test configuration (doesn't apply it)
ifreload -a -s
```

If you see errors, fix them before proceeding.

### Step 4.4: Apply Configuration

**Option A: Safe method (recommended)**

```bash
# Apply with automatic rollback if connection lost
ifreload -a
```

Wait 10 seconds and verify you still have connectivity:

```bash
ping -c 3 192.168.150.1
```

**Option B: Full restart (use if ifreload doesn't work)**

```bash
systemctl restart networking
```

### Step 4.5: Verify Bridge Configuration

```bash
# Check bridge is VLAN-aware
bridge vlan show

# Expected output should include:
# vmbr0   1 PVID Egress Untagged
#         2
#         ...
#         160
#         ...
```

```bash
# Check bridge details
brctl show vmbr0

# Check bridge has VLAN filtering enabled
cat /sys/class/net/vmbr0/bridge/vlan_filtering
# Should output: 1
```

---

## 5. Create Virtual Machines

### VM Specifications

| VM ID | Name | vCPUs | RAM | Disk | Purpose |
|-------|------|-------|-----|------|---------|
| 111 | cardano-bp | 4 | 32 GB | 200 GB | Block Producer |
| 112 | cardano-relay1 | 4 | 32 GB | 200 GB | Relay Node 1 |
| 113 | cardano-relay2 | 4 | 32 GB | 200 GB | Relay Node 2 |

### Step 5.1: Download Ubuntu Server ISO

```bash
# Download Ubuntu 22.04 LTS Server
cd /var/lib/vz/template/iso/
wget https://releases.ubuntu.com/22.04/ubuntu-22.04.4-live-server-amd64.iso
```

Or upload via Proxmox web UI:
1. Select `local` storage
2. Click `ISO Images`
3. Click `Upload` and select the ISO

### Step 5.2: Create Block Producer VM (VM 111)

**Via Web UI:**

1. Click **Create VM** button

2. **General Tab:**
   ```
   Node:     eth-node
   VM ID:    111
   Name:     cardano-bp
   ```

3. **OS Tab:**
   ```
   ISO image:    ubuntu-22.04.4-live-server-amd64.iso
   Type:         Linux
   Version:      6.x - 2.6 Kernel
   ```

4. **System Tab:**
   ```
   Machine:           q35
   BIOS:              OVMF (UEFI)
   Add EFI Disk:      ☑ Yes
   EFI Storage:       local-lvm
   SCSI Controller:   VirtIO SCSI single
   Qemu Agent:        ☑ Yes
   Add TPM:           ☐ No
   ```

5. **Disks Tab:**
   ```
   Bus/Device:        VirtIO Block (virtio0)
   Storage:           local-lvm
   Disk size (GiB):   200
   Cache:             Write back
   Discard:           ☑ Yes
   SSD emulation:     ☑ Yes
   IO thread:         ☑ Yes
   ```

6. **CPU Tab:**
   ```
   Sockets:   1
   Cores:     4
   Type:      host
   ```

7. **Memory Tab:**
   ```
   Memory (MiB):      32768
   Ballooning:        ☐ No (uncheck - important for consistent performance)
   ```

8. **Network Tab:**
   ```
   Bridge:            vmbr0
   VLAN Tag:          160        ← CRITICAL: Set this!
   Model:             VirtIO (paravirtualized)
   Firewall:          ☑ Yes
   ```

9. **Confirm Tab:**
   - Review settings
   - ☐ Start after created (don't start yet)
   - Click **Finish**

### Step 5.3: Create Relay 1 VM (VM 112)

Repeat the process with these differences:

```
VM ID:    112
Name:     cardano-relay1
```

All other settings identical to VM 111.

### Step 5.4: Create Relay 2 VM (VM 113)

Repeat the process with these differences:

```
VM ID:    113
Name:     cardano-relay2
```

All other settings identical to VM 111.

### Step 5.5: Verify VM Configuration

For each VM, go to **Hardware** and verify:

- Network Device shows: `vmbr0, VLAN Tag: 160`
- Memory shows: 32768 MiB
- Processors shows: 4 cores
- Disk shows: 200 GB

---

## 6. Configure VM Networking

### Step 6.1: Install Ubuntu on Each VM

Start each VM and complete Ubuntu installation:

1. Start VM: **VM → Start**
2. Open Console: **VM → Console**
3. Follow Ubuntu Server installation
4. Key settings during install:
   - Language: English
   - Keyboard: US (or your preference)
   - Installation: Ubuntu Server (minimized)
   - Network: Configure manually (see below)
   - Storage: Use entire disk
   - Profile: 
     - Name: cardano
     - Server name: cardano-bp / cardano-relay1 / cardano-relay2
     - Username: cardano
     - Password: (strong password)
   - SSH: Install OpenSSH server ☑
   - Snaps: None (skip)

### Step 6.2: Configure Static IPs During Installation

During the network configuration step of Ubuntu installation:

**For Block Producer (VM 111):**
```
Subnet:     192.168.160.0/24
Address:    192.168.160.10
Gateway:    192.168.160.1
DNS:        1.1.1.1,8.8.8.8
Search:     (leave blank)
```

**For Relay 1 (VM 112):**
```
Subnet:     192.168.160.0/24
Address:    192.168.160.11
Gateway:    192.168.160.1
DNS:        1.1.1.1,8.8.8.8
```

**For Relay 2 (VM 113):**
```
Subnet:     192.168.160.0/24
Address:    192.168.160.12
Gateway:    192.168.160.1
DNS:        1.1.1.1,8.8.8.8
```

### Step 6.3: Post-Installation Network Verification

After Ubuntu installation completes, log in and verify:

```bash
# Check IP address
ip addr show

# Should show something like:
# 2: ens18: <BROADCAST,MULTICAST,UP,LOWER_UP>
#     inet 192.168.160.10/24 brd 192.168.160.255 scope global ens18
```

```bash
# Check gateway
ip route show

# Should show:
# default via 192.168.160.1 dev ens18
# 192.168.160.0/24 dev ens18 proto kernel scope link src 192.168.160.10
```

```bash
# Test gateway connectivity
ping -c 3 192.168.160.1

# Test internet
ping -c 3 1.1.1.1
ping -c 3 google.com
```

### Step 6.4: Manual Netplan Configuration (If Needed)

If you need to reconfigure networking post-installation:

```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

**Block Producer configuration:**
```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    ens18:
      addresses:
        - 192.168.160.10/24
      routes:
        - to: default
          via: 192.168.160.1
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

**Relay 1 configuration:**
```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    ens18:
      addresses:
        - 192.168.160.11/24
      routes:
        - to: default
          via: 192.168.160.1
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

**Relay 2 configuration:**
```yaml
network:
  version: 2
  renderer: networkd
  ethernets:
    ens18:
      addresses:
        - 192.168.160.12/24
      routes:
        - to: default
          via: 192.168.160.1
      nameservers:
        addresses:
          - 1.1.1.1
          - 8.8.8.8
```

Apply configuration:
```bash
sudo netplan apply
```

### Step 6.5: Install QEMU Guest Agent

For better VM management:

```bash
sudo apt update
sudo apt install qemu-guest-agent -y
sudo systemctl enable qemu-guest-agent
sudo systemctl start qemu-guest-agent
```

---

## 7. Proxmox Firewall (Optional)

Proxmox has a built-in firewall that provides an additional security layer. This is defense-in-depth on top of:
1. UniFi firewall rules
2. UFW on each VM

### Step 7.1: Enable Datacenter Firewall

1. Go to **Datacenter → Firewall → Options**
2. Set **Firewall: Yes**

### Step 7.2: Create IP Sets

Go to **Datacenter → Firewall → IPSet**

**Create "management" IP set:**
```
Name: management
Members:
  192.168.150.0/24    # LAN
  192.168.2.0/24      # VPN
```

**Create "cardano-relays" IP set:**
```
Name: cardano-relays
Members:
  192.168.160.11      # Relay 1
  192.168.160.12      # Relay 2
```

### Step 7.3: Create Security Groups

Go to **Datacenter → Firewall → Security Group**

**Create "cardano-relay" group:**

| Direction | Action | Protocol | Dest. Port | Source | Comment |
|-----------|--------|----------|------------|--------|---------|
| IN | ACCEPT | tcp | 6000 | | Cardano P2P |
| IN | ACCEPT | tcp | 22 | +management | SSH |
| IN | ACCEPT | tcp | 12798 | +management | Prometheus |
| IN | DROP | | | | Default deny |

**Create "cardano-bp" group:**

| Direction | Action | Protocol | Dest. Port | Source | Comment |
|-----------|--------|----------|------------|--------|---------|
| IN | ACCEPT | tcp | 6000 | +cardano-relays | Only relays |
| IN | ACCEPT | tcp | 22 | +management | SSH |
| IN | ACCEPT | tcp | 12798 | +management | Prometheus |
| IN | DROP | | | | Default deny |

### Step 7.4: Apply Security Groups to VMs

**For VM 111 (Block Producer):**
1. Go to **VM 111 → Firewall → Options**
2. Set **Firewall: Yes**
3. Go to **VM 111 → Firewall → Insert: Security Group**
4. Select: `cardano-bp`

**For VM 112 and 113 (Relays):**
1. Enable firewall on each VM
2. Insert security group: `cardano-relay`

### Step 7.5: Verify Firewall Status

```bash
# On Proxmox host
pve-firewall status

# Should show:
# Status: enabled/running
```

---

## 8. Verification & Testing

### Test 1: VLAN Tagging Verification

On Proxmox host:

```bash
# Check VLAN configuration on bridge
bridge vlan show dev vmbr0

# Should show VLAN 160 in the list
```

### Test 2: VM-to-Gateway Connectivity

From each VM:

```bash
ping -c 3 192.168.160.1
```

**Expected:** All pings succeed

### Test 3: VM-to-VM Connectivity

From Block Producer:

```bash
ping -c 3 192.168.160.11  # Relay 1
ping -c 3 192.168.160.12  # Relay 2
```

From Relay 1:

```bash
ping -c 3 192.168.160.10  # BP
ping -c 3 192.168.160.12  # Relay 2
```

**Expected:** All pings succeed

### Test 4: Internet Connectivity

From each VM:

```bash
ping -c 3 1.1.1.1
ping -c 3 google.com
curl -I https://github.com
```

**Expected:** All succeed

### Test 5: Management Access

From your LAN (192.168.150.x):

```bash
ssh cardano@192.168.160.10
ssh cardano@192.168.160.11
ssh cardano@192.168.160.12
```

From VPN (192.168.2.x):

```bash
ssh cardano@192.168.160.10
ssh cardano@192.168.160.11
ssh cardano@192.168.160.12
```

**Expected:** All connections succeed

### Test 6: VLAN Isolation (Should FAIL)

From any Cardano VM, try to reach LAN:

```bash
ping -c 3 192.168.150.222  # Proxmox host
```

**Expected:** Should fail (blocked by UniFi firewall)

### Test 7: Proxmox Host Connectivity

From Proxmox host:

```bash
# Host should NOT be able to ping VLAN 160 directly
# because host is on VLAN 1 (untagged)
ping -c 3 192.168.160.10
```

**Expected:** Should fail (different VLAN, no route on host)

**Note:** This is normal! The Proxmox host is on VLAN 1, VMs are on VLAN 160. They communicate via the UniFi router.

To manage VMs from Proxmox host:

```bash
# Use Proxmox console instead
qm terminal 100

# Or use VM console in web UI
```

---

## 9. Troubleshooting

### Issue: VM Has No Network Connectivity

**Symptoms:** VM can't reach gateway or internet

**Diagnostic Steps:**

```bash
# On VM: Check interface status
ip link show

# Check if interface has IP
ip addr show

# Check VLAN tag in Proxmox
qm config 111 | grep net
# Should show: net0: virtio=XX:XX:XX:XX:XX:XX,bridge=vmbr0,tag=160
```

**Fixes:**

1. Verify VLAN tag is set on VM:
   - Web UI: VM → Hardware → Network Device → Edit → VLAN Tag: 160

2. Verify bridge is VLAN-aware:
   ```bash
   grep vlan-aware /etc/network/interfaces
   # Should show: bridge-vlan-aware yes
   ```

3. Restart networking on VM:
   ```bash
   sudo netplan apply
   ```

### Issue: VMs Can't Reach Each Other

**Symptoms:** VM-to-VM ping fails within VLAN 160

**Diagnostic Steps:**

```bash
# Check if both VMs have correct IPs
# On VM1:
ip addr show | grep 192.168.160

# Check if gateway is reachable
ping 192.168.160.1
```

**Fixes:**

1. Ensure both VMs have VLAN tag 160
2. Verify UniFi has VLAN 160 network created
3. Check UniFi firewall isn't blocking intra-VLAN traffic

### Issue: Can't SSH from LAN to Cardano VLAN

**Symptoms:** SSH connection refused or times out

**Diagnostic Steps:**

```bash
# From LAN machine
traceroute 192.168.160.10

# Check if it routes through UniFi
# Should show 192.168.150.1 as first hop
```

**Fixes:**

1. Check UniFi firewall rules allow LAN→Cardano SSH
2. Verify UFW on VM allows SSH:
   ```bash
   sudo ufw status
   # Should show 22/tcp ALLOW
   ```

### Issue: Proxmox Host Lost Network After Config Change

**Symptoms:** Can't SSH to Proxmox after editing /etc/network/interfaces

**Fixes:**

1. Access via Proxmox console (iDRAC, IPMI, physical)
2. Restore backup:
   ```bash
   cp /etc/network/interfaces.backup.* /etc/network/interfaces
   ifreload -a
   ```
3. Or fix configuration and apply:
   ```bash
   nano /etc/network/interfaces
   ifreload -a
   ```

### Issue: VLAN Traffic Not Passing

**Symptoms:** VLAN-tagged traffic doesn't reach VMs

**Diagnostic Steps:**

```bash
# On Proxmox, check VLAN filtering
cat /sys/class/net/vmbr0/bridge/vlan_filtering
# Should be: 1

# Check VLANs on bridge
bridge vlan show
```

**Fixes:**

1. Ensure physical switch port is configured as trunk (UniFi should handle this automatically)
2. Verify bridge-vids includes your VLAN:
   ```bash
   grep bridge-vids /etc/network/interfaces
   # Should include 160 in range
   ```

---

## 10. Backup & Recovery

### Configuration Files to Backup

```bash
# Network configuration
/etc/network/interfaces

# VM configurations
/etc/pve/qemu-server/100.conf
/etc/pve/qemu-server/101.conf
/etc/pve/qemu-server/102.conf

# Firewall configuration (if using)
/etc/pve/firewall/
```

### Create Backup Script

```bash
#!/bin/bash
# Save as /root/backup-network-config.sh

BACKUP_DIR="/root/network-backups"
DATE=$(date +%Y%m%d-%H%M%S)

mkdir -p $BACKUP_DIR

cp /etc/network/interfaces $BACKUP_DIR/interfaces.$DATE
cp -r /etc/pve/qemu-server/ $BACKUP_DIR/qemu-server.$DATE/
cp -r /etc/pve/firewall/ $BACKUP_DIR/firewall.$DATE/ 2>/dev/null

echo "Backup created: $BACKUP_DIR/*.$DATE"
```

```bash
chmod +x /root/backup-network-config.sh
```

### Recovery Procedure

If network configuration breaks:

1. Access server console (physical or IPMI)
2. Login as root
3. Restore configuration:
   ```bash
   cp /root/network-backups/interfaces.YYYYMMDD /etc/network/interfaces
   ifreload -a
   ```

---

## Quick Reference

### Network Configuration File

**Location:** `/etc/network/interfaces`

```bash
auto lo
iface lo inet loopback

iface enp3s0 inet manual

auto vmbr0
iface vmbr0 inet static
    address 192.168.150.222/24
    gateway 192.168.150.1
    bridge-ports enp3s0
    bridge-stp off
    bridge-fd 0
    bridge-vlan-aware yes
    bridge-vids 2-4094
```

### VM VLAN Configuration

**Set VLAN tag via CLI:**
```bash
qm set 111 --net0 virtio,bridge=vmbr0,tag=160
```

**View VM network config:**
```bash
qm config 111 | grep net
```

### Useful Commands

| Command | Purpose |
|---------|---------|
| `ifreload -a` | Apply network changes |
| `bridge vlan show` | Show VLAN config on bridges |
| `brctl show` | Show bridge interfaces |
| `qm config <vmid>` | View VM configuration |
| `pve-firewall status` | Check firewall status |

### IP Assignments

| Host | IP | VLAN |
|------|-----|------|
| Proxmox Host | 192.168.150.222 | 1 (untagged) |
| Block Producer | 192.168.160.10 | 160 |
| Relay 1 | 192.168.160.11 | 160 |
| Relay 2 | 192.168.160.12 | 160 |
| Gateway (UniFi) | 192.168.160.1 | 160 |

---

## Next Steps

After completing Proxmox configuration:

1. ☐ Install Ubuntu on all VMs
2. ☐ Configure static IPs on each VM
3. ☐ Test all connectivity scenarios
4. ☐ Apply OS hardening
5. ☐ Install Guild Operators
6. ☐ Configure Cardano nodes

---

*Document Version: 1.0*  
*Last Updated: December 2024*
