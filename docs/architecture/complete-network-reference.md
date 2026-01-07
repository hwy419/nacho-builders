# NACHO - Complete Network Architecture Reference

**Last Updated:** January 3, 2026  
**Network:** Cardano Mainnet (Conway Era)  
**Pool Ticker:** NACHO

---

## Table of Contents

1. [Network Overview](#network-overview)
2. [VLAN Architecture](#vlan-architecture)
3. [IP Address Allocation](#ip-address-allocation)
4. [Port Mappings](#port-mappings)
5. [Service Inventory](#service-inventory)
6. [Data Flow Diagrams](#data-flow-diagrams)
7. [Security Boundaries](#security-boundaries)
8. [DNS & Public Endpoints](#dns--public-endpoints)

---

## Network Overview

### Physical Infrastructure

| Component | Details |
|-----------|---------|
| **ISP** | AT&T Business Fiber (Dynamic IP) |
| **Router** | UniFi Dream Router 7 (192.168.150.1) |
| **Hypervisor** | Proxmox VE 8.2.2 on eth-node (192.168.150.222) |
| **Resources** | 24 vCPU, 188GB RAM, 4TB NVMe |
| **Network Controller** | UniFi Network Application 10.0.162+ |

### High-Level Architecture

```
Internet (AT&T Fiber)
    ↓
UniFi Dream Router 7 (192.168.150.1)
    ↓
├─ VLAN 1/150 (LAN) ──────── Management network
│   ├─ Proxmox Host (192.168.150.222)
│   └─ Nginx Proxy Manager (192.168.150.224)
│
├─ VLAN 160 (Cardano) ────── Stake pool infrastructure
│   ├─ Block Producer (192.168.160.10)
│   ├─ Relay 1 (192.168.160.11) ───── nacho.builders:6001
│   ├─ Relay 2 (192.168.160.12) ───── nacho.builders:6002
│   └─ Monitoring (192.168.160.2)
│
├─ VLAN 170 (API Platform) ─ API service infrastructure
│   ├─ Gateway (192.168.170.10) ──── api/app.nacho.builders
│   └─ DB-Sync (192.168.170.11) ──── Future dedicated VM
│
└─ VLAN 2 (VPN) ─────────── Remote management
    └─ VPN Clients (192.168.2.0/24)
```

---

## VLAN Architecture

### VLAN 1/150 - Management LAN

| Attribute | Value |
|-----------|-------|
| **VLAN ID** | 1 (default), 150 |
| **Subnet** | 192.168.150.0/24 |
| **Gateway** | 192.168.150.1 |
| **Purpose** | Management, hypervisor, reverse proxy |
| **Internet Access** | Full (NAT) |

**Devices:**
- Proxmox host: 192.168.150.222
- Nginx Proxy Manager: 192.168.150.224 (ens18)
- Other infrastructure devices

**Firewall Rules:**
- Allow all outbound traffic
- Allow SSH from VPN (192.168.2.0/24)
- Allow management ports (8006 for Proxmox, 81 for NPM)

---

### VLAN 160 - Cardano Infrastructure

| Attribute | Value |
|-----------|-------|
| **VLAN ID** | 160 |
| **Subnet** | 192.168.160.0/24 |
| **Gateway** | 192.168.160.1 |
| **Purpose** | Cardano stake pool nodes + monitoring |
| **Internet Access** | Outbound only (relays have inbound via NAT) |

**Devices:**
- Block Producer: 192.168.160.10
- Relay 1: 192.168.160.11
- Relay 2: 192.168.160.12
- Monitoring: 192.168.160.2

**Firewall Rules:**
- Internet → Relay 1/2: Allow ports 6001, 6002 (NAT)
- Internet → Block Producer: **DENY ALL**
- LAN → VLAN 160: Allow SSH (22)
- VPN → VLAN 160: Allow SSH (22)
- VLAN 160 → LAN: **DENY** (except Monitoring to scrape targets)
- VLAN 160 → Internet: Allow all outbound
- VLAN 170 → VLAN 160: Allow ports 1337, 8090, 6000 (Relays only)

---

### VLAN 170 - API Platform

| Attribute | Value |
|-----------|-------|
| **VLAN ID** | 170 |
| **Subnet** | 192.168.170.0/24 |
| **Gateway** | 192.168.170.1 |
| **Purpose** | Cardano API-as-a-Service platform |
| **Internet Access** | Outbound only (inbound via NPM reverse proxy) |

**Devices:**
- API Gateway: 192.168.170.10
- DB-Sync (future): 192.168.170.11
- NPM Interface: 192.168.170.5 (ens20)

**Firewall Rules:**
- Internet → api.nacho.builders → NPM → 192.168.170.10:8000
- Internet → app.nacho.builders → NPM → 192.168.170.10:3000
- VLAN 170 → VLAN 160 Relays: Allow ports 1337, 8090
- VLAN 170 → Block Producer: **DENY**
- LAN → VLAN 170: Allow SSH (22)
- VPN → VLAN 170: Allow SSH (22)

---

### VLAN 2 - VPN

| Attribute | Value |
|-----------|-------|
| **VLAN ID** | 2 |
| **Subnet** | 192.168.2.0/24 |
| **Gateway** | 192.168.2.1 |
| **Purpose** | Remote management access |
| **Protocol** | WireGuard/OpenVPN |

**Firewall Rules:**
- VPN → VLAN 150: Allow SSH, management ports
- VPN → VLAN 160: Allow SSH
- VPN → VLAN 170: Allow SSH

---

## IP Address Allocation

### Complete IP Inventory

#### VLAN 150 (LAN)
| IP | Hostname | Description |
|----|----------|-------------|
| 192.168.150.1 | unifi-dr7 | UniFi Dream Router 7 (Gateway) |
| 192.168.150.222 | eth-node | Proxmox VE host |
| 192.168.150.224 | nginx-proxy | Nginx Proxy Manager (ens18) |

#### VLAN 160 (Cardano)
| IP | Hostname | VM ID | Description |
|----|----------|-------|-------------|
| 192.168.160.2 | cardano-monitor | — | Monitoring (Prometheus + Grafana) |
| 192.168.160.10 | cardano-bp | — | Block Producer |
| 192.168.160.11 | cardano-relay1 | — | Relay 1 (Public: 6001) |
| 192.168.160.12 | cardano-relay2 | — | Relay 2 (Public: 6002) |

#### VLAN 170 (API Platform)
| IP | Hostname | VM ID | Description |
|----|----------|-------|-------------|
| 192.168.170.5 | nginx-proxy | — | NPM interface (ens20) |
| 192.168.170.10 | cardano-gateway | 120 | API Gateway + Web App |
| 192.168.170.11 | cardano-dbsync | 121 | DB-Sync (future, currently on .10) |

#### VLAN 2 (VPN)
| IP | Description |
|----|-------------|
| 192.168.2.1 | VPN Gateway |
| 192.168.2.2-254 | VPN client pool |

---

## Port Mappings

### External Port Forwards (UniFi Router)

| External Port | Internal Destination | Protocol | Service |
|--------------|---------------------|----------|---------|
| 6001 | 192.168.160.11:6000 | TCP | Relay 1 (Cardano P2P) |
| 6002 | 192.168.160.12:6000 | TCP | Relay 2 (Cardano P2P) |
| 80 | 192.168.150.224:80 | TCP | Nginx Proxy Manager (HTTP) |
| 443 | 192.168.150.224:443 | TCP | Nginx Proxy Manager (HTTPS) |

### Internal Service Ports

#### Block Producer (192.168.160.10)
| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | LAN, VPN |
| 6000 | cardano-node | Relay1, Relay2 only |
| 9100 | node-exporter | Monitoring only |
| 12798 | cardano-node metrics | Monitoring only |

#### Relay 1 & 2 (192.168.160.11, 192.168.160.12)
| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | LAN, VPN |
| 6000 | cardano-node | Internet (via NAT), BP, other relay |
| 1337 | ogmios | VLAN 170 (API Platform) |
| 8090 | submit-api | VLAN 170 (API Platform) |
| 9100 | node-exporter | Monitoring only |
| 12798 | cardano-node metrics | Monitoring only |

#### Monitoring (192.168.160.2)
| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | LAN, VPN |
| 3000 | grafana | LAN, VPN |
| 9090 | prometheus | LAN, VPN |
| 9100 | node-exporter | Self |

#### API Gateway (192.168.170.10)
| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | LAN, VPN |
| 3000 | nextjs-app | NPM reverse proxy |
| 3001 | ogmios-cache-proxy | Kong Gateway (internal) |
| 5432 | postgresql | Localhost (currently) |
| 6379 | redis | Localhost |
| 8000 | kong | NPM reverse proxy |
| 8001 | kong-admin | Localhost only |
| 8404 | haproxy-stats | LAN, VPN |
| 9100 | node-exporter | Monitoring |

#### DB-Sync (192.168.170.11) - Future
| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | LAN, VPN |
| 3100 | cardano-graphql | Gateway |
| 5432 | postgresql | Gateway |

#### Nginx Proxy Manager (192.168.150.224)
| Port | Service | Access |
|------|---------|--------|
| 22 | SSH | LAN, VPN |
| 80 | nginx (HTTP) | Internet |
| 81 | npm-admin | LAN only |
| 443 | nginx (HTTPS) | Internet |

---

## Service Inventory

### Cardano Node Services

#### Block Producer
- **Service:** `cnode.service`
- **Binary:** `/home/cardano/.local/bin/cardano-node`
- **Config:** `/opt/cardano/cnode/files/config.json`
- **Database:** `/opt/cardano/cnode/db`
- **Socket:** `/opt/cardano/cnode/sockets/node.socket`
- **User:** `cardano`
- **Hot Keys:** VRF (`vrf.skey`), KES (`kes.skey`), OpCert (`op.cert`)

#### Relay Nodes
- **Service:** `cnode.service`
- **Binary:** `/home/cardano/.local/bin/cardano-node`
- **Config:** `/opt/cardano/cnode/files/config.json`
- **Database:** `/opt/cardano/cnode/db`
- **Socket:** `/opt/cardano/cnode/sockets/node.socket`
- **User:** `cardano`
- **Additional Services:**
  - `ogmios.service` (port 1337)
  - `cardano-submit-api.service` (port 8090)

### Monitoring Services

#### Prometheus (192.168.160.2)
- **Service:** `prometheus.service`
- **Config:** `/etc/prometheus/prometheus.yml`
- **Data:** `/var/lib/prometheus`
- **Retention:** 30 days
- **Scrape Interval:** 15s

**Scrape Targets:**
- Block Producer: 192.168.160.10:12798, :9100
- Relay 1: 192.168.160.11:12798, :9100
- Relay 2: 192.168.160.12:12798, :9100
- Gateway: 192.168.170.10:9100
- Self: 192.168.160.2:9100

#### Grafana (192.168.160.2)
- **Service:** `grafana-server.service`
- **Config:** `/etc/grafana/grafana.ini`
- **Data:** `/var/lib/grafana`
- **URL:** http://192.168.160.2:3000

**Dashboards:**
- Technical Operations Dashboard
- Business Analytics Dashboard
- Cardano Node Dashboard

### API Platform Services

#### Kong Gateway (192.168.170.10)
- **Service:** `kong.service`
- **Config:** `/etc/kong/kong.conf`
- **Database:** PostgreSQL (localhost:5432, db: kong)
- **Admin API:** http://localhost:8001
- **Proxy:** http://192.168.170.10:8000

**Plugins Enabled:**
- `cardano-api-auth` (custom)
- `rate-limiting`
- `prometheus`
- `http-log`
- `cors`

**Routes:**
- `/v1/ogmios` → Ogmios Cache Proxy (127.0.0.1:3001)
- `/v1/submit` → Submit API upstream via HAProxy

**Custom Plugin Location:**
- `/usr/local/share/lua/5.1/kong/plugins/cardano-api-auth/`

#### Next.js Web App (192.168.170.10)
- **Service:** `cardano-api-web.service`
- **Path:** `/opt/cardano-api-service/apps/web`
- **Build:** `/opt/cardano-api-service/apps/web/.next/standalone`
- **User:** `cardano-api`
- **Port:** 3000
- **URL:** https://app.nacho.builders

**Environment:**
- Database: PostgreSQL (localhost:5432, db: cardano_api)
- Auth: NextAuth.js with Google OAuth + AWS SES magic links
- Session: JWT

#### Ogmios Cache Proxy (192.168.170.10)
- **Service:** `ogmios-cache-proxy.service`
- **Path:** `/opt/ogmios-cache-proxy/ogmios-cache-proxy.js`
- **User:** `cardano-api`
- **Port:** 3001 (WebSocket)
- **Upstreams:** 192.168.160.11:1337, 192.168.160.12:1337 (round-robin)

**Cache Performance:**
- Hit Rate: 97.5%
- Storage: Redis (localhost:6379)
- Key Prefix: `ogmios:`

**Cache TTL Configuration:**
- `queryNetwork/tip`: 10s
- `queryNetwork/genesisConfiguration`: 24h
- `queryLedgerState/protocolParameters`: 1h
- `queryLedgerState/epoch`: 5m

#### Redis Cache (192.168.170.10)
- **Service:** `redis-server.service`
- **Config:** `/etc/redis/redis.conf`
- **Port:** 6379 (localhost only)
- **Memory Limit:** 512MB
- **Eviction Policy:** allkeys-lru
- **Persistence:** Disabled (pure in-memory)

#### HAProxy (192.168.170.10)
- **Service:** `haproxy.service`
- **Config:** `/etc/haproxy/haproxy.cfg`
- **Stats:** http://192.168.170.10:8404

**Backends:**
- `ogmios_backend`: 192.168.160.11:1337, 192.168.160.12:1337 (TCP, round-robin)
- `submit_backend`: 192.168.160.11:8090, 192.168.160.12:8090 (HTTP, round-robin)
- `graphql_backend`: 192.168.170.20:3100 (future dedicated VM)

#### PostgreSQL (192.168.170.10 - Currently)
- **Service:** `postgresql.service`
- **Version:** 15
- **Port:** 5432
- **Data:** `/var/lib/postgresql/15/main`

**Databases:**
- `kong` - Kong configuration
- `cardano_api` - Web application data (users, API keys, usage logs, payments)
- `cexplorer` - DB-Sync indexed blockchain data (future)

**Key Tables (cardano_api):**
- `User` - User accounts
- `ApiKey` - API key management
- `UsageLog` - Request logging and analytics
- `Payment` - ADA payments for credits
- `CreditPackage` - Pricing configuration

#### Cardano DB-Sync (Future: 192.168.170.11, Currently: 192.168.170.10)
- **Service:** `cardano-db-sync.service`
- **Binary:** `/home/cardano/.local/bin/cardano-db-sync`
- **Config:** `/opt/cardano-db-sync/config`
- **Socket:** `/tmp/node.socket` (via SSH tunnel from relay)
- **Database:** PostgreSQL (cexplorer)
- **Initial Sync:** 24-48 hours

---

## Data Flow Diagrams

### API Request Flow

```
1. User Request
   ↓
   https://api.nacho.builders/v1/ogmios
   ↓
2. DNS Resolution → [Your WAN IP]
   ↓
3. Port Forward (443 → 192.168.150.224:443)
   ↓
4. Nginx Proxy Manager
   - SSL Termination (Let's Encrypt)
   - Forward to: http://192.168.170.10:8000
   ↓
5. Kong Gateway (192.168.170.10:8000)
   - cardano-api-auth plugin validates API key
   - Calls: http://localhost:3000/api/auth/validate-key
   - Sets headers: X-Api-Key-Id, X-User-Id, X-Api-Tier
   - Rate limiting check
   ↓
6. Ogmios Cache Proxy (127.0.0.1:3001)
   - WebSocket upgrade
   - Check Redis cache (localhost:6379)
   - Cache HIT → Return cached response
   - Cache MISS → Continue to backend
   ↓
7. HAProxy Load Balancer (internal routing)
   - Round-robin selection
   - Health check validation
   ↓
8. Ogmios on Relay Node (192.168.160.11:1337 or .12:1337)
   - Query cardano-node via socket
   - Return blockchain data
   ↓
9. Response Path (reverse)
   - Cache in Redis (with TTL)
   - Return through Kong
   - Kong http-log plugin → POST to /api/usage/log
   - NPM forwards response
   - SSL encryption
   - Return to user
   ↓
10. Usage Tracking (async)
    - Web App receives usage log
    - Create UsageLog entry in PostgreSQL
    - Deduct credits for PAID tier users
```

### Cardano Node P2P Flow

```
1. Internet Peers
   ↓
   Connection to nacho.builders:6001 or :6002
   ↓
2. DNS Resolution → [Your WAN IP]
   ↓
3. Port Forward (6001 → 192.168.160.11:6000, 6002 → 192.168.160.12:6000)
   ↓
4. Relay Nodes
   - Accept P2P connections
   - Sync blocks from network
   - Share blocks with network
   - Maintain peer connections
   ↓
5. Inter-Relay Communication (192.168.160.11 ↔ 192.168.160.12:6000)
   - Direct VLAN 160 connection
   - No internet hop required
   ↓
6. Relay → Block Producer
   - Connection: Relay1/Relay2 → 192.168.160.10:6000
   - VLAN 160 internal only
   - No internet exposure
   - Topology: useLedgerAfterSlot: -1 (no peer discovery)
   ↓
7. Block Producer
   - Receives blocks from relays
   - Validates transactions
   - When elected as slot leader:
     → Signs block with KES key
     → Creates new block
     → Sends to relays
   ↓
8. Relays distribute new block to network
```

### Monitoring Data Flow

```
Prometheus (192.168.160.2:9090)
    ↓ (scrape every 15s)
    ├─→ Block Producer:12798 (cardano-node metrics)
    ├─→ Block Producer:9100 (node-exporter)
    ├─→ Relay1:12798 (cardano-node metrics)
    ├─→ Relay1:9100 (node-exporter)
    ├─→ Relay2:12798 (cardano-node metrics)
    ├─→ Relay2:9100 (node-exporter)
    ├─→ Gateway:9100 (node-exporter)
    └─→ Self:9100 (node-exporter)
    ↓
Store in TSDB (/var/lib/prometheus)
    ↓
Grafana (192.168.160.2:3000) queries Prometheus
    ↓
Display dashboards:
  - Technical Operations (node health, sync status, resources)
  - Business Analytics (API usage, revenue, user metrics)
  - Cardano Node Dashboard (blockchain metrics)
```

### Payment Flow

```
1. User selects credit package on app.nacho.builders
   ↓
2. Create Payment record (status: PENDING)
   - Generate unique payment address (HD wallet derivation)
   - Set expiration: now + 24 hours
   - Store in PostgreSQL
   ↓
3. Display QR code + address to user
   ↓
4. User sends ADA from wallet
   ↓
5. Cron job (every minute): /api/cron/payments
   - Query Ogmios for transactions to payment addresses
   - Check pending payments
   ↓
6. Transaction detected
   - Update status: CONFIRMING
   - Store txHash
   ↓
7. Wait for 2 confirmations
   - Poll Ogmios for confirmation count
   ↓
8. Confirmations reached
   - Update status: CONFIRMED
   - Add credits to user balance
   - Create audit log entry
   ↓
9. User can use credits for PAID API tier
```

---

## Security Boundaries

### Network Security Layers

#### Layer 1: Perimeter (UniFi Firewall)
- NAT from WAN to internal networks
- Port forwarding only for necessary services
- DPI (Deep Packet Inspection) enabled
- IDS/IPS enabled

**Allowed Inbound:**
- 6001 → Relay 1
- 6002 → Relay 2
- 80/443 → Nginx Proxy Manager

**Denied Inbound:**
- Everything else (including Block Producer)

#### Layer 2: VLAN Isolation
- VLAN 160 (Cardano) ← separated → VLAN 170 (API Platform)
- VLAN 160 cannot reach VLAN 150 (except Monitoring scrapes)
- VLAN 170 can reach VLAN 160 Relays only (ports 1337, 8090)
- VLAN 170 cannot reach Block Producer

#### Layer 3: Host Firewall (UFW)
Each VM runs UFW with restrictive rules:
- Default: DENY all incoming
- Allow SSH from LAN (192.168.150.0/24) and VPN (192.168.2.0/24)
- Allow service ports only from expected sources

**Example (Relay 1):**
```
22/tcp    ALLOW    192.168.150.0/24  # SSH from LAN
22/tcp    ALLOW    192.168.2.0/24    # SSH from VPN
6000/tcp  ALLOW    Anywhere          # P2P (public)
6000/tcp  ALLOW    192.168.160.10    # BP
6000/tcp  ALLOW    192.168.160.12    # Relay2
1337/tcp  ALLOW    192.168.170.0/24  # Ogmios from VLAN 170
8090/tcp  ALLOW    192.168.170.0/24  # Submit from VLAN 170
9100/tcp  ALLOW    192.168.160.2     # Metrics from Monitor
12798/tcp ALLOW    192.168.160.2     # Metrics from Monitor
```

#### Layer 4: Application Authentication
- Kong Gateway: API key authentication via custom plugin
- Web App: NextAuth.js session + JWT
- Grafana: Username/password + session
- Proxmox: PAM authentication + 2FA (optional)

#### Layer 5: Key Management
- Cold keys: Air-gapped machine (never connected to network)
- Hot keys: Block Producer only (no inbound internet)
- Secrets: Ansible Vault encrypted
- Environment variables: File permissions 600, owner-only

### Attack Surface Analysis

#### Exposed to Internet
1. **Relay Nodes (port 6000)** - Necessary for P2P operation
   - Mitigation: UFW rate limiting, fail2ban
2. **Nginx Proxy Manager (ports 80/443)** - Public API/Web
   - Mitigation: Let's Encrypt SSL, rate limiting, DDoS protection (CloudFlare optional)

#### Internal Only
1. **Block Producer** - No inbound internet access
   - Cannot be reached from outside network
   - Only relays can connect
2. **API Gateway** - Behind reverse proxy
   - NPM provides SSL termination
   - Kong provides authentication
3. **Monitoring** - LAN/VPN only
   - Not exposed to internet

#### Air-Gapped
1. **Cold Key Machine** - Completely offline
   - Key generation and transaction signing
   - Never connected to any network
   - Physical security required

---

## DNS & Public Endpoints

### Domain Configuration

**Domain:** nacho.builders  
**Registrar:** [Your registrar]  
**DNS Provider:** [Your DNS provider]

### DNS Records

| Type | Name | Value | TTL |
|------|------|-------|-----|
| A | @ | [Your WAN IP] | 3600 |
| A | nacho.builders | [Your WAN IP] | 3600 |
| A | api | [Your WAN IP] | 3600 |
| A | app | [Your WAN IP] | 3600 |
| A | www | [Your WAN IP] | 3600 |
| TXT | @ | Pool metadata hash | 3600 |

### Public Endpoints

#### Cardano P2P Endpoints
- `nacho.builders:6001` → Relay 1 (192.168.160.11:6000)
- `nacho.builders:6002` → Relay 2 (192.168.160.12:6000)

#### API Service Endpoints
- `https://api.nacho.builders` → Kong Gateway (192.168.170.10:8000)
  - `/v1/ogmios` - Ogmios WebSocket API
  - `/v1/submit` - Transaction submission API
  - `/v1/graphql` - GraphQL API (future)

#### Web Application
- `https://app.nacho.builders` → Next.js App (192.168.170.10:3000)
  - User dashboard
  - API key management
  - Billing and credits
  - Usage analytics

#### Internal Management URLs
- `http://192.168.160.2:3000` - Grafana
- `http://192.168.160.2:9090` - Prometheus
- `http://192.168.170.10:8404` - HAProxy Stats
- `http://192.168.150.224:81` - Nginx Proxy Manager Admin
- `https://192.168.150.222:8006` - Proxmox Web UI

### SSL/TLS Certificates

**Provider:** Let's Encrypt  
**Renewal:** Automatic via Nginx Proxy Manager  
**Domains:**
- api.nacho.builders
- app.nacho.builders
- www.nacho.builders (optional)

---

## Capacity & Performance

### Current Resource Utilization

#### Block Producer
- CPU: 4 vCPU (avg 40% utilization)
- RAM: 16GB (12GB used)
- Disk: 200GB (150GB used)
- Network: 50 Mbps average

#### Relay Nodes (each)
- CPU: 4 vCPU (avg 50% utilization)
- RAM: 16GB (13GB used)
- Disk: 200GB (150GB used)
- Network: 100 Mbps average

#### API Gateway
- CPU: 4 vCPU (avg 20% utilization)
- RAM: 8GB (4GB used)
- Disk: 100GB (40GB used)
- Network: 30 Mbps average

#### Monitoring
- CPU: 2 vCPU (avg 10% utilization)
- RAM: 4GB (2GB used)
- Disk: 100GB (15GB used)
- Prometheus retention: 30 days

### API Performance Metrics

| Metric | Value |
|--------|-------|
| **Average Latency** | 226ms |
| **Requests/sec** | 58.82 |
| **Cache Hit Rate** | 97.5% |
| **Relay Load Reduction** | 97.5% |
| **Uptime** | 99.9%+ |

### Rate Limits

#### FREE Tier
- 100 requests/second
- 100,000 requests/day
- 5 WebSocket connections
- Submit: 10 transactions/hour

#### PAID Tier
- 500 requests/second
- Unlimited requests/day
- 50 WebSocket connections
- Submit: Unlimited

---

## Backup & Disaster Recovery

### Critical Files

#### Cardano Nodes
- `/opt/cardano/cnode/priv/` - Operational certificates
- `/opt/cardano/cnode/files/` - Configuration
- `/opt/cardano/cnode/db/` - Blockchain database (can re-sync)

#### API Platform
- `/opt/cardano-api-service/apps/web/.env` - Environment variables
- `/etc/kong/kong.conf` - Kong configuration
- `/etc/haproxy/haproxy.cfg` - HAProxy configuration
- `/usr/local/share/lua/5.1/kong/plugins/cardano-api-auth/` - Custom plugin
- PostgreSQL databases: `kong`, `cardano_api`, `cexplorer`

#### Infrastructure
- Ansible vault files: `ansible/inventory/group_vars/*/vault.yml`
- Proxmox VM configs: `/etc/pve/qemu-server/*.conf`
- UniFi controller backups

### Backup Strategy

**Daily:**
- PostgreSQL databases (pg_dump)
- Configuration files (/etc/)
- Application data

**Weekly:**
- Full Proxmox VM snapshots
- UniFi controller backup

**Monthly:**
- Off-site backup of critical secrets
- Cold key verification (air-gapped machine)

### Recovery Procedures

#### Relay Node Failure
1. Other relay continues operation (no downtime)
2. Restart failed relay VM
3. Verify sync status
4. Monitor peer connections

**RTO:** 5-15 minutes

#### Block Producer Failure
1. Pool cannot produce blocks (network impact)
2. Restart BP VM
3. Verify hot keys present
4. Verify relay connections
5. Check slot leader schedule

**RTO:** 15-30 minutes

#### API Gateway Failure
1. API service down (user-facing impact)
2. Restart gateway VM or services
3. Verify Kong configuration
4. Verify database connectivity
5. Check SSL certificates

**RTO:** 10-20 minutes

#### Complete Infrastructure Failure
1. Restore Proxmox host or rebuild
2. Restore VM configs from backup
3. Deploy VMs from Ansible playbooks
4. Restore PostgreSQL databases
5. Verify all services operational
6. Update DNS if IP changed

**RTO:** 4-8 hours

---

## Maintenance Windows

### Weekly Tasks
- Review Grafana dashboards
- Check error logs (`journalctl -xe`)
- Monitor API usage patterns
- Review UFW logs for suspicious activity

### Monthly Tasks
- Update Ubuntu packages: `apt update && apt upgrade`
- Rotate KES keys (every 90 days, plan ahead)
- Review and optimize database (VACUUM, ANALYZE)
- Test backup restoration

### Quarterly Tasks
- Review and update firewall rules
- Audit API keys and remove unused
- Update Cardano node version (test on relay first)
- Review capacity and plan scaling

### Annual Tasks
- Renew any paid certificates (Let's Encrypt auto-renews)
- Review and update disaster recovery plan
- Conduct security audit
- Review and optimize infrastructure costs

---

## Troubleshooting Quick Reference

### Common Issues

#### Block Producer not connected to relays
```bash
# On BP, check topology
cat /opt/cardano/cnode/files/topology.json

# Should show only Relay1 and Relay2
# Check connectivity
nc -zv 192.168.160.11 6000
nc -zv 192.168.160.12 6000
```

#### Relay not syncing
```bash
# Check sync status
cardano-cli query tip --mainnet

# Check peer count
sudo journalctl -u cnode -n 100 | grep peers

# Verify Mithril snapshot (if needed)
/opt/cardano/cnode/scripts/mithril-client.sh
```

#### API Gateway 502 Bad Gateway
```bash
# Check Kong status
sudo systemctl status kong

# Check for stale socket
sudo rm -f /usr/local/kong/worker_events.sock
sudo systemctl restart kong

# Check upstream health
curl -s http://localhost:8001/upstreams/ogmios-upstream/health
```

#### Cache not working
```bash
# Check Redis
redis-cli ping  # Should return PONG

# Check cache proxy
curl http://localhost:3001/health
curl http://localhost:3001/stats

# Check cache keys
redis-cli keys 'ogmios:*'
```

#### High CPU on Block Producer
```bash
# Check cardano-node process
top -u cardano

# Check for stuck processes
ps aux | grep cardano

# Review recent logs
sudo journalctl -u cnode -n 200

# Check database size (may need pruning)
du -sh /opt/cardano/cnode/db/
```

---

## Contact & Support

### Internal Documentation
- Architecture Overview: `docs/architecture/overview.md`
- Deployment Guide: `docs/api-service/DEPLOYMENT-GUIDE.md`
- Operations Manual: `docs/operations/`
- Troubleshooting: `docs/runbooks/troubleshooting.md`

### External Resources
- Cardano Docs: https://docs.cardano.org
- Guild Operators: https://cardano-community.github.io/guild-operators/
- Kong Docs: https://docs.konghq.com
- Ogmios Docs: https://ogmios.dev

---

**Document Version:** 1.0  
**Generated:** January 3, 2026  
**Author:** Infrastructure Team  
**Review Date:** April 3, 2026



