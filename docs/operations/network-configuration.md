# Network Configuration

## Overview

This document covers network configuration for the Cardano API Platform infrastructure, including:
- Firewall/router configuration (pfSense on dedicated server)
- Split-horizon DNS for optimal internal routing
- NAT reflection for internal access to public URLs
- Performance baselines and load testing results

## Firewall Equipment

| Device | Model | Role |
|--------|-------|------|
| Primary Router/Firewall | pfSense (dedicated server) | Firewall, VLAN routing, NAT, DNS, WireGuard VPN |

### Hardware Configuration

The pfSense server connects to Proxmox via a dedicated 10Gb SFP link:

| Interface | Type | Description |
|-----------|------|-------------|
| WAN (igb0) | Intel 1Gb | ISP connection |
| LAN (igb1) | Intel 1Gb | Management network (VLAN 150) |
| VLAN Trunk (bxe0) | QLogic BCM57810 10Gb SFP | High-speed link to Proxmox (vmbr3) |

**Proxmox Bridge Mapping:**
| Bridge | Purpose | Connected To |
|--------|---------|--------------|
| vmbr0 | Management LAN (1Gb) | igb1 on pfSense |
| vmbr3 | VLAN trunk (10Gb) | bxe0 on pfSense |

### Port Forwarding Rules (NAT)

| Service | External Port | Internal Target | Protocol |
|---------|---------------|-----------------|----------|
| Relay 1 P2P | 6001 | 192.168.160.11:6000 | TCP |
| Relay 2 P2P | 6002 | 192.168.160.12:6000 | TCP |
| HTTP (Kong) | 80 | 192.168.170.10:8000 | TCP |
| HTTPS (Kong) | 443 | 192.168.170.10:8443 | TCP |
| WireGuard VPN | 51820 | (pfSense) | UDP |

**Note:** All web traffic (80/443) goes directly to Kong Gateway at 192.168.170.10, which handles SSL termination and routes by hostname:
- `nacho.builders` → Next.js pool landing page (localhost:3000 → /pool via middleware)
- `app.nacho.builders` → Next.js API dashboard (localhost:3000)
- `api.nacho.builders` → API routes (/v1/ogmios, /v1/submit, /v1/graphql, etc.)

## Split-Horizon DNS

### Why Split-Horizon DNS?

When devices inside the network access public domains (e.g., `api.nacho.builders`), traffic would normally follow a "hairpin NAT" path:

```
Internal Device → Router → Internet → Router (port forward) → Internal Server
```

This creates several problems:
1. **Performance degradation** - Traffic traverses the router twice
2. **Connection limits** - Router NAT tables can exhaust under load
3. **Latency** - Unnecessary round-trip through ISP

With split-horizon DNS, internal devices resolve directly to internal IPs:

```
Internal Device → Router (VLAN routing) → Internal Server
```

### DNS Records Configuration

#### Public DNS (External Resolution)
Managed in your DNS provider (e.g., Cloudflare, Route53):

| Hostname | Type | Value |
|----------|------|-------|
| api.nacho.builders | A | 108.248.110.80 (public IP) |
| app.nacho.builders | A | 108.248.110.80 (public IP) |
| nacho.builders | A | 108.248.110.80 (public IP) |

#### Local DNS (Internal Resolution)
Configured in pfSense DNS Resolver:

| Hostname | Type | Value |
|----------|------|-------|
| nacho.builders | A | 192.168.170.10 |
| api.nacho.builders | A | 192.168.170.10 |
| app.nacho.builders | A | 192.168.170.10 |

### pfSense DNS Configuration

#### Configure Host Overrides

1. Navigate to **Services → DNS Resolver**
2. Scroll to **Host Overrides** section
3. Add the following entries:

| Host | Parent Domain | IP Address |
|------|---------------|------------|
| (blank) | nacho.builders | 192.168.170.10 |
| api | nacho.builders | 192.168.170.10 |
| app | nacho.builders | 192.168.170.10 |

4. Click **Save** and **Apply Changes**

#### Verify Configuration

From any internal device:

```bash
# Should resolve to internal IP
dig api.nacho.builders @192.168.150.1 +short

# Expected output:
# 192.168.170.10

# Test connectivity
curl -I https://api.nacho.builders/health
```

## NAT Reflection Configuration

NAT reflection (hairpin NAT) allows internal clients to access services via their public URLs when split-horizon DNS is not configured for a specific hostname.

### Enable NAT Reflection in pfSense

1. Navigate to **System → Advanced → Firewall & NAT**
2. Under **Network Address Translation**:
   - **NAT Reflection mode for port forwards**: Pure NAT
   - **Enable NAT Reflection for 1:1 NAT**: Checked
   - **Enable automatic outbound NAT for Reflection**: Checked
3. Click **Save**

**Note:** Split-horizon DNS is preferred over NAT reflection for frequently accessed services, but NAT reflection provides a fallback.

## VLAN Configuration

### VLAN Interfaces on pfSense

| VLAN ID | Interface Name | IP Address | Purpose |
|---------|---------------|------------|---------|
| (native) | LAN | 192.168.150.1/24 | Management |
| 10 | GUEST | 192.168.10.1/24 | Guest WiFi (isolated) |
| 160 | CARDANO_MAINNET | 192.168.160.1/24 | Mainnet Stake Pool |
| 161 | CARDANO_PREPROD | 192.168.161.1/24 | Preprod Testnet |
| 170 | API_PLATFORM | 192.168.170.1/24 | API Services |
| 2 | VPN_CLIENTS | 192.168.2.1/24 | WireGuard VPN |

