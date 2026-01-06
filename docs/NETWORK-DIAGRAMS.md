# Network Architecture Diagrams

This directory contains comprehensive network architecture documentation for the NACHO Cardano Stake Pool and API Platform.

---

## 📊 Available Diagrams

### 1. Complete Network Diagram v2 (Interactive) ⭐ RECOMMENDED
**File:** [`complete-network-diagram-v2.html`](complete-network-diagram-v2.html)

**How to view:**
```bash
# Option 1: Open in browser directly
open docs/complete-network-diagram-v2.html

# Option 2: Serve via Python
cd docs
python3 -m http.server 8080
# Then visit: http://localhost:8080/complete-network-diagram-v2.html
```

**What it shows:**
- ✅ All 4 VLANs (150-LAN, 160-Cardano, 170-API, 2-VPN)
- ✅ Complete IP address allocation
- ✅ All port numbers and services
- ✅ **ALL USER INTERFACES with URLs** (Grafana, Prometheus, HAProxy, Kong, etc.)
- ✅ Internet connectivity flow
- ✅ Proxmox hypervisor
- ✅ Nginx Proxy Manager
- ✅ Cardano nodes (BP + 2 Relays)
- ✅ API Platform (Gateway + DB-Sync)
- ✅ Monitoring stack
- ✅ Air-gapped machine
- ✅ **Real-time verified services** (via SSH)
- ✅ Orthogonal (90-degree) connection lines
- ✅ Wide 2400px layout with better organization
- ✅ Clear layer hierarchy (Internet → Infrastructure → Services)
- ✅ Checkmarks (✓) for running services

**Best for:** Operations, troubleshooting, complete system reference

**What's New in v2:**
- 🔍 Real data collected via SSH from all hosts
- 🌐 All web interfaces clearly marked with blue UI badges
- 📐 Orthogonal connections (no more diagonal lines)
- 📏 Wider layout (2400px) with better spacing
- 🎯 Clear visual hierarchy (3 distinct layers)
- ✅ Service verification checkmarks

See [`DIAGRAM-IMPROVEMENTS.md`](DIAGRAM-IMPROVEMENTS.md) for full details.

---

### 2. Complete Network Diagram v1 (Interactive)
**File:** [`complete-network-diagram.html`](complete-network-diagram.html)

**Note:** This is the original version. Use v2 above for the improved, reorganized diagram with real-time data.

**Best for:** Legacy reference

---

### 2. Complete Network Reference (Text)
**File:** [`architecture/complete-network-reference.md`](architecture/complete-network-reference.md)

**How to view:**
```bash
# View in terminal
cat docs/architecture/complete-network-reference.md

# Or open in your editor
code docs/architecture/complete-network-reference.md
```

**What it includes:**
- 📋 Complete IP address inventory
- 🔌 Port mapping tables
- 🔄 Data flow diagrams (text-based)
- 🔒 Security layer documentation
- 🌐 DNS and public endpoint configuration
- 🔧 Service inventory with paths and configs
- 📊 Performance metrics
- 🛠️ Troubleshooting quick reference
- 📦 Backup and disaster recovery procedures

**Best for:** Operations, troubleshooting, documentation reference

---

### 3. Legacy Cardano Topology (Original)
**File:** [`topology-diagram.html`](topology-diagram.html)

**What it shows:**
- Cardano stake pool infrastructure only (VLAN 160)
- Block Producer + 2 Relays + Monitoring
- Air-gapped machine
- Basic network topology

**Note:** This is the original diagram created before the API platform was added. Use `complete-network-diagram.html` for the full architecture.

---

## 🗂️ Quick Reference

### Network Segments

| VLAN | Subnet | Purpose | Key Devices |
|------|--------|---------|-------------|
| 1/150 | 192.168.150.0/24 | Management LAN | Proxmox, NPM |
| 160 | 192.168.160.0/24 | Cardano Infrastructure | BP, Relays, Monitoring |
| 170 | 192.168.170.0/24 | API Platform | Gateway, DB-Sync |
| 2 | 192.168.2.0/24 | VPN | Remote access |

### Public Endpoints

