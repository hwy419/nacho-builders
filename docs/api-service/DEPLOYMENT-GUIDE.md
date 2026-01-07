# Cardano API Service - Complete Deployment Guide

This guide walks you through deploying the complete Cardano API Service Platform from start to finish.

---

## Prerequisites Checklist

- [ ] Proxmox VE 8.2+ running
- [ ] UniFi Dream Router with controller access
- [ ] Existing Cardano relay nodes operational on VLAN 160
- [ ] Nginx Proxy Manager running on VLAN 150
- [ ] Domain name (nacho.builders) with DNS access
- [ ] SSH access to all infrastructure

---

## Phase 1: Network Infrastructure (Day 1)

### Step 1.1: Create VLAN 170 in UniFi

Follow: [`docs/api-service/phase1-network-setup.md`](phase1-network-setup.md)

**Actions:**
1. Create VLAN 170 (API-Platform) in UniFi Controller
2. Configure firewall rules for inter-VLAN traffic
3. Verify VLAN is active: `ping 192.168.170.1`

### Step 1.2: Add ens20 to Nginx Proxy Manager

**Run on Proxmox host:**

```bash
cd /Users/michaeljones/claudecode/cardano-spo/scripts
./add-npm-vlan170-adapter.sh
```

**Then SSH to NPM and configure:**

```bash
ssh <user>@192.168.150.224
sudo nano /etc/netplan/00-installer-config.yaml
# Add ens20 configuration as shown in phase1-network-setup.md
sudo netplan apply
ping 192.168.170.1
```

### Step 1.3: Create API Platform VMs

**Run on Proxmox host:**

```bash
cd /Users/michaeljones/claudecode/cardano-spo/scripts
./create-api-platform-vms.sh
```

**Install Ubuntu on each VM:**
- VM 120 (cardano-gateway): 192.168.170.10/24
- VM 121 (cardano-dbsync): 192.168.170.20/24

### Step 1.4: Configure NPM Proxy Hosts

Follow: [`docs/api-service/npm-proxy-configuration.md`](npm-proxy-configuration.md)

Add proxy hosts for:
- api.nacho.builders → 192.168.170.10:8000
- app.nacho.builders → 192.168.170.10:3000

---

## Phase 2: Backend Services (Days 2-3)

### Step 2.1: Bootstrap New VMs

```bash
cd /Users/michaeljones/claudecode/cardano-spo/ansible
ansible-playbook playbooks/00-bootstrap.yml --limit api_platform
ansible-playbook playbooks/01-harden.yml --limit api_platform
```

### Step 2.2: Install Ogmios + Submit API on Relays

```bash
ansible-playbook playbooks/06-install-ogmios.yml
```

**Verify:**

```bash
# SSH to relay1
ssh michael@192.168.160.11

# Check services
sudo systemctl status ogmios
sudo systemctl status cardano-submit-api
sudo systemctl status cardano-socket-server  # Socket tunnel for DB-Sync

# Test endpoints
curl http://localhost:1337/health
curl http://localhost:8090/health
```

### Step 2.3: Setup DB-Sync

```bash
ansible-playbook playbooks/07-setup-dbsync.yml
```

**Start DB-Sync (manual):**

```bash
# SSH to DB-Sync VM
ssh michael@192.168.170.20

# Verify socket tunnel is working
ls -la /tmp/node.socket

# Start DB-Sync (initial sync takes 24-48 hours)
sudo systemctl start cardano-db-sync

# Monitor progress
sudo journalctl -u cardano-db-sync -f
```

### Step 2.4: Setup API Gateway

```bash
ansible-playbook playbooks/08-setup-gateway.yml
```

**Verify:**

```bash
# SSH to gateway
ssh michael@192.168.170.10

# Check services
sudo systemctl status kong
sudo systemctl status haproxy
sudo systemctl status postgresql

# Test Kong
curl http://localhost:8001/status

# Test HAProxy
curl http://localhost:8404  # HAProxy stats
```

---

## Phase 3: Web Application (Days 4-5)

### Step 3.1: Deploy Application

```bash
cd /Users/michaeljones/claudecode/cardano-spo/cardano-api-service/apps/web

# Install dependencies
pnpm install

# Setup database
cp .env.example .env
# Edit .env with production values

# Run migrations
pnpm db:push

# Build application
pnpm build

# Start with PM2 (production)
pm2 start npm --name "cardano-api-web" -- start
pm2 save
pm2 startup
```

### Step 3.2: Configure DNS

Add DNS A records:
- api.nacho.builders → [Your WAN IP]
- app.nacho.builders → [Your WAN IP]

**Test:**

```bash
dig api.nacho.builders +short
dig app.nacho.builders +short
```

### Step 3.3: Request SSL Certificates