### Proxmox VM Network Configuration

**Important:** VMs that need to access VLANs 160, 161, or 170 must have their network interfaces on **vmbr3** (the 10Gb trunk to pfSense), not vmbr0.

Example for NPM (VM 102):
```bash
# VLAN interfaces must be on vmbr3 for proper routing through pfSense
qm set 102 --net1 virtio,bridge=vmbr3,tag=160  # VLAN 160 access
qm set 102 --net2 virtio,bridge=vmbr3,tag=170  # VLAN 170 access
```

## Performance Baselines

### API Platform (Kong + Auth + Hasura)

Tested January 2026 with k6 load testing tool.

#### Direct to Kong (Internal Network)

| VUs | Requests/sec | Avg Latency | P95 Latency | Success Rate |
|-----|--------------|-------------|-------------|--------------|
| 10 | 256 | 38ms | 44ms | 100% |
| 50 | 1,076 | 46ms | 61ms | 100% |
| 100 | 1,075 | 92ms | 136ms | 100% |
| 200 | 720 | 276ms | 595ms | 100% |

**Key findings:**
- System handles 1,000+ req/s sustained with 100% success
- No request ceiling when accessing directly
- Latency increases gracefully with load

### Test Scripts

k6 test script for API load testing:

```javascript
// Save as: /tmp/api-load-test.js
import http from 'k6/http';
import { check } from 'k6';

export const options = {
  vus: 50,
  duration: '30s',
};

// Use internal IP for accurate results
const GRAPHQL_URL = 'http://192.168.170.10:8000/v1/graphql';
const API_KEY = 'your-api-key-here';
const QUERY = JSON.stringify({
  query: '{ block(limit: 1, order_by: {block_no: desc}) { block_no } }'
});

export default function() {
  const res = http.post(GRAPHQL_URL, QUERY, {
    headers: {
      'Content-Type': 'application/json',
      'apikey': API_KEY,
    },
    timeout: '10s',
  });

  check(res, {
    'status 200': (r) => r.status === 200,
  });
}
```

Run with:
```bash
k6 run /tmp/api-load-test.js
```

## Troubleshooting

### Common Issues

#### 502 Bad Gateway from Kong

**Symptoms:** Accessing `app.nacho.builders`, `nacho.builders`, or `api.nacho.builders` returns 502 Bad Gateway.

**Possible causes:**
1. Backend service (Next.js, Ogmios cache proxy) is down
2. Kong service misconfigured

**Diagnosis:**
```bash
# Check Kong services
ssh michael@192.168.170.10 "curl -s http://localhost:8001/services | python3 -m json.tool"

# Test Next.js directly
ssh michael@192.168.170.10 "curl -I http://localhost:3000"

# Check Kong upstream health
ssh michael@192.168.170.10 "curl -s http://localhost:8001/upstreams | python3 -m json.tool"
```

#### DNS Rebind Attack Error

**Symptoms:** pfSense shows "Potential DNS Rebind attack detected" when accessing internal services via public URL.

**Cause:** NAT reflection is disabled and split-horizon DNS not configured for the hostname.

**Fix:** Either:
1. Add host override in pfSense DNS Resolver (preferred)
2. Enable NAT reflection (see NAT Reflection Configuration above)

#### Inter-VLAN Routing Issues

**Symptoms:** Hosts on one VLAN cannot reach hosts on another VLAN.

**Check:**
1. Firewall rules allow the traffic
2. VM network interfaces are on correct bridge:
   - vmbr0 for VLAN 150 (management)
   - vmbr3 for VLANs 160, 161, 170 (via 10Gb trunk)

### Verifying Split-Horizon DNS

```bash
# Check what IP the system resolves (from internal network)
dig api.nacho.builders @192.168.150.1 +short

# Should return 192.168.170.10 from internal network
# External DNS will return the public IP
```

### Testing Connectivity

```bash
# Test relay connectivity from external
nc -zv nacho.builders 6001
nc -zv nacho.builders 6002

# Test API endpoints
curl -I https://api.nacho.builders/health
curl -I https://app.nacho.builders

# Verify DNS resolution (from internal host)
dig api.nacho.builders @192.168.150.1
```

## WireGuard VPN

Remote access to the infrastructure is provided via WireGuard VPN on pfSense.

| Setting | Value |
|---------|-------|
| Endpoint | nacho.builders:51820 (UDP) |
| Server IP | 192.168.2.1/24 |
| Client Range | 192.168.2.10-99 |
| Server Public Key | `ymsAPBSdfu5YGQNBA0yTYhGnbL30JU97kvSn0USoVUo=` |

**For detailed instructions, see:** [WireGuard VPN Administration](wireguard-vpn-administration.md)

This includes:
- Adding/removing VPN clients
- Key generation procedures
- Split tunnel vs full tunnel configuration
- Troubleshooting connectivity issues
- Firewall rule details

**Quick Reference - Accessible via VPN:**
| Service | URL/Address | Port |
|---------|-------------|------|
| Proxmox Web UI | https://192.168.150.222:8006 | 8006 |
| pfSense Web UI | https://192.168.150.1 | 443 |
| Grafana | http://192.168.160.2:3000 | 3000 |
| Prometheus | http://192.168.160.2:9090 | 9090 |
| SSH to any host | 192.168.X.X | 22 |

## References

- [pfSense Documentation](https://docs.netgate.com/pfsense/en/latest/)
- [pfSense DNS Resolver](https://docs.netgate.com/pfsense/en/latest/services/dns/resolver.html)
- [k6 Load Testing](https://k6.io/docs/)
