# UniFi Network Configuration Guide
## Cardano Stake Pool Infrastructure - nacho.builders

This guide covers complete UniFi Dream Router 7 configuration for hosting a Cardano stake pool with proper network isolation and security.

---

## Table of Contents

1. [Network Overview](#1-network-overview)
2. [Prerequisites](#2-prerequisites)
3. [Create Cardano VLAN Network](#3-create-cardano-vlan-network)
4. [Configure Port Forwarding](#4-configure-port-forwarding)
5. [Firewall Rules Configuration](#5-firewall-rules-configuration)
6. [Traffic Rules Summary](#6-traffic-rules-summary)
7. [Verification & Testing](#7-verification--testing)
8. [Troubleshooting](#8-troubleshooting)

---

## 1. Network Overview

### Current Network Layout

| Network | Subnet | VLAN | Purpose |
|---------|--------|------|---------|
| Default LAN | 192.168.150.0/24 | 1 (untagged) | Main network, Proxmox host |
| VPN | 192.168.2.0/24 | — | Remote management access |
| **Cardano (NEW)** | **192.168.160.0/24** | **160** | Stake pool nodes |

### Cardano Infrastructure IPs

| Node | IP Address | Role | Internet Exposure |
|------|------------|------|-------------------|
| Block Producer | 192.168.160.10 | Creates blocks | **NO** - Internal only |
| Relay 1 | 192.168.160.11 | Public relay | YES - Port 6001 |
| Relay 2 | 192.168.160.12 | Public relay | YES - Port 6002 |

### Traffic Flow Diagram

```
INTERNET
    │
    │ Port 6001 ──────────────────────┐
    │ Port 6002 ────────────────────┐ │
    │                               │ │
    ▼                               ▼ ▼
┌─────────────────────────────────────────────────────┐
│                  UniFi DR7                          │
│              192.168.150.1 (LAN)                    │
│              192.168.160.1 (Cardano VLAN)           │
│                                                     │
│  WAN ──► NAT ──► Port Forward Rules                 │
│                   6001 → 192.168.160.11:6000        │
│                   6002 → 192.168.160.12:6000        │
└─────────────────────────────────────────────────────┘
         │                    │
         │ VLAN 1             │ VLAN 160
         │ (untagged)         │ (tagged)
         ▼                    ▼
    ┌─────────┐         ┌─────────────────────────────┐
    │ Proxmox │         │     Cardano VLAN 160        │
    │  Host   │         │                             │
    │ .150.222│         │  ┌────────┐  ┌────────┐    │
    └─────────┘         │  │Relay 1 │  │Relay 2 │    │
         │              │  │.160.11 │  │.160.12 │    │
         │              │  └────┬───┘  └───┬────┘    │
    ┌────▼────┐         │       │          │         │
    │   VPN   │         │       └────┬─────┘         │
    │Clients  │         │            │               │
    │.2.0/24  │         │       ┌────▼────┐          │
    └─────────┘         │       │  Block  │          │
                        │       │Producer │          │
                        │       │.160.10  │          │
                        │       └─────────┘          │
                        └─────────────────────────────┘
```

---

## 2. Prerequisites

Before starting, ensure you have:

- [ ] Admin access to UniFi Network Controller
- [ ] UniFi OS 4.3.9+ (your current version)
- [ ] Network Controller 10.0.162+ (your current version)
- [ ] Understanding that changes may briefly disrupt network connectivity
- [ ] SSH access to UniFi DR7 (optional, for advanced troubleshooting)

### Access UniFi Controller

1. Navigate to https://192.168.150.1 or use the UniFi app
2. Log in with admin credentials
3. Go to **Settings** (gear icon)

---

## 3. Create Cardano VLAN Network

### Step 3.1: Navigate to Networks

1. In UniFi Controller, go to **Settings** → **Networks**
2. Click **Create New Network**

### Step 3.2: Configure Network Settings

Fill in the following settings:

```
┌─────────────────────────────────────────────────────────────┐
│                    CREATE NEW NETWORK                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Network Name:        Cardano                                │
│                                                              │
│  ─── Network Type ───                                        │
│  ○ Standard           ● VLAN Only                            │
│                       └── Select this if you want            │
│                           isolation without DHCP             │
│                                                              │
│  OR if using Standard:                                       │
│  ● Standard                                                  │
│                                                              │
│  ─── VLAN ───                                                │
│  VLAN ID:             160                                    │
│                                                              │
│  ─── Gateway/Subnet ───                                      │
│  Gateway IP:          192.168.160.1                          │
│  Netmask:             24  (255.255.255.0)                    │
│                                                              │
│  ─── DHCP ───                                                │
│  DHCP Mode:           None                                   │
│  (We use static IPs for infrastructure)                      │
│                                                              │
│  ─── Advanced ─── (expand this section)                      │
│                                                              │
│  Multicast DNS:       ☐ Disabled                             │
│  IGMP Snooping:       ☑ Enabled                              │
│  IPv6:                ○ Disabled                             │
│  Network Isolation:   ☐ Disabled                             │
│  (We'll use firewall rules instead for granular control)     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

### Step 3.3: Save Network

Click **Create** or **Save** to create the network.

### Step 3.4: Verify Network Creation

After saving, you should see:
- New network "Cardano" in the networks list
- VLAN ID 160 assigned
- Gateway 192.168.160.1

The UniFi DR7 will now:
- Act as the gateway for 192.168.160.0/24
- Route traffic between VLANs (subject to firewall rules)
- Tag traffic on VLAN 160

---

## 4. Configure Port Forwarding

Port forwarding allows external Cardano network peers to connect to your relay nodes.

### Step 4.1: Navigate to Port Forwarding

1. Go to **Settings** → **Firewall & Security**
2. Select **Port Forwarding** tab

### Step 4.2: Create Relay 1 Port Forward

Click **Create New Port Forwarding Rule**:

```
┌─────────────────────────────────────────────────────────────┐
│               PORT FORWARDING RULE #1                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Name:                Cardano-Relay1                         │
│                                                              │
│  ─── From (Source) ───                                       │
│  From:                Any                                    │
│  (Allow connections from any internet IP)                    │
│                                                              │
│  ─── Port ───                                                │
│  Port:                6001                                   │
│  (External port seen by internet)                            │
│                                                              │
│  ─── Forward To (Destination) ───                            │
│  Forward IP:          192.168.160.11                         │
│  Forward Port:        6000                                   │
│  (Internal Cardano node port)                                │
│                                                              │
│  ─── Protocol ───                                            │
│  Protocol:            TCP                                    │
│                                                              │
│  ─── Logging ───                                             │
│  Enable Logging:      ☐ (Optional - can enable for debug)    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Click **Save**.

### Step 4.3: Create Relay 2 Port Forward

Click **Create New Port Forwarding Rule**:

```
┌─────────────────────────────────────────────────────────────┐
│               PORT FORWARDING RULE #2                        │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Name:                Cardano-Relay2                         │
│                                                              │
│  From:                Any                                    │
│  Port:                6002                                   │
│  Forward IP:          192.168.160.12                         │
│  Forward Port:        6000                                   │
│  Protocol:            TCP                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Click **Save**.

### Step 4.4: Verify Port Forwards

You should now see two port forwarding rules:

| Name | WAN Port | Forward IP | Forward Port | Protocol |
|------|----------|------------|--------------|----------|
| Cardano-Relay1 | 6001 | 192.168.160.11 | 6000 | TCP |
| Cardano-Relay2 | 6002 | 192.168.160.12 | 6000 | TCP |

### Important Notes on Port Forwarding

1. **No rule for Block Producer**: The BP should NEVER have a port forward
2. **Different external ports**: Using 6001/6002 allows both relays on same WAN IP
3. **TCP only**: Cardano uses TCP for node communication
4. **Source "Any"**: Required for public relay operation

---

## 5. Firewall Rules Configuration

UniFi uses a zone-based firewall. We need rules to:
1. Allow management access from LAN and VPN to Cardano VLAN
2. Block Cardano VLAN from accessing LAN (isolation)
3. Allow Cardano nodes to reach the internet (outbound)
4. Allow internal Cardano node communication

### Step 5.1: Navigate to Firewall Rules

1. Go to **Settings** → **Firewall & Security**
2. Select **Firewall Rules** tab

### Understanding UniFi Firewall Zones

| Zone | Description |
|------|-------------|
| **LAN In** | Traffic entering from LAN networks |
| **LAN Out** | Traffic leaving to LAN networks |
| **LAN Local** | Traffic destined to the router itself |
| **Internet In** | Traffic from internet (WAN) |
| **Internet Out** | Traffic going to internet |
| **Internet Local** | Internet traffic to router |

### Step 5.2: Create Firewall Rules

Create the following rules in order (order matters!):

---

#### Rule 1: Allow LAN to Cardano SSH

**Purpose**: Allow SSH management from your main LAN to Cardano nodes.

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREWALL RULE #1                          │
├─────────────────────────────────────────────────────────────┤
│  Type:                LAN In                                 │
│  Description:         LAN-to-Cardano-SSH                     │
│  Rule Applied:        Before Predefined Rules                │
│                                                              │
│  Action:              Accept                                 │
│                                                              │
│  ─── Source ───                                              │
│  Source Type:         Network                                │
│  Network:             Default (192.168.150.0/24)             │
│                                                              │
│  ─── Destination ───                                         │
│  Destination Type:    Network                                │
│  Network:             Cardano (192.168.160.0/24)             │
│                                                              │
│  ─── Port & Protocol ───                                     │
│  Protocol:            TCP                                    │
│  Port:                22                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

#### Rule 2: Allow VPN to Cardano SSH

**Purpose**: Allow SSH management from VPN clients to Cardano nodes.

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREWALL RULE #2                          │
├─────────────────────────────────────────────────────────────┤
│  Type:                LAN In                                 │
│  Description:         VPN-to-Cardano-SSH                     │
│  Rule Applied:        Before Predefined Rules                │
│                                                              │
│  Action:              Accept                                 │
│                                                              │
│  ─── Source ───                                              │
│  Source Type:         IP Address                             │
│  IPv4 Address:        192.168.2.0/24                         │
│  (Your VPN subnet)                                           │
│                                                              │
│  ─── Destination ───                                         │
│  Destination Type:    Network                                │
│  Network:             Cardano                                │
│                                                              │
│  ─── Port & Protocol ───                                     │
│  Protocol:            TCP                                    │
│  Port:                22                                     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Note**: If your VPN is configured as a UniFi network, select it as Network instead of IP Address.

---

#### Rule 3: Allow VPN to Cardano Monitoring (Optional)

**Purpose**: If you want to access Prometheus/Grafana metrics from VPN.

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREWALL RULE #3                          │
├─────────────────────────────────────────────────────────────┤
│  Type:                LAN In                                 │
│  Description:         VPN-to-Cardano-Monitoring              │
│  Rule Applied:        Before Predefined Rules                │
│                                                              │
│  Action:              Accept                                 │
│                                                              │
│  ─── Source ───                                              │
│  Source Type:         IP Address                             │
│  IPv4 Address:        192.168.2.0/24                         │
│                                                              │
│  ─── Destination ───                                         │
│  Destination Type:    Network                                │
│  Network:             Cardano                                │
│                                                              │
│  ─── Port & Protocol ───                                     │
│  Protocol:            TCP                                    │
│  Port:                12798,3000,9090                        │
│  (Prometheus exporter, Grafana, Prometheus server)           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

#### Rule 4: Allow LAN to Cardano Monitoring (Optional)

**Purpose**: Same as above but from LAN.

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREWALL RULE #4                          │
├─────────────────────────────────────────────────────────────┤
│  Type:                LAN In                                 │
│  Description:         LAN-to-Cardano-Monitoring              │
│  Action:              Accept                                 │
│  Source Network:      Default                                │
│  Destination Network: Cardano                                │
│  Protocol:            TCP                                    │
│  Port:                12798,3000,9090                        │
└─────────────────────────────────────────────────────────────┘
```

---

#### Rule 5: Block Cardano to LAN

**Purpose**: Prevent Cardano nodes from initiating connections to your main LAN. This is a security isolation measure.

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREWALL RULE #5                          │
├─────────────────────────────────────────────────────────────┤
│  Type:                LAN In                                 │
│  Description:         Block-Cardano-to-LAN                   │
│  Rule Applied:        Before Predefined Rules                │
│                                                              │
│  Action:              Drop                                   │
│                                                              │
│  ─── Source ───                                              │
│  Source Type:         Network                                │
│  Network:             Cardano                                │
│                                                              │
│  ─── Destination ───                                         │
│  Destination Type:    Network                                │
│  Network:             Default                                │
│                                                              │
│  ─── Port & Protocol ───                                     │
│  Protocol:            All                                    │
│                                                              │
│  ─── Logging ───                                             │
│  Enable Logging:      ☑ Yes (recommended for security)       │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

#### Rule 6: Block Cardano to VPN

**Purpose**: Prevent Cardano nodes from reaching VPN clients.

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREWALL RULE #6                          │
├─────────────────────────────────────────────────────────────┤
│  Type:                LAN In                                 │
│  Description:         Block-Cardano-to-VPN                   │
│  Action:              Drop                                   │
│  Source Network:      Cardano                                │
│  Destination:         IP Address 192.168.2.0/24              │
│  Protocol:            All                                    │
│  Enable Logging:      ☑ Yes                                  │
└─────────────────────────────────────────────────────────────┘
```

---

#### Rule 7: Allow Cardano Internal Communication

**Purpose**: Allow nodes within the Cardano VLAN to communicate with each other.

```
┌─────────────────────────────────────────────────────────────┐
│                    FIREWALL RULE #7                          │
├─────────────────────────────────────────────────────────────┤
│  Type:                LAN Local                              │
│  Description:         Cardano-Internal-Allow                 │
│  Rule Applied:        Before Predefined Rules                │
│                                                              │
│  Action:              Accept                                 │
│                                                              │
│  ─── Source ───                                              │
│  Source Type:         Network                                │
│  Network:             Cardano                                │
│                                                              │
│  ─── Destination ───                                         │
│  Destination Type:    Network                                │
│  Network:             Cardano                                │
│                                                              │
│  ─── Port & Protocol ───                                     │
│  Protocol:            All                                    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

### Step 5.3: Verify Rule Order

After creating all rules, verify they appear in this order:

| # | Name | Action | Source | Destination | Port |
|---|------|--------|--------|-------------|------|
| 1 | LAN-to-Cardano-SSH | Accept | Default | Cardano | 22 |
| 2 | VPN-to-Cardano-SSH | Accept | 192.168.2.0/24 | Cardano | 22 |
| 3 | VPN-to-Cardano-Monitoring | Accept | 192.168.2.0/24 | Cardano | 12798,3000,9090 |
| 4 | LAN-to-Cardano-Monitoring | Accept | Default | Cardano | 12798,3000,9090 |
| 5 | Block-Cardano-to-LAN | Drop | Cardano | Default | All |
| 6 | Block-Cardano-to-VPN | Drop | Cardano | 192.168.2.0/24 | All |
| 7 | Cardano-Internal-Allow | Accept | Cardano | Cardano | All |

**Rule order is critical!** Allow rules must come before block rules.

---

## 6. Traffic Rules Summary

### Final Traffic Matrix

| Source | Destination | Ports | Action | Rule |
|--------|-------------|-------|--------|------|
| Internet | Relay1 (via NAT) | 6001→6000 | ✅ Allow | Port Forward |
| Internet | Relay2 (via NAT) | 6002→6000 | ✅ Allow | Port Forward |
| Internet | Block Producer | Any | ❌ Block | No port forward |
| LAN (150.x) | Cardano VLAN | 22 | ✅ Allow | Rule 1 |
| LAN (150.x) | Cardano VLAN | 12798,3000,9090 | ✅ Allow | Rule 4 |
| VPN (2.x) | Cardano VLAN | 22 | ✅ Allow | Rule 2 |
| VPN (2.x) | Cardano VLAN | 12798,3000,9090 | ✅ Allow | Rule 3 |
| Cardano VLAN | LAN | Any | ❌ Block | Rule 5 |
| Cardano VLAN | VPN | Any | ❌ Block | Rule 6 |
| Cardano VLAN | Internet | Any | ✅ Allow | Default |
| Cardano VLAN | Cardano VLAN | Any | ✅ Allow | Rule 7 |

### What This Achieves

1. **Relay accessibility**: Internet peers can reach your relays
2. **Block Producer isolation**: BP only reachable from own relays
3. **Management access**: You can SSH from LAN or VPN
4. **Network isolation**: Compromised Cardano node can't pivot to LAN
5. **Outbound allowed**: Nodes can sync blockchain and reach NTP servers

---

## 7. Verification & Testing

### Test 1: Verify VLAN Creation

```bash
# From UniFi Controller, check Networks list
# Cardano network should show:
#   - VLAN ID: 160
#   - Gateway: 192.168.160.1
#   - Subnet: 192.168.160.0/24
```

### Test 2: Verify Port Forwards (After VMs are Running)

From an external network (not your LAN), test connectivity:

```bash
# Test from external host or use online port checker
nc -zv nacho.builders 6001
nc -zv nacho.builders 6002

# Or use: https://www.yougetsignal.com/tools/open-ports/
```

### Test 3: Verify Internal Connectivity

From a Cardano node:

```bash
# Test connectivity to other nodes
ping 192.168.160.10  # BP
ping 192.168.160.11  # Relay1
ping 192.168.160.12  # Relay2

# Test connectivity to gateway
ping 192.168.160.1
```

### Test 4: Verify Management Access

```bash
# From LAN (192.168.150.x)
ssh cardano@192.168.160.10
ssh cardano@192.168.160.11
ssh cardano@192.168.160.12

# From VPN (192.168.2.x)
ssh cardano@192.168.160.10
ssh cardano@192.168.160.11
ssh cardano@192.168.160.12
```

### Test 5: Verify Isolation (Should FAIL)

From a Cardano node, these should NOT work:

```bash
# From any Cardano node, try to reach LAN
ping 192.168.150.222  # Should fail (blocked)
ping 192.168.150.1    # Gateway might respond (that's okay)

# Try to reach VPN subnet
ping 192.168.2.1      # Should fail
```

### Test 6: Verify Internet Access

From a Cardano node:

```bash
# Should work
ping 1.1.1.1
ping google.com
curl -I https://github.com
```

---

## 8. Troubleshooting

### Issue: VMs Can't Get Network Connectivity

**Check:**
1. Proxmox VLAN tag is set to 160 on VM network interface
2. Proxmox bridge has `bridge-vlan-aware yes`
3. Physical connection to switch supports VLAN tagging

**Fix:**
```bash
# On Proxmox, verify VLAN awareness
cat /etc/network/interfaces | grep -A5 vmbr0
```

### Issue: Can't SSH to Cardano Nodes

**Check:**
1. Firewall rules are in correct order
2. Source network/IP is correct in rules
3. UFW on the VM is allowing SSH

**Debug:**
```bash
# On UniFi, check firewall logs
# Settings → Firewall & Security → Firewall Rules
# Enable logging on rules temporarily
```

### Issue: Port Forwards Not Working

**Check:**
1. VM is running and listening on port 6000
2. UFW on VM allows port 6000
3. Port forward destination IP is correct
4. No ISP blocking of ports 6001/6002

**Test:**
```bash
# On the relay VM
sudo ss -tlnp | grep 6000

# Should show cardano-node listening
```

### Issue: Cardano Nodes Can't Sync

**Check:**
1. Internet access from Cardano VLAN is working
2. DNS resolution is working
3. No outbound firewall blocking

**Test:**
```bash
# From Cardano node
curl -I https://backbone.cardano.iog.io:3001
```

### Issue: Block Producer Can't Connect to Relays

**Check:**
1. Topology file has correct relay IPs
2. Internal firewall (UFW) allows connections
3. Both nodes are running

**Test:**
```bash
# From BP
nc -zv 192.168.160.11 6000
nc -zv 192.168.160.12 6000
```

---

## Quick Reference Card

### Networks
| Name | VLAN | Subnet | Gateway |
|------|------|--------|---------|
| Default | 1 | 192.168.150.0/24 | 192.168.150.1 |
| VPN | — | 192.168.2.0/24 | — |
| Cardano | 160 | 192.168.160.0/24 | 192.168.160.1 |

### Port Forwards
| External | Internal | Destination |
|----------|----------|-------------|
| 6001/TCP | 6000/TCP | 192.168.160.11 |
| 6002/TCP | 6000/TCP | 192.168.160.12 |

### Management Access
| From | To | Ports |
|------|-----|-------|
| 192.168.150.0/24 | 192.168.160.0/24 | 22, 12798, 3000, 9090 |
| 192.168.2.0/24 | 192.168.160.0/24 | 22, 12798, 3000, 9090 |

---

## Next Steps

After completing UniFi configuration:

1. ☐ Proceed to Proxmox networking configuration
2. ☐ Create VMs with VLAN 160 tag
3. ☐ Install Ubuntu and configure static IPs
4. ☐ Test all connectivity scenarios
5. ☐ Install Guild Operators

---

*Document Version: 1.0*
*Last Updated: December 2024*
