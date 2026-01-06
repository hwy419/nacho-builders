# Architecture Overview
## Cardano Stake Pool Infrastructure

This document provides a high-level view of the NACHO stake pool architecture, design decisions, and component relationships.

---

## Quick Reference

| Component | IP Address | Port | Purpose |
|-----------|------------|------|---------|
| Block Producer | 192.168.160.10 | 6000 | Creates blocks (internal only) |
| Relay 1 | 192.168.160.11 | 6000 (ext: 6001) | Public relay |
| Relay 2 | 192.168.160.12 | 6000 (ext: 6002) | Public relay |
| Monitoring | 192.168.160.2 | 3000, 9090 | Grafana + Prometheus |
| Air-Gapped | — | — | Offline key management |

**Public DNS:**
- `nacho.builders:6001` → Relay 1
- `nacho.builders:6002` → Relay 2

---

## Network Topology

```
                                    INTERNET
                                        │
                                        │ AT&T Business
                                        │ WAN: Dynamic IP
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
            VLAN 1 (LAN)        VLAN 160 (Cardano)     VPN Clients
            192.168.150.0/24    192.168.160.0/24       192.168.2.0/24
                    │                   │
         ┌──────────┴──────────┐        │
         │                     │        │
    ┌────▼────┐          ┌─────▼─────┐  │
    │ Proxmox │          │  Other    │  │
    │ Host    │          │  Services │  │
    │ .150.222│          │           │  │
    └─────────┘          └───────────┘  │
         │                              │
         │   ┌──────────────────────────┴──────────────────────────┐
         │   │                                                      │
         │   │    VLAN 160 - Cardano Infrastructure                 │
         │   │    192.168.160.0/24                                  │
         │   │                                                      │
         │   │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │
         │   │  │   Relay 1   │  │   Relay 2   │  │  Monitoring │  │
         │   │  │  .160.11    │  │  .160.12    │  │   .160.2    │  │
         │   │  │  Port 6000  │  │  Port 6000  │  │  Prometheus │  │
         │   │  │   PUBLIC    │◄─┤   PUBLIC    │  │   Grafana   │  │
         │   │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │
         │   │         │                │                │         │
         │   │         └───────┬────────┘                │         │
    ┌────▼───▼────┐            │                         │         │
    │Block Producer│◄──────────┘   scrapes metrics ◄─────┘         │
    │   .160.10    │                                               │
    │  Port 6000   │           ┌─────────────┐                     │
    │  No Inbound  │           │ Air-Gapped  │                     │
    │  from WAN    │           │  (offline)  │                     │
    └──────────────┘           │  Key Gen    │                     │
         │                     └─────────────┘                     │
         │   └─────────────────────────────────────────────────────┘
         │
         ▼
    ┌──────────────────────────────────┐
    │     CARDANO NETWORK              │
    │     (Other Relays & Pools)       │
    │  (Outbound connections only)     │
    └──────────────────────────────────┘
```

---

## Design Principles

### 1. Defense in Depth
Multiple security layers protect the infrastructure:

| Layer | Implementation |
|-------|----------------|
| **Network** | VLAN isolation (160) |
| **Perimeter** | UniFi firewall rules |
| **Host** | UFW on each VM |
| **Application** | Topology restrictions |
| **Physical** | Air-gapped key management |

### 2. Block Producer Isolation
The Block Producer is the most critical component:
- **No inbound internet access** - No port forwarding from WAN
- **Outbound allowed** - Can sync blockchain, reach NTP, DNS
- **No public DNS** - Not discoverable from outside
- **Firewall restricted** - Only accepts connections from Relay1/Relay2
- **Topology locked** - `useLedgerAfterSlot: -1` disables peer discovery, only connects to own relays

### 3. Relay Redundancy
Two relay nodes provide:
- **High availability** - Pool remains operational if one relay fails
- **Load distribution** - Connections spread across nodes
- **Maintenance windows** - Can update one relay at a time

### 4. Separation of Concerns

| Component | Responsibility | Network Exposure |
|-----------|----------------|------------------|
| Block Producer | Creates blocks, holds hot keys | Internal only |
| Relay Nodes | P2P communication, blockchain sync | Public (NAT) |
| Air-Gapped Machine | Key generation, transaction signing | None (offline) |

---

## Component Details

### Block Producer (192.168.160.10)
**Purpose:** Produces blocks when elected as slot leader

**Connections:**
- Inbound: Relay1, Relay2 only (port 6000)
- Outbound: Relay1, Relay2 only (port 6000)

**Hot Keys Present:**
- `vrf.skey` - VRF signing key
- `kes.skey` - KES signing key (rotate every 90 days)
- `op.cert` - Operational certificate

**Critical Settings:**
```json
{
  "bootstrapPeers": [],
  "useLedgerAfterSlot": -1,
  "PeerSharing": false
}
```

