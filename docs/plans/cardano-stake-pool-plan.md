# Cardano Stake Pool Deployment Plan
## Family Medical Supply - nacho.builders

**Prepared for:** Michael  
**Infrastructure:** Proxmox VE 8.2.2 on eth-node (192.168.150.222)  
**Network:** UniFi Dream Router 7 (192.168.150.1)  
**Date:** December 2024

---

## Table of Contents

1. [Architecture Overview](#1-architecture-overview)
2. [Network Design & VLAN Strategy](#2-network-design--vlan-strategy)
3. [Proxmox VM Configuration](#3-proxmox-vm-configuration)
4. [UniFi Network Configuration](#4-unifi-network-configuration)
5. [DNS Configuration](#5-dns-configuration)
6. [VM Deployment & OS Hardening](#6-vm-deployment--os-hardening)
7. [Guild Operators Installation](#7-guild-operators-installation)
8. [Pool Registration & Key Management](#8-pool-registration--key-management)
9. [Monitoring & Maintenance](#9-monitoring--maintenance)
10. [Security Checklist](#10-security-checklist)
11. [Appendix: Command Reference](#11-appendix-command-reference)

---

## 1. Architecture Overview

### Network Topology

```
                                    INTERNET
                                        │
                                        │ AT&T Business
                                        │ WAN: 108.248.110.80 (dynamic)
                                        │
                              ┌─────────▼─────────┐
                              │  UniFi DR7        │
                              │  192.168.150.1    │
                              │                   │
                              │  Port Forwards:   │
                              │  6001 → Relay1    │
                              │  6002 → Relay2    │
                              └─────────┬─────────┘
                                        │
                    ┌───────────────────┼───────────────────┐
                    │                   │                   │
            VLAN 150 (LAN)      VLAN 160 (Cardano)   VLAN 170 (Mgmt)
            192.168.150.0/24    192.168.160.0/24     192.168.170.0/24
                    │                   │                   │
         ┌──────────┴──────────┐       │                   │
         │                     │       │                   │
    ┌────▼────┐          ┌─────▼─────┐ │             ┌─────▼─────┐
    │ Proxmox │          │  Nginx    │ │             │ Monitoring│
    │ Host    │          │  Proxy    │ │             │ (optional)│
    │ .222    │          │  Manager  │ │             │ .170.10   │
    └─────────┘          │  .244     │ │             └───────────┘
         │               └───────────┘ │
         │                             │
         │   ┌─────────────────────────┼─────────────────────────┐
         │   │                         │                         │
         │   │    VLAN 160 - Cardano Infrastructure              │
         │   │    192.168.160.0/24                                │
         │   │                                                    │
    ┌────▼───▼────┐    ┌─────────────┐    ┌─────────────┐    ┌───▼───────┐
    │   Relay 1   │    │   Relay 2   │    │Block Producer│   │Air-Gapped │
    │  .160.11    │    │  .160.12    │    │   .160.10    │   │ (offline) │
    │  Port 6000  │    │  Port 6000  │    │   Port 6000  │   │           │
    │             │◄───┤             │◄───┤              │   │ Key Gen   │
    │   PUBLIC    │    │   PUBLIC    │    │   PRIVATE    │   │ Signing   │
    └──────┬──────┘    └──────┬──────┘    └──────────────┘   └───────────┘
           │                  │
           │                  │
           ▼                  ▼
    ┌──────────────────────────────────┐
    │     CARDANO NETWORK              │
    │     (Other Relays & Pools)       │
    └──────────────────────────────────┘
```

### Component Summary

| Component | IP Address | VLAN | Ports | Internet Exposed |
|-----------|------------|------|-------|------------------|
| Block Producer | 192.168.160.10 | 160 | 6000 | **NO** |
| Relay 1 | 192.168.160.11 | 160 | 6000 | **YES** (via NAT 6001) |
| Relay 2 | 192.168.160.12 | 160 | 6000 | **YES** (via NAT 6002) |
| Air-Gapped Machine | N/A | None | None | **NO** (Offline) |

### DNS Records (nacho.builders)

| Record | Type | Value | Purpose |
|--------|------|-------|---------|
| nacho.builders | A | Dynamic WAN IP | Both relays (port 6001/6002) |

---

## 2. Network Design & VLAN Strategy

### VLAN Architecture

Creating a dedicated VLAN for Cardano infrastructure provides network isolation and simplified firewall rules.

| VLAN ID | Name | Subnet | Purpose |
|---------|------|--------|---------|
| 1/untagged | Default/LAN | 192.168.150.0/24 | Existing network, Proxmox host |
| 160 | Cardano | 192.168.160.0/24 | Stake pool nodes (isolated) |
| 170 | Management | 192.168.170.0/24 | Monitoring, SSH jump host (optional) |

### Why VLAN 160 for Cardano?

1. **Isolation**: Cardano nodes are isolated from your main LAN
2. **Simplified Firewall Rules**: Block all inter-VLAN traffic except specific allowed flows
3. **Security**: Block Producer is completely shielded from internet
4. **Auditability**: Network traffic is easier to monitor and log

### Traffic Flow Rules

| Source | Destination | Ports | Action | Notes |
|--------|-------------|-------|--------|-------|
| Internet | Relay1 (.160.11) | 6001→6000 | ALLOW | Port forward from WAN |
| Internet | Relay2 (.160.12) | 6002→6000 | ALLOW | Port forward from WAN |
| Relay1 | Block Producer | 6000 | ALLOW | Internal only |
| Relay2 | Block Producer | 6000 | ALLOW | Internal only |
| Block Producer | Relays | 6000 | ALLOW | Outbound to own relays |
| LAN (.150.0/24) | Cardano VLAN | 22 (SSH) | ALLOW | Management access |
| VPN (.2.0/24) | Cardano VLAN | 22 (SSH) | ALLOW | Remote management |
| Cardano VLAN | Internet | 443, 80 | ALLOW | Updates, NTP, etc. |
| Cardano VLAN | LAN | Any | **DENY** | Isolation |
| Cardano VLAN | VPN | Any | **DENY** | Isolation |
| Any | Block Producer | 6000 | **DENY** | Except own relays |

---

## 3. Proxmox VM Configuration

### Resource Allocation

Based on your hardware (24 vCPUs, 188GB RAM, 4TB NVMe + 22TB storage):

| VM | vCPUs | RAM | Storage | Notes |
|----|-------|-----|---------|-------|
| **Relay 1** | 4 | 32 GB | 200 GB (NVMe) | Slight over-provision for growth |
| **Relay 2** | 4 | 32 GB | 200 GB (NVMe) | Slight over-provision for growth |
| **Block Producer** | 4 | 32 GB | 200 GB (NVMe) | Most critical node |
| **Reserved** | 12 | 92 GB | — | Future expansion, host operations |

### Proxmox Network Configuration

#### Step 1: Create VLAN-Aware Bridge

Edit `/etc/network/interfaces` on Proxmox host:

```bash
# Current bridge - make VLAN aware
auto vmbr0
iface vmbr0 inet static
    address 192.168.150.222/24
    gateway 192.168.150.1
    bridge-ports enp3s0  # Your physical NIC
    bridge-stp off
    bridge-fd 0
    bridge-vlan-aware yes  # Enable VLAN awareness
    bridge-vids 2-4094     # Allow all VLANs
```

After editing, apply:
```bash
ifreload -a
```

#### Step 2: VM Network Configuration

When creating each VM, configure the network device:

**For Cardano VMs (VLAN 160):**
- Bridge: `vmbr0`
- VLAN Tag: `160`
- Model: `VirtIO (paravirtualized)`
- Firewall: `Yes` (Proxmox firewall for additional layer)

### VM Creation Template

Use these settings for each Cardano VM:

```
General:
  - Node: eth-node
  - VM ID: 112 (Relay1), 113 (Relay2), 111 (BP)
  - Name: cardano-relay1, cardano-relay2, cardano-bp

OS:
  - ISO: ubuntu-22.04.4-live-server-amd64.iso
  - Type: Linux
  - Version: 6.x - 2.6 Kernel

System:
  - Machine: q35
  - BIOS: OVMF (UEFI)
  - EFI Storage: local-lvm
  - Add TPM: No
  - SCSI Controller: VirtIO SCSI single

Disks:
  - Bus/Device: VirtIO Block (virtio0)
  - Storage: local-lvm (NVMe backed)
  - Disk size: 200 GB
  - Cache: Write back
  - Discard: Yes
  - SSD emulation: Yes

CPU:
  - Sockets: 1
  - Cores: 4
  - Type: host

Memory:
  - Memory: 32768 MB (32 GB)
  - Ballooning: No (disable for consistent performance)

Network:
  - Bridge: vmbr0
  - VLAN Tag: 160
  - Model: VirtIO
  - Firewall: Yes
```

### Proxmox Firewall Rules (Optional Additional Layer)

Enable Proxmox firewall for defense in depth. In Datacenter → Firewall → Options:
- Enable firewall: Yes

Create Security Group "cardano-relay":
```
Direction: IN, Action: ACCEPT, Protocol: tcp, Dest. port: 6000, Comment: Cardano P2P
Direction: IN, Action: ACCEPT, Protocol: tcp, Dest. port: 22, Source: 192.168.150.0/24, Comment: SSH from LAN
Direction: IN, Action: DROP, Comment: Drop all other
```

Create Security Group "cardano-bp":
```
Direction: IN, Action: ACCEPT, Protocol: tcp, Source: 192.168.160.11, Dest. port: 6000, Comment: Relay1
Direction: IN, Action: ACCEPT, Protocol: tcp, Source: 192.168.160.12, Dest. port: 6000, Comment: Relay2
Direction: IN, Action: ACCEPT, Protocol: tcp, Dest. port: 22, Source: 192.168.150.0/24, Comment: SSH from LAN
Direction: IN, Action: DROP, Comment: Drop all other
```

---

## 4. UniFi Network Configuration

### Step 1: Create Cardano VLAN Network

In UniFi Network Controller:

1. Go to **Settings → Networks**
2. Click **Create New Network**

```
Name: Cardano
Network Type: Standard (VLAN)
VLAN ID: 160
Gateway IP/Subnet: 192.168.160.1/24
Advanced:
  - DHCP Mode: None (we'll use static IPs)
  - IPv6: Disabled
  - Multicast DNS: Disabled
  - IGMP Snooping: Enabled
```

### Step 2: Configure Port Forwarding

In UniFi Network Controller:

1. Go to **Settings → Firewall & Security → Port Forwarding**
2. Create the following rules:

**Relay 1 Port Forward:**
```
Name: Cardano-Relay1
From: Any
Port: 6001
Forward IP: 192.168.160.11
Forward Port: 6000
Protocol: TCP
```

**Relay 2 Port Forward:**
```
Name: Cardano-Relay2
From: Any
Port: 6002
Forward IP: 192.168.160.12
Forward Port: 6000
Protocol: TCP
```

### Step 3: Configure Firewall Rules (Zone-Based)

UniFi uses zone-based firewall. Navigate to **Settings → Firewall & Security → Firewall Rules**

#### Create Traffic Rules:

**Rule 1: Allow LAN to Cardano SSH**
```
Type: LAN In
Name: LAN-to-Cardano-SSH
Action: Allow
Source: 
  Network: Default (LAN)
Destination:
  Network: Cardano
  Port: 22
Protocol: TCP
```

**Rule 2: Block Cardano to LAN**
```
Type: LAN In  
Name: Block-Cardano-to-LAN
Action: Drop
Source:
  Network: Cardano
Destination:
  Network: Default (LAN)
Protocol: All
```

**Rule 3: Allow Cardano Relays Outbound Internet**
```
Type: LAN Out / Internet Out
Name: Cardano-Internet-Out
Action: Allow
Source:
  Network: Cardano
Destination:
  Network: Any
Protocol: TCP/UDP
```

**Rule 4: Block Direct Internet to Block Producer**
```
Type: WAN In
Name: Block-WAN-to-BP
Action: Drop
Destination:
  IP Address: 192.168.160.10
Protocol: All
# Note: This is redundant since only port forwards allow inbound, but explicit is good
```

### Step 4: Create Traffic Rules for Inter-Node Communication

Ensure the Cardano VLAN allows internal communication:

**Rule 5: Allow Cardano Internal**
```
Type: LAN Local
Name: Cardano-Internal
Action: Allow
Source:
  Network: Cardano
Destination:
  Network: Cardano
Protocol: All
```

### Firewall Rule Order (Top to Bottom)

1. Allow LAN to Cardano SSH
2. Block Cardano to LAN  
3. Cardano Internal Allow
4. (Default rules handle the rest)

---

## 5. DNS Configuration

### Dynamic DNS Setup

Since your WAN IP is dynamic, you need DDNS updating. Your current setup updates nacho.builders - extend it:

**Required DNS Records:**

| Hostname | Type | Target | TTL |
|----------|------|--------|-----|
| nacho.builders | A | [WAN IP] | 300 |

### Option A: CNAME to Main Domain

If your main domain already has DDNS:
```
nacho.builders  A  [WAN IP]
# Both relays accessible via nacho.builders on ports 6001 and 6002
```

### Option B: Multiple A Records

Update your DDNS script to create multiple A records pointing to the same IP.

### Verification

After setup, verify DNS resolution:
```bash
dig nacho.builders +short
nc -zv nacho.builders 6001  # Test Relay 1
nc -zv nacho.builders 6002  # Test Relay 2
# Both should return your current WAN IP
```

---

## 6. VM Deployment & OS Hardening

### Ubuntu 22.04 LTS Installation

Install Ubuntu Server 22.04 LTS on each VM with:
- Minimal installation
- OpenSSH server enabled
- No additional snaps

### Initial Setup (All Nodes)

Run on each VM after first boot:

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Set hostname
sudo hostnamectl set-hostname cardano-relay1  # or relay2, bp

# Configure static IP (edit netplan)
sudo nano /etc/netplan/00-installer-config.yaml
```

**Netplan configuration for Relay 1:**
```yaml
network:
  version: 2
  ethernets:
    ens18:  # Your interface name
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

Apply netplan:
```bash
sudo netplan apply
```

### Security Hardening (All Nodes)

Follow the official Cardano hardening guide:

#### 1. Create Cardano User

```bash
# Create non-root user
sudo useradd -m -s /bin/bash cardano
sudo passwd cardano
sudo usermod -aG sudo cardano

# Switch to cardano user for remaining setup
su - cardano
```

#### 2. Disable Root Login

```bash
sudo passwd -l root
```

#### 3. Configure Automatic Security Updates

```bash
sudo apt install unattended-upgrades -y
sudo dpkg-reconfigure -plow unattended-upgrades
```

#### 4. Generate and Configure SSH Keys

**On your local workstation:**
```bash
# Generate key pair
ssh-keygen -t ed25519 -f ~/.ssh/cardano_key

# Copy to each server
ssh-copy-id -i ~/.ssh/cardano_key cardano@192.168.160.11
ssh-copy-id -i ~/.ssh/cardano_key cardano@192.168.160.12
ssh-copy-id -i ~/.ssh/cardano_key cardano@192.168.160.10
```

#### 5. Harden SSH Configuration

On each node, edit `/etc/ssh/sshd_config`:

```bash
sudo nano /etc/ssh/sshd_config
```

Set these values:
```
Port 22  # Consider changing to non-standard port
PubkeyAuthentication yes
PasswordAuthentication no
PermitRootLogin prohibit-password
PermitEmptyPasswords no
X11Forwarding no
TCPKeepAlive no
Compression no
AllowAgentForwarding no
AllowTcpForwarding no
KbdInteractiveAuthentication no
AllowUsers cardano
```

Restart SSH:
```bash
sudo sshd -t  # Test config
sudo systemctl restart sshd
```

#### 6. Configure UFW Firewall

**On Relay Nodes:**
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.150.0/24 to any port 22 proto tcp  # SSH from LAN
sudo ufw allow from 192.168.2.0/24 to any port 22 proto tcp    # SSH from VPN
sudo ufw allow 6000/tcp  # Cardano node port
sudo ufw enable
```

**On Block Producer:**
```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow from 192.168.150.0/24 to any port 22 proto tcp  # SSH from LAN
sudo ufw allow from 192.168.2.0/24 to any port 22 proto tcp    # SSH from VPN
sudo ufw allow from 192.168.160.11 to any port 6000 proto tcp  # Relay 1
sudo ufw allow from 192.168.160.12 to any port 6000 proto tcp  # Relay 2
sudo ufw enable
```

#### 7. Install and Configure Fail2ban

```bash
sudo apt install fail2ban -y
sudo systemctl enable fail2ban
sudo systemctl start fail2ban

# Create jail configuration
sudo cp /etc/fail2ban/jail.conf /etc/fail2ban/jail.local
sudo nano /etc/fail2ban/jail.local
```

Add to `[DEFAULT]` section:
```ini
bantime = 1h
bantime.increment = true
bantime.factor = 2
bantime.maxtime = 5w
findtime = 10m
maxretry = 3
```

Add `[sshd]` section:
```ini
[sshd]
enabled = true
mode = aggressive
port = 22
filter = sshd
maxretry = 3
logpath = /var/log/auth.log
```

Restart:
```bash
sudo systemctl restart fail2ban
```

#### 8. Kernel Hardening

```bash
sudo nano /etc/sysctl.conf
```

Add:
```
# Prevent smurf attacks
net.ipv4.icmp_echo_ignore_broadcasts = 1

# Protect against bad ICMP messages
net.ipv4.icmp_ignore_bogus_error_responses = 1

# Enable SYN flood protection
net.ipv4.tcp_syncookies = 1

# Log suspicious packets
net.ipv4.conf.all.log_martians = 1
net.ipv4.conf.default.log_martians = 1

# Disable source routing
net.ipv4.conf.all.accept_source_route = 0
net.ipv4.conf.default.accept_source_route = 0

# Disable redirects
net.ipv4.conf.all.accept_redirects = 0
net.ipv4.conf.default.accept_redirects = 0
net.ipv4.conf.all.secure_redirects = 0

# Disable packet forwarding
net.ipv4.ip_forward = 0

# SYN flood protection
net.ipv4.tcp_synack_retries = 5
```

Apply:
```bash
sudo sysctl -p
```

#### 9. Shared Memory Hardening

```bash
sudo nano /etc/fstab
```

Add:
```
tmpfs /run/shm tmpfs ro,noexec,nosuid 0 0
```

Reboot:
```bash
sudo reboot
```

#### 10. Configure NTP (Critical for Stake Pools!)

```bash
sudo apt install chrony -y
sudo nano /etc/chrony/chrony.conf
```

Ensure you have good NTP sources:
```
server time.google.com iburst
server time.cloudflare.com iburst
server time.nist.gov iburst
```

Enable and check:
```bash
sudo systemctl enable chrony
sudo systemctl start chrony
chronyc tracking  # Should show synchronized
```

---

## 7. Guild Operators Installation

### Prerequisites Installation

Run on each node as the `cardano` user:

```bash
# Switch to cardano user
su - cardano
cd ~

# Create temp directory and download prerequisites script
mkdir -p "$HOME/tmp"
cd "$HOME/tmp"

# Download guild-deploy script
curl -sS -o guild-deploy.sh https://raw.githubusercontent.com/cardano-community/guild-operators/master/scripts/cnode-helper-scripts/guild-deploy.sh
chmod 755 guild-deploy.sh

# View help to understand options
./guild-deploy.sh -h
```

### Relay Node Installation

**On Relay 1 and Relay 2:**

```bash
# Full installation with pre-built binaries for mainnet
./guild-deploy.sh -b master -n mainnet -t cnode -s pdlcowx

# Options explained:
# -b master  : Use master branch
# -n mainnet : Mainnet network
# -t cnode   : Install as cnode
# -s pdlcowx : Install components:
#   p = Install pre-compiled cardano-node/cli binaries
#   d = Install dependencies
#   l = Install cncli
#   c = Install CNTools scripts
#   o = Install ogmios (optional, remove if not needed)
#   w = Overwrite existing files
#   x = Download configs/scripts only, no systemd setup
```

After installation:
```bash
# Add CNODE_HOME to bashrc (for convenience)
echo 'export CNODE_HOME=/opt/cardano/cnode' >> ~/.bashrc
source ~/.bashrc
```

### Block Producer Installation

**On Block Producer:**

```bash
# Same installation
./guild-deploy.sh -b master -n mainnet -t cnode -s pdlcwx

# Note: No 'o' for ogmios on BP typically
```

### Post-Installation Configuration

#### Configure Environment (All Nodes)

Edit the env file:
```bash
nano $CNODE_HOME/scripts/env
```

Set:
```bash
CNODE_PORT=6000
POOL_NAME="NACHO"  # Your pool ticker (for BP only, relays ignore this)
```

#### Configure Topology - Relay 1

Edit `$CNODE_HOME/files/topology.json`:

```json
{
  "bootstrapPeers": [
    { "address": "backbone.cardano.iog.io", "port": 3001 },
    { "address": "backbone.mainnet.emurgornd.com", "port": 3001 },
    { "address": "backbone.mainnet.cardanofoundation.org", "port": 3001 }
  ],
  "localRoots": [
    {
      "accessPoints": [
        { "address": "192.168.160.10", "port": 6000, "description": "Block Producer" },
        { "address": "192.168.160.12", "port": 6000, "description": "Relay2" }
      ],
      "advertise": false,
      "trustable": true,
      "hotValency": 2
    }
  ],
  "publicRoots": [
    {
      "accessPoints": [],
      "advertise": false
    }
  ],
  "useLedgerAfterSlot": 128908821
}
```

#### Configure Topology - Relay 2

Edit `$CNODE_HOME/files/topology.json`:

```json
{
  "bootstrapPeers": [
    { "address": "backbone.cardano.iog.io", "port": 3001 },
    { "address": "backbone.mainnet.emurgornd.com", "port": 3001 },
    { "address": "backbone.mainnet.cardanofoundation.org", "port": 3001 }
  ],
  "localRoots": [
    {
      "accessPoints": [
        { "address": "192.168.160.10", "port": 6000, "description": "Block Producer" },
        { "address": "192.168.160.11", "port": 6000, "description": "Relay1" }
      ],
      "advertise": false,
      "trustable": true,
      "hotValency": 2
    }
  ],
  "publicRoots": [
    {
      "accessPoints": [],
      "advertise": false
    }
  ],
  "useLedgerAfterSlot": 128908821
}
```

#### Configure Topology - Block Producer

Edit `$CNODE_HOME/files/topology.json`:

```json
{
  "bootstrapPeers": [],
  "localRoots": [
    {
      "accessPoints": [
        { "address": "192.168.160.11", "port": 6000, "description": "Relay1" },
        { "address": "192.168.160.12", "port": 6000, "description": "Relay2" }
      ],
      "advertise": false,
      "trustable": true,
      "hotValency": 2
    }
  ],
  "publicRoots": [
    {
      "accessPoints": [],
      "advertise": false
    }
  ],
  "useLedgerAfterSlot": -1
}
```

**Important BP Settings:**
- `bootstrapPeers`: Empty array (BP never connects to public nodes)
- `useLedgerAfterSlot`: Set to `-1` (disables P2P ledger peers)
- Only connects to your own relays

#### Configure Node Settings (All Nodes)

Edit `$CNODE_HOME/files/config.json`:

For Block Producer, ensure:
```json
"PeerSharing": false
```

For Relays, optionally enable:
```json
"PeerSharing": true
```

### Using Mithril for Fast Sync (Recommended)

Instead of waiting days to sync from scratch, use Mithril to bootstrap:

```bash
# Edit cnode.sh to enable Mithril
nano $CNODE_HOME/scripts/cnode.sh
```

Find and set:
```bash
MITHRIL_DOWNLOAD="Y"
```

Or manually download snapshot:
```bash
cd $CNODE_HOME/scripts
./mithril-client.sh download
```

### Start Nodes

#### Test Interactive Start (First Time)

```bash
cd $CNODE_HOME/scripts
./cnode.sh
```

Watch for errors. If running okay for a few minutes, Ctrl+C to stop.

#### Deploy as systemd Service

```bash
cd $CNODE_HOME/scripts
./deploy-as-systemd.sh
```

Enable and start:
```bash
sudo systemctl enable cnode
sudo systemctl start cnode
```

Check status:
```bash
sudo systemctl status cnode
```

### Monitor with gLiveView

```bash
cd $CNODE_HOME/scripts
./gLiveView.sh
```

Key metrics to watch:
- **Tip**: Should be close to network tip
- **In/Out Peers**: Should show connections
- **Epoch/Slot**: Current position
- **Mem/CPU**: Resource usage

---

## 8. Pool Registration & Key Management

### Air-Gapped Machine Setup

**CRITICAL: Pool keys should NEVER touch an internet-connected machine.**

Options for air-gapped environment:
1. **Old laptop** with WiFi/Bluetooth hardware disabled, network ports blocked
2. **Raspberry Pi** kept offline
3. **Live USB** (Tails or Ubuntu) on dedicated machine

### Key Generation (Air-Gapped Only)

On your air-gapped machine, install cardano-cli and generate:

```bash
# Create directories
mkdir -p ~/cold-keys
cd ~/cold-keys

# Generate cold keys (stake pool keys)
cardano-cli node key-gen \
  --cold-verification-key-file cold.vkey \
  --cold-signing-key-file cold.skey \
  --operational-certificate-issue-counter-file cold.counter

# Generate VRF keys
cardano-cli node key-gen-VRF \
  --verification-key-file vrf.vkey \
  --signing-key-file vrf.skey

# Generate KES keys
cardano-cli node key-gen-KES \
  --verification-key-file kes.vkey \
  --signing-key-file kes.skey

# Generate stake address keys
cardano-cli stake-address key-gen \
  --verification-key-file stake.vkey \
  --signing-key-file stake.skey

# Generate payment address keys  
cardano-cli address key-gen \
  --verification-key-file payment.vkey \
  --signing-key-file payment.skey
```

### Files That Go Where

| File | Location | Notes |
|------|----------|-------|
| `cold.skey` | **Air-gapped ONLY** | Never on network |
| `cold.vkey` | Air-gapped + can copy to BP | For cert generation |
| `cold.counter` | **Air-gapped ONLY** | Never on network |
| `vrf.skey` | Block Producer | Required for block production |
| `vrf.vkey` | Air-gapped + BP | Registration |
| `kes.skey` | Block Producer | **Rotate every 90 days** |
| `kes.vkey` | Air-gapped + BP | For op cert generation |
| `stake.skey` | **Air-gapped ONLY** | Never on network |
| `stake.vkey` | Air-gapped + BP | For registration |
| `payment.skey` | **Air-gapped ONLY** | Wallet key |
| `payment.vkey` | Can be on BP | For generating addresses |

### Transfer Hot Keys to Block Producer

Using USB drive, transfer ONLY these files to BP:
- `vrf.skey`
- `vrf.vkey`
- `kes.skey`
- `kes.vkey`

Place in `$CNODE_HOME/priv/pool/$POOL_NAME/`:
```bash
mkdir -p $CNODE_HOME/priv/pool/NACHO
# Copy files here
chmod 400 $CNODE_HOME/priv/pool/NACHO/*.skey
```

### Pool Registration Process

This is done using CNTools on the Block Producer (with transactions built and signed partially there, then fully signed on air-gapped).

```bash
cd $CNODE_HOME/scripts
./cntools.sh
```

Follow the CNTools menu:
1. Wallet → New → Create wallet for pledge
2. Pool → New → Create pool
3. Pool → Register → Register on chain

The registration requires:
- Pool pledge (ADA you're committing)
- ~500 ADA registration deposit
- Pool metadata JSON (hosted at a URL)
- Relay information (your DNS names)

### Pool Metadata

Create a JSON file and host it (can use GitHub, your website, etc.):

```json
{
  "name": "Nacho Stake Pool",
  "description": "Professional stake pool operated by nacho.builders",
  "ticker": "NACHO",
  "homepage": "https://nacho.builders",
  "extended": "https://nacho.builders/pool-extended.json"
}
```

Host at: `https://nacho.builders/poolMetaData.json`

---

## 9. Monitoring & Maintenance

### gLiveView (Local Monitoring)

Already covered - use `./gLiveView.sh` for real-time node status.

### Prometheus + Grafana (Optional but Recommended)

Guild Operators includes monitoring setup:

```bash
# Deploy monitoring stack
cd $CNODE_HOME/scripts
./deploy-as-systemd.sh  # Includes prometheus export
```

Prometheus metrics are exposed on port 12798 by default.

### Key Rotation Schedule

| Key Type | Rotation Frequency | Process |
|----------|-------------------|---------|
| KES Keys | Every 90 days (~62 epochs) | Generate new on air-gapped, create new op.cert |
| Op Cert | With each KES rotation | Sign on air-gapped with cold.skey |
| Cold Keys | Never (unless compromised) | Keep secure forever |

### KES Key Rotation Process

When gLiveView shows KES expiry approaching:

1. **On Air-Gapped Machine:**
```bash
# Generate new KES keys
cardano-cli node key-gen-KES \
  --verification-key-file kes_new.vkey \
  --signing-key-file kes_new.skey

# Increment counter and generate new operational certificate
cardano-cli node issue-op-cert \
  --kes-verification-key-file kes_new.vkey \
  --cold-signing-key-file cold.skey \
  --operational-certificate-issue-counter cold.counter \
  --kes-period <CURRENT_KES_PERIOD> \
  --out-file op_new.cert
```

2. **Transfer to Block Producer:**
- Copy `kes_new.skey` and `op_new.cert` via USB
- Replace old files in `$CNODE_HOME/priv/pool/NACHO/`

3. **Restart Block Producer:**
```bash
sudo systemctl restart cnode
```

### Backup Strategy

**Critical files to backup (encrypted, multiple locations):**
- All cold keys (`cold.skey`, `cold.counter`)
- Stake keys (`stake.skey`)
- Payment keys (`payment.skey`)
- Pool registration transaction

**Backup locations:**
- Hardware wallet backup (if using)
- Encrypted USB drives (multiple)
- Encrypted cloud storage (optional)

---

## 10. Security Checklist

### Network Security
- [ ] Block Producer not directly accessible from internet
- [ ] Port forwards only for relay nodes
- [ ] VLAN isolation configured
- [ ] Firewall rules reviewed and tested
- [ ] SSH keys only (no passwords)
- [ ] Non-standard SSH port (optional)
- [ ] Fail2ban active

### Server Security
- [ ] Automatic security updates enabled
- [ ] Root account disabled
- [ ] Dedicated cardano user
- [ ] UFW configured on each node
- [ ] Kernel hardening applied
- [ ] NTP synchronized (chrony)

### Key Security
- [ ] Cold keys NEVER on networked machine
- [ ] Air-gapped machine set up
- [ ] Keys backed up securely
- [ ] KES rotation scheduled

### Operational Security
- [ ] Monitoring configured
- [ ] Alerting for node downtime
- [ ] Regular topology updates
- [ ] Pool metadata hosted securely

---

## 11. Appendix: Command Reference

### Useful Commands

**Check node sync status:**
```bash
cardano-cli query tip --mainnet
```

**Check pool status:**
```bash
cardano-cli query pool-params --stake-pool-id <POOL_ID> --mainnet
```

**View peer connections:**
```bash
cd $CNODE_HOME/scripts && ./gLiveView.sh
# Press 'p' for peer analysis
```

**Check systemd service:**
```bash
sudo systemctl status cnode
sudo journalctl -u cnode -f  # Follow logs
```

**Restart node:**
```bash
sudo systemctl restart cnode
```

**Check KES period:**
```bash
cardano-cli query kes-period-info --mainnet --op-cert-file $CNODE_HOME/priv/pool/NACHO/op.cert
```

### Emergency Procedures

**Node not syncing:**
1. Check internet connectivity
2. Verify topology file
3. Check firewall rules
4. Review logs: `journalctl -u cnode -n 100`

**Missed blocks:**
1. Check time sync: `chronyc tracking`
2. Verify KES key not expired
3. Check network latency to relays
4. Review peer connectivity

**Pool not producing blocks:**
1. Verify op.cert and KES keys in correct location
2. Check permissions on key files
3. Confirm pool is registered and active
4. Verify pledge is met

---

## Implementation Order

1. **Week 1: Infrastructure**
   - Create VLAN 160 in UniFi
   - Configure Proxmox VLAN-aware bridge
   - Create 3 VMs (don't start OS install yet)
   - Set up port forwarding rules
   - Configure DNS records

2. **Week 2: VM Setup**
   - Install Ubuntu 22.04 on all VMs
   - Configure static IPs
   - Complete all hardening steps
   - Verify inter-node connectivity
   - Verify external connectivity (relays only)

3. **Week 3: Cardano Deployment**
   - Install Guild Operators on all nodes
   - Configure topology files
   - Use Mithril for initial sync
   - Verify all nodes synced
   - Test gLiveView on each

4. **Week 4: Pool Registration**
   - Set up air-gapped machine
   - Generate all keys
   - Create pool metadata
   - Register stake address
   - Register pool

5. **Ongoing**
   - Monitor pool performance
   - Rotate KES keys as needed
   - Keep nodes updated
   - Engage with delegators

---

**Questions?** The Cardano SPO Telegram group is helpful: https://t.me/CardanoStakePoolWorkgroup