NPM will automatically request Let's Encrypt certificates when you add the proxy hosts.

**Verify HTTPS works:**

```bash
curl -I https://api.nacho.builders
curl -I https://app.nacho.builders
```

---

## Phase 4: Monitoring (Day 6)

### Step 4.1: Extend Prometheus

```bash
ansible-playbook playbooks/09-extend-monitoring.yml
```

### Step 4.2: Import Grafana Dashboards

1. Open Grafana: http://192.168.160.2:3000
2. Go to Dashboards → Import
3. Upload `docs/grafana/technical-operations-dashboard.json`
4. Upload `docs/grafana/business-analytics-dashboard.json`

### Step 4.3: Configure Alerts

1. In Grafana, go to Alerting → Alert rules
2. Import alert rules from `docs/grafana/alert-rules.yml`
3. Configure notification channels (email, Slack, etc.)

---

## Phase 5: Testing and Launch (Day 7)

### Step 5.1: End-to-End Testing

**Test Free Tier:**
1. Sign up at https://app.nacho.builders
2. Get default API key
3. Test Ogmios connection
4. Test Submit API
5. Verify usage tracking

**Test Paid Tier:**
1. Connect Cardano wallet
2. Purchase credits (test with small amount)
3. Test GraphQL access
4. Verify credits deducted
5. Test webhooks

### Step 5.2: Performance Testing

```bash
# Load test Ogmios endpoint
ab -n 1000 -c 10 -H "apikey: test_key" \
  https://api.nacho.builders/v1/ogmios

# Monitor in Grafana during test
```

### Step 5.3: Launch Checklist

- [ ] All services running and healthy
- [ ] SSL certificates valid
- [ ] DNS propagated
- [ ] Monitoring dashboards working
- [ ] Alerts configured
- [ ] Test transactions submitted successfully
- [ ] Payment flow tested
- [ ] Documentation published
- [ ] Status page created

---

## Post-Launch Operations

### Daily Tasks

- Check Grafana dashboards
- Review error logs
- Monitor DB-Sync sync status

### Weekly Tasks

- Review usage patterns
- Check for abuse
- Update credit pricing if needed

### Monthly Tasks

- Review and optimize infrastructure
- Analyze user feedback
- Plan feature additions

---

## Troubleshooting

### Ogmios Not Responding

```bash
# Check service
sudo systemctl status ogmios

# Check logs
sudo journalctl -u ogmios -n 100

# Verify node socket
ls -la /opt/cardano/cnode/sockets/node.socket
```

### Kong Not Routing Requests

```bash
# Check Kong status
curl http://localhost:8001/status

# List services
curl http://localhost:8001/services

# List routes
curl http://localhost:8001/routes

# Check HAProxy backends
echo "show stat" | socat stdio /run/haproxy/admin.sock
```

### DB-Sync Not Syncing

```bash
# Check socket tunnel
sudo systemctl status cardano-socket-tunnel

# Test connection to relay1
nc -zv 192.168.160.11 6000

# Check DB-Sync logs
sudo journalctl -u cardano-db-sync -n 100
```

### Payment Not Confirming

```bash
# Check payment monitoring service
# Check Ogmios connection
# Verify payment address has funds using explorer
```

---

## Backup Strategy

### Critical Files

- `/etc/kong/kong.conf`
- `/etc/haproxy/haproxy.cfg`
- Database backups (PostgreSQL)
- Application `.env` file
- NPM proxy host configurations

### Backup Script

```bash
#!/bin/bash
# Run daily via cron

# Backup databases
pg_dump cardano_api > /backup/cardano_api_$(date +%Y%m%d).sql
pg_dump kong > /backup/kong_$(date +%Y%m%d).sql

# Backup configurations
tar -czf /backup/configs_$(date +%Y%m%d).tar.gz \
  /etc/kong \
  /etc/haproxy \
  /opt/cardano-db-sync/config
```

---

## Scaling Considerations

### When to Scale

- Consistently hitting 80% of rate limits
- Response times > 500ms regularly
- DB-Sync queries slow (>1s)
- Running out of credits frequently

### Scaling Options

1. **Add Third Relay** - More Ogmios backends
2. **Upgrade VMs** - More CPU/RAM for gateway/dbsync
3. **Read Replicas** - PostgreSQL read replicas for GraphQL
4. **CDN** - CloudFlare for static assets
5. **Geographic Distribution** - Relays in multiple regions

---

## Support and Resources

- **Documentation:** https://docs.nacho.builders
- **Status Page:** https://status.nacho.builders
- **Support Email:** support@nacho.builders
- **GitHub:** https://github.com/nacho-builders/cardano-api

**Estimated Total Deployment Time:** 5-7 days (including DB-Sync initial sync)

---

**Last Updated:** December 30, 2024