### Relay Nodes (192.168.160.11, .12)
**Purpose:** Interface with the global Cardano network

**Connections:**
- Inbound: Internet (via NAT), Block Producer, other relay
- Outbound: Internet, Block Producer, other relay

**Configuration:**
```json
{
  "bootstrapPeers": ["backbone.cardano.iog.io", ...],
  "useLedgerAfterSlot": 128908821,
  "PeerSharing": true
}
```

### Air-Gapped Machine
**Purpose:** Secure key generation and transaction signing

**Never Connects To:** Any network

**Contains:**
- `cold.skey` - Pool cold key (most sensitive)
- `cold.counter` - Certificate counter
- `stake.skey` - Stake key
- `payment.skey` - Payment/wallet key

### Monitoring Server (192.168.160.2)
**Purpose:** Centralized metrics collection and visualization

**Services:**
- **Prometheus** (port 9090) - Metrics collection and storage
- **Grafana** (port 3000) - Dashboard visualization
- **Node Exporter** (port 9100) - Host system metrics

**Scrapes Metrics From:**
| Target | Port | Metrics Type |
|--------|------|--------------|
| Block Producer | 12798, 9100 | Cardano node + system |
| Relay 1 | 12798, 9100 | Cardano node + system |
| Relay 2 | 12798, 9100 | Cardano node + system |

**Access:**
```
Grafana:    http://192.168.160.2:3000
Prometheus: http://192.168.160.2:9090
```

---

## Network Segmentation

### VLAN Strategy

| VLAN ID | Name | Subnet | Purpose |
|---------|------|--------|---------|
| 1 | Default/LAN | 192.168.150.0/24 | Proxmox host, general |
| 160 | Cardano | 192.168.160.0/24 | Stake pool nodes + monitoring |
| — | VPN | 192.168.2.0/24 | Remote management access |

### Traffic Flow Rules

| Source | Destination | Ports | Action |
|--------|-------------|-------|--------|
| Internet | Relay1 | 6001→6000 | ALLOW |
| Internet | Relay2 | 6002→6000 | ALLOW |
| Internet | Block Producer | Any | **DENY** |
| Relay1/2 | Block Producer | 6000 | ALLOW |
| LAN | Cardano VLAN | 22 | ALLOW |
| VPN | Cardano VLAN | 22 | ALLOW |
| Cardano VLAN | LAN | Any | **DENY** |
| Cardano VLAN | Internet | Any | ALLOW |

---

## Technology Stack

### Virtualization
- **Hypervisor:** Proxmox VE 8.2.2
- **Host:** eth-node (192.168.150.222)
- **Resources:** 24 vCPUs, 188GB RAM, 4TB NVMe

### Operating System
- **Distribution:** Ubuntu 22.04 LTS Server
- **Hardening:** SSH keys, UFW, fail2ban, kernel hardening

### Cardano Software
- **Installation:** Guild Operators (CNTools)
- **Node Version:** Latest stable via guild-deploy.sh
- **Sync Method:** Mithril for initial bootstrap

### Networking
- **Router:** UniFi Dream Router 7
- **Controller:** UniFi Network 10.0.162+
- **DNS:** Dynamic DNS via nacho.builders

---

## Failure Scenarios

### Single Relay Failure
- **Impact:** Reduced connectivity, pool remains operational
- **Recovery:** Restart relay or failover to second relay
- **RTO:** Minutes

### Block Producer Failure
- **Impact:** Cannot produce blocks when elected
- **Recovery:** Restart BP, verify keys and connectivity
- **RTO:** Minutes to hours depending on cause

### Both Relays Fail
- **Impact:** Pool isolated, cannot produce blocks
- **Recovery:** Restore at least one relay
- **RTO:** Hours

### Key Compromise
- **Impact:** Potentially catastrophic
- **Recovery:** Rotate compromised keys on air-gapped machine
- **Prevention:** Never expose cold keys to network

---

## Future Considerations

### Potential Enhancements
1. **Third Relay** - Additional redundancy, geographic distribution
2. **Alerting** - Prometheus Alertmanager for notifications
3. **Backup Block Producer** - Cold standby for faster recovery
4. **Geographic Distribution** - Relays in different locations

### Scaling Path
Current architecture supports:
- Single pool operation
- ~50% of available host resources used
- Room for additional relays or services

---

---

## Current Deployment Status

| Component | Status | Notes |
|-----------|--------|-------|
| Block Producer | ✅ Synced | 100% synchronized, ready for keys |
| Relay 1 | ✅ Synced | 100% synchronized, accepting connections |
| Relay 2 | ✅ Synced | 100% synchronized, accepting connections |
| Monitoring | ✅ Running | Prometheus + Grafana operational |
| Air-Gapped VM | ⬜ Pending | Required for key generation |
| Pool Registration | ⬜ Pending | Next phase |

---

*Document Version: 1.2*
*Last Updated: December 27, 2025*