| Endpoint | Destination | Purpose |
|----------|-------------|---------|
| nacho.builders:6001 | Relay 1 | Cardano P2P |
| nacho.builders:6002 | Relay 2 | Cardano P2P |
| api.nacho.builders | Kong Gateway | API Service |
| app.nacho.builders | Next.js App | Web Dashboard |

### Key IP Addresses

| IP | Hostname | Description |
|----|----------|-------------|
| 192.168.150.1 | unifi-dr7 | Router & Gateway |
| 192.168.150.222 | eth-node | Proxmox Host |
| 192.168.150.224 | nginx-proxy | Reverse Proxy |
| 192.168.160.2 | cardano-monitor | Prometheus + Grafana |
| 192.168.160.10 | cardano-bp | Block Producer |
| 192.168.160.11 | cardano-relay1 | Relay 1 |
| 192.168.160.12 | cardano-relay2 | Relay 2 |
| 192.168.170.10 | cardano-gateway | API Gateway |
| 192.168.170.11 | cardano-dbsync | DB-Sync (future) |

---

## 🔄 Updating the Diagrams

### When to update:

- ✏️ Adding new VMs or services
- 🔧 Changing port numbers or IPs
- 🌐 Modifying firewall rules or VLAN configuration
- 🚀 Deploying new infrastructure components
- 📊 Major architecture changes

### How to update:

#### Interactive HTML Diagram (`complete-network-diagram.html`)
1. Open file in code editor
2. Find the SVG elements to modify
3. Update IP addresses, ports, or add new nodes
4. Save and refresh in browser
5. Commit changes to git

#### Text Reference (`complete-network-reference.md`)
1. Open file in Markdown editor
2. Update relevant sections (IP tables, port mappings, etc.)
3. Keep version history at bottom
4. Save and commit to git

---

## 📖 Related Documentation

- **Architecture Overview**: `architecture/overview.md`
- **API Service Deployment**: `api-service/DEPLOYMENT-GUIDE.md`
- **Operations Manual**: `operations/`
- **Troubleshooting**: `runbooks/troubleshooting.md`
- **CLAUDE.md**: Main reference for AI assistance

---

## 🎨 Diagram Design Principles

These diagrams follow a consistent design language:

### Color Coding
- **Purple** (#8b5cf6): Internet/WAN
- **Green** (#10b981): Network equipment (routers, switches)
- **Orange** (#fb923c): Hypervisor (Proxmox)
- **Cyan** (#06b6d4): Reverse proxy (NPM)
- **Amber** (#f59e0b): Block Producer (most secure)
- **Blue** (#3b82f6): Relay nodes
- **Pink** (#ec4899): Monitoring
- **Teal** (#14b8a6): API Gateway
- **Purple** (#a78bfa): Database/DB-Sync
- **Red** (#ef4444): Air-gapped (dashed border)

### Connection Types
- **Solid lines**: Direct connections
- **Dashed lines**: Monitored or special connections
- **Color-coded**: Match the service type

### Information Hierarchy
1. **Node title**: Service name with emoji
2. **IP address**: Primary identifier
3. **Ports**: Service ports listed
4. **Services**: Additional running services
5. **Public info**: DNS names or public URLs

---

## 🚀 Tips for Presentations

### For Technical Audiences
1. Start with the complete network diagram
2. Explain VLAN isolation strategy
3. Walk through data flow (API request → response)
4. Highlight security boundaries
5. Show monitoring and observability

### For Business Audiences
1. Focus on public endpoints (api/app.nacho.builders)
2. Explain high availability (2 relays)
3. Show security measures (air-gapped, no BP internet)
4. Highlight scalability options
5. Demo the actual service

### For New Team Members
1. Show complete diagram first (big picture)
2. Deep dive into each VLAN
3. Follow a user request through the system
4. Review common operations tasks
5. Practice troubleshooting scenarios

---

## 📝 Version History

- **v1.0** (Jan 3, 2026): Initial comprehensive diagrams created
  - Complete network diagram with all VLANs
  - Full text-based reference documentation
  - Consolidated all architecture information

---

**Last Updated:** January 3, 2026  
**Maintained By:** Infrastructure Team  
**Next Review:** April 3, 2026

