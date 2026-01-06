# Cardano API Service Platform
## Nacho Builders - QuickNode for Cardano

---

## 📋 Project Overview

A comprehensive Cardano-as-a-Service platform providing:
- **Ogmios WebSocket API** - Real-time chain queries
- **Submit API** - Transaction submission
- **GraphQL** - Rich blockchain data queries
- **Pay-as-you-go pricing** with ADA
- **SSO authentication** (Google, Microsoft, Email)

---

## 🏗️ Architecture

### Network Topology

```
VLAN 150 (Management)
  └── Nginx Proxy Manager (192.168.150.224)
       └── ens20 → VLAN 170

VLAN 170 (API Platform)
  ├── cardano-gateway (192.168.170.10)
  │    ├── Kong Gateway :8000
  │    ├── HAProxy (load balancer)
  │    ├── Next.js App :3000
  │    └── PostgreSQL :5432
  └── cardano-dbsync (192.168.170.20)
       ├── DB-Sync + PostgreSQL
       └── GraphQL :3100

VLAN 160 (Cardano Backend - PROTECTED)
  ├── cardano-relay1 (192.168.160.11)
  │    ├── Ogmios :1337
  │    ├── Submit API :8090
  │    └── Socket server :6000
  └── cardano-relay2 (192.168.160.12)
       ├── Ogmios :1337
       └── Submit API :8090
```

### Security Design

✅ API platform isolated on VLAN 170  
✅ Explicit firewall rules for inter-VLAN traffic  
✅ Block Producer completely isolated (no VLAN 170 access)  
✅ TLS termination at NPM (single point)  
✅ API key authentication via Kong  
✅ Rate limiting per tier  

---

## 📦 What's Been Created

### Infrastructure Scripts

| File | Purpose |
|------|---------|
| `scripts/add-npm-vlan170-adapter.sh` | Add VLAN 170 to NPM VM |
| `scripts/create-api-platform-vms.sh` | Create gateway & dbsync VMs |

### Ansible Playbooks

| File | Purpose |
|------|---------|
| `playbooks/06-install-ogmios.yml` | Install Ogmios + Submit API on relays |
| `playbooks/07-setup-dbsync.yml` | Setup PostgreSQL + DB-Sync + GraphQL |
| `playbooks/08-setup-gateway.yml` | Setup Kong + HAProxy + Node.js |
| `playbooks/09-extend-monitoring.yml` | Extend Prometheus for API metrics |

### Web Application

| Component | Status |
|-----------|--------|
| Turborepo monorepo | ✅ Initialized |
| Next.js 14 app | ✅ Created |
| Prisma schema (2-tier) | ✅ Complete |
| NextAuth SSO | ✅ Configured |
| Dark premium theme | ✅ Implemented |
| Landing page | ✅ Built |
| Dashboard | ✅ Built |
| API keys management | ✅ Built |
| Usage analytics | ✅ Built |
| Billing & credits | ✅ Built |
| ADA wallet integration | ✅ Implemented |

### Monitoring

| Dashboard | Status |
|-----------|--------|
| Technical Operations | ✅ Created |
| Business Analytics | ✅ Created |
| Alert rules | ✅ Defined |
| Prometheus config | ✅ Updated |

### Documentation

| Document | Purpose |
|----------|---------|
| `phase1-network-setup.md` | UniFi & Proxmox network config |
| `npm-proxy-configuration.md` | NPM setup guide |
| `DEPLOYMENT-GUIDE.md` | Complete deployment walkthrough |
| `api-reference.md` | API documentation |

---

## 🚀 Quick Start

### For Infrastructure Setup

1. **Network (Day 1):**
   ```bash
   # Follow docs/api-service/phase1-network-setup.md
   # Create VLAN 170 in UniFi
   # Add ens20 to NPM
   # Create VMs 120 & 121
   ```

2. **Backend Services (Days 2-3):**
   ```bash
   cd ansible
   ansible-playbook playbooks/06-install-ogmios.yml
   ansible-playbook playbooks/07-setup-dbsync.yml
   ansible-playbook playbooks/08-setup-gateway.yml
   ```

3. **Deploy App (Days 4-5):**
   ```bash
   cd cardano-api-service/apps/web
   pnpm install
   pnpm build
   pm2 start npm --name api-web -- start
   ```

4. **Configure Monitoring (Day 6):**
   ```bash
   ansible-playbook playbooks/09-extend-monitoring.yml
   # Import Grafana dashboards
   ```

### For Development

```bash
cd cardano-api-service
pnpm install
pnpm dev
```

Access at:
- Web app: http://localhost:3000
- API docs: http://localhost:3001

---

## 💰 Pricing Structure

| Tier | Credits | Rate Limit | Price |
|------|---------|------------|-------|
| Free | 10k/month | 10 req/sec | Free |
| Paid | Buy as needed | 100 req/sec | 5-75 ADA |

### Credit Packages

- **Small:** 50k credits = 5 ADA
- **Medium:** 200k credits = 18 ADA (+10% bonus) 🔥
- **Large:** 500k credits = 40 ADA (+15% bonus)
- **Bulk:** 1M credits = 75 ADA (+20% bonus)

---

## 📊 Monitoring

**Grafana:** http://192.168.160.2:3000

### Dashboards

1. **Technical Operations** - API performance, infrastructure health
2. **Business Analytics** - Revenue, users, conversion metrics

### Key Metrics

- Requests per second
- Response times (P50, P95, P99)
- Error rates
- Credit consumption
- Revenue (ADA)
- User growth

---

## 🔧 Maintenance

### Regular Tasks

- **Daily:** Check Grafana dashboards, review logs
- **Weekly:** Analyze usage patterns, check for abuse
- **Monthly:** Review pricing, plan infrastructure scaling
- **Every 90 days:** KES key rotation (existing process)

### Backup Schedule

- **Database:** Daily automated backups
- **Configurations:** Weekly snapshots
- **Application:** Continuous deployment from git

---

## 📈 Success Metrics

### Technical KPIs

- 99.9% uptime
- < 100ms P95 response time
- < 1% error rate
- DB-Sync < 10 blocks behind

### Business KPIs

- 20% Free → Paid conversion
- $500+ MRR within 3 months
- 100+ active users within 6 months
- 1M+ API calls/month

---

## 🛠️ Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, React 18, TypeScript |
| Styling | Tailwind CSS (dark premium theme) |
| Auth | NextAuth.js v5 |
| Database | PostgreSQL 15 + Prisma ORM |
| API Gateway | Kong Gateway 3.5 |
| Load Balancer | HAProxy 2.8 |
| Monitoring | Prometheus + Grafana |
| Payments | Cardano (CIP-30 wallets) |
| Backend | Ogmios, Submit API, DB-Sync, GraphQL |

---

## 📞 Support

- **Email:** support@nacho.builders
- **Documentation:** https://docs.nacho.builders
- **Status:** https://status.nacho.builders

---

**Project Status:** ✅ Implementation Complete - Ready for Deployment

**Total Implementation Time:** ~3-4 weeks for full deployment including DB-Sync sync

**Next Step:** Follow [`DEPLOYMENT-GUIDE.md`](DEPLOYMENT-GUIDE.md) to deploy




