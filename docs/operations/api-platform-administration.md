# API Platform Administration Guide
## Cardano API Service - nacho.builders

**Last Updated:** December 30, 2024

---

## Architecture Overview

### Network Topology

```
VLAN 150 (Management)
  └── Nginx Proxy Manager (192.168.150.224)
       └── Routes traffic to VLAN 170

VLAN 170 (API Platform - PUBLIC FACING)
  ├── cardano-gateway (192.168.170.10)
  │    ├── Kong Gateway :8000 (API management)
  │    ├── HAProxy (load balancer)
  │    ├── Next.js App :3000
  │    └── PostgreSQL :5432
  └── cardano-dbsync (192.168.170.20)
       ├── PostgreSQL :5432
       ├── DB-Sync
       └── GraphQL :3100

VLAN 160 (Cardano Backend - PROTECTED)
  ├── cardano-relay1 (192.168.160.11)
  │    ├── Ogmios :1337
  │    ├── Submit API :8090
  │    └── Socket Server :6000
  └── cardano-relay2 (192.168.160.12)
       ├── Ogmios :1337
       └── Submit API :8090
```

---

## Service Management

### Core Services on Relay Nodes (VLAN 160)

#### Ogmios (WebSocket API)

```bash
# Status
sudo systemctl status ogmios

# Start/Stop/Restart
sudo systemctl start ogmios
sudo systemctl stop ogmios
sudo systemctl restart ogmios

# Logs
sudo journalctl -u ogmios -f

# Test
curl http://localhost:1337/health
```

#### Submit API

```bash
# Status
sudo systemctl status cardano-submit-api

# Start/Stop/Restart
sudo systemctl start cardano-submit-api
sudo systemctl stop cardano-submit-api
sudo systemctl restart cardano-submit-api

# Logs
sudo journalctl -u cardano-submit-api -f

# Test
curl http://localhost:8090/health
```

#### Socket Tunnel (relay1 only)

```bash
# Status
sudo systemctl status cardano-socket-server

# Start/Stop/Restart
sudo systemctl start cardano-socket-server
sudo systemctl stop cardano-socket-server
sudo systemctl restart cardano-socket-server

# Logs
sudo journalctl -u cardano-socket-server -f

# Test connection
nc -zv 192.168.160.11 6000
```

---

### Gateway Services (cardano-gateway - 192.168.170.10)

#### Kong Gateway

```bash
# Status
sudo systemctl status kong

# Start/Stop/Restart
sudo systemctl start kong
sudo systemctl stop kong
sudo systemctl restart kong

# Logs
sudo journalctl -u kong -f
tail -f /var/log/kong/error.log
tail -f /var/log/kong/access.log

# Test Admin API
curl http://localhost:8001/

# Test Proxy
curl http://localhost:8000/

# Manual start (troubleshooting)
sudo -u kong kong start -c /etc/kong/kong.conf --v

# Clean restart (if stuck)
sudo -u kong kong stop
sudo pkill -9 nginx
sudo rm -f /usr/local/kong/pids/*.pid
sudo systemctl start kong
```

#### Kong Admin Commands

```bash
# List services
curl http://localhost:8001/services

# List routes
curl http://localhost:8001/routes

# List plugins
curl http://localhost:8001/plugins

# Check Kong configuration
sudo -u kong kong config -c /etc/kong/kong.conf
```

#### HAProxy

```bash
# Status
sudo systemctl status haproxy

# Start/Stop/Restart
sudo systemctl start haproxy
sudo systemctl stop haproxy
sudo systemctl restart haproxy

# Reload config (no downtime)
sudo systemctl reload haproxy

# Logs
sudo journalctl -u haproxy -f

# Stats page
curl http://localhost:8404/stats

# Test config
sudo haproxy -c -f /etc/haproxy/haproxy.cfg
```

#### PostgreSQL (Gateway)

```bash
# Status
sudo systemctl status postgresql

# Start/Stop/Restart
sudo systemctl start postgresql
sudo systemctl stop postgresql
sudo systemctl restart postgresql

# Connect to databases
sudo -u postgres psql -d kong
sudo -u postgres psql -d cardano_api

# List databases
sudo -u postgres psql -c "\l"

# Backup Kong database
sudo -u postgres pg_dump kong > /backup/kong_$(date +%Y%m%d).sql

# Restore Kong database
sudo -u postgres psql kong < /backup/kong_backup.sql
```

---

### DB-Sync Services (cardano-dbsync - 192.168.170.20)

#### DB-Sync

```bash
# Status
sudo systemctl status cardano-db-sync

# Start/Stop/Restart
sudo systemctl start cardano-db-sync
sudo systemctl stop cardano-db-sync
sudo systemctl restart cardano-db-sync

# Logs (watch sync progress)
sudo journalctl -u cardano-db-sync -f

# Check sync progress
PGPASSWORD=changeme psql -h localhost -U dbsync -d dbsync -c "
SELECT 
    slot_no, 
    epoch_no, 
    block_no,
    time
FROM block 
ORDER BY id DESC 
LIMIT 1;"

# Compare to tip (from relay)
cardano-cli query tip --mainnet
```

#### Socket Tunnel (to relay1)

```bash
# Status
sudo systemctl status cardano-socket-tunnel

# Start/Stop/Restart
sudo systemctl start cardano-socket-tunnel
sudo systemctl stop cardano-socket-tunnel
sudo systemctl restart cardano-socket-tunnel

# Test
nc -zv 192.168.160.11 6100
ls -la /var/run/cardano/node.socket

# Verify data flow
echo "test" | socat - UNIX-CONNECT:/var/run/cardano/node.socket
```

**Important Configuration Notes:**
- Socket location: `/var/run/cardano/node.socket` (not /tmp)
- Remote port: `6100` (not 6000 - conflicts with P2P)
- socat params: No `unlink-early` (causes socket disappearance)
- Service must run without `PrivateTmp=true` for socket access

#### GraphQL (Hasura)

```bash
# Status
cd /opt/cardano-graphql
docker-compose ps

# Start/Stop/Restart
docker-compose up -d
docker-compose down
docker-compose restart

# Logs
docker-compose logs -f

# Test
curl http://localhost:3100/graphql
```

#### PostgreSQL (DB-Sync)

```bash
# Status
sudo systemctl status postgresql

# Connect to DB-Sync database
PGPASSWORD=changeme psql -h localhost -U dbsync -d dbsync

# Check database size
sudo -u postgres psql -d dbsync -c "
SELECT pg_size_pretty(pg_database_size('dbsync'));"

# Check table sizes
sudo -u postgres psql -d dbsync -c "
SELECT 
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
LIMIT 10;"

# Backup DB-Sync database
sudo -u postgres pg_dump dbsync > /backup/dbsync_$(date +%Y%m%d).sql
```

---

## Monitoring and Health Checks

### Quick Health Check Script

```bash
#!/bin/bash
# Save as: /usr/local/bin/api-health-check

echo "=== Cardano API Platform Health Check ==="
echo

echo "--- Relay Services ---"
ssh michael@192.168.160.11 "systemctl is-active ogmios cardano-submit-api cardano-socket-server"
ssh michael@192.168.160.12 "systemctl is-active ogmios cardano-submit-api"

echo
echo "--- Gateway Services ---"
ssh michael@192.168.170.10 "systemctl is-active kong haproxy postgresql"

echo
echo "--- DB-Sync Services ---"
ssh michael@192.168.170.20 "systemctl is-active cardano-db-sync postgresql cardano-socket-tunnel"

echo
echo "--- Kong API Test ---"
curl -s http://192.168.170.10:8001/ | jq -r .tagline

echo
echo "--- HAProxy Stats ---"
curl -s http://192.168.170.10:8404/stats | grep -A2 "ogmios"

echo
echo "Done!"
```

### Grafana Dashboards

Access: http://192.168.160.2:3000

**Dashboards:**
- Technical Operations Dashboard - API performance metrics
- Business Analytics Dashboard - Revenue and usage metrics

**Key Metrics to Watch:**
- Requests per second
- Response times (P50, P95, P99)
- Error rates
- DB-Sync sync progress
- Kong upstream health

---

## Troubleshooting

### Ogmios Not Responding

```bash
# Check if cardano-node is running
sudo systemctl status cnode

# Check node socket exists
ls -la /opt/cardano/cnode/sockets/node.socket

# Restart Ogmios
sudo systemctl restart ogmios

# Check logs for errors
sudo journalctl -u ogmios -n 100
```

### Kong Not Starting

```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test database connection
PGPASSWORD=changeme psql -h localhost -U kong -d kong -c "SELECT version();"

# Clean start Kong
sudo -u kong kong stop
sudo pkill -9 nginx
sudo rm -f /usr/local/kong/pids/*.pid
sudo systemctl start kong

# Check for port conflicts
sudo netstat -tlnp | grep -E ":(8000|8001)"
```

### HAProxy Backend Down

```bash
# Check backend status
echo "show stat" | sudo socat stdio /var/run/haproxy/admin.sock | grep ogmios

# Test backends directly
curl http://192.168.160.11:1337/health
curl http://192.168.160.12:1337/health

# Reload HAProxy config
sudo systemctl reload haproxy
```

### DB-Sync Not Syncing

```bash
# Check socket tunnel is working
sudo systemctl status cardano-socket-tunnel
ls -la /var/run/cardano/node.socket

# Check DB-Sync logs
sudo journalctl -u cardano-db-sync -n 100

# Check database connectivity
PGPASSWORD=changeme psql -h localhost -U dbsync -d dbsync -c "\dt"

# Check current sync progress
PGPASSWORD=changeme psql -h localhost -U dbsync -d dbsync -c \
  "SELECT block_no, epoch_no, time FROM block ORDER BY id DESC LIMIT 1;"

# Restart DB-Sync
sudo systemctl restart cardano-db-sync
```

**CRITICAL FIX: Socket Connection Issues**

If DB-Sync shows connection errors like:
```
Network.Socket.connect: does not exist (No such file or directory)
```

**The fix involves three key changes:**

1. **Remove `unlink-early` from Socket Tunnel**
   - **Problem:** Causes socket file to disappear during connections
   - **Fix:** Edit `/etc/systemd/system/cardano-socket-tunnel.service`
   ```systemd
   # Before (broken):
   ExecStart=/usr/bin/socat UNIX-LISTEN:/tmp/node.socket,fork,reuseaddr,unlink-early TCP:192.168.160.11:6100
   
   # After (working):
   ExecStart=/usr/bin/socat UNIX-LISTEN:/var/run/cardano/node.socket,fork,reuseaddr TCP:192.168.160.11:6100
   ```

2. **Disable PrivateTmp in DB-Sync Service**
   - **Problem:** PrivateTmp isolates /tmp, preventing socket access
   - **Fix:** Edit `/etc/systemd/system/cardano-db-sync.service`
   ```systemd
   [Service]
   # Comment out or remove this line:
   # PrivateTmp=true
   ```

3. **Use Persistent Socket Location**
   - **Problem:** /tmp is ephemeral and isolated by systemd
   - **Fix:** Use `/var/run/cardano/node.socket` instead
   ```bash
   # Create socket directory
   sudo mkdir -p /var/run/cardano
   sudo chown cardano:cardano /var/run/cardano
   
   # Update DB-Sync service socket path
   ExecStart=/usr/local/bin/cardano-db-sync \
     --socket-path /var/run/cardano/node.socket \
     [...]
   ```

**Apply the fix:**
```bash
# On cardano-dbsync VM
sudo systemctl daemon-reload
sudo systemctl restart cardano-socket-tunnel
sleep 3
sudo systemctl restart cardano-db-sync

# Verify it's syncing
sudo journalctl -u cardano-db-sync -f | grep "Insert.*Block"
```

**Note:** Socket tunnel connects to relay1 on **port 6100** (not 6000, which conflicts with cardano-node P2P)

### High Memory Usage

```bash
# Check memory on each VM
free -h

# Top processes by memory
top -o %MEM

# DB-Sync typically uses 20-30GB RAM
# PostgreSQL uses 8-16GB RAM
# Kong/HAProxy use minimal RAM

# If DB-Sync VM is low on memory, consider:
# 1. Reducing PostgreSQL shared_buffers
# 2. Adding swap space
# 3. Increasing VM RAM allocation
```

---

## Backup and Recovery

### Daily Backup Script

```bash
#!/bin/bash
# Save as: /usr/local/bin/api-platform-backup
# Run daily via cron: 0 2 * * * /usr/local/bin/api-platform-backup

BACKUP_DIR="/backup/api-platform"
DATE=$(date +%Y%m%d)

mkdir -p $BACKUP_DIR

# Backup Kong database
ssh michael@192.168.170.10 "sudo -u postgres pg_dump kong" > $BACKUP_DIR/kong_${DATE}.sql

# Backup API app database
ssh michael@192.168.170.10 "sudo -u postgres pg_dump cardano_api" > $BACKUP_DIR/cardano_api_${DATE}.sql

# Backup configurations
ssh michael@192.168.170.10 "sudo tar -czf - /etc/kong /etc/haproxy" > $BACKUP_DIR/configs_${DATE}.tar.gz

# Keep only last 7 days
find $BACKUP_DIR -name "*.sql" -mtime +7 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +7 -delete

echo "Backup complete: $DATE"
```

### Restore Procedures

**Kong Database:**
```bash
# Stop Kong
sudo systemctl stop kong

# Restore database
sudo -u postgres psql kong < /backup/kong_backup.sql

# Start Kong
sudo systemctl start kong
```

**Configurations:**
```bash
# Extract backup
sudo tar -xzf /backup/configs_backup.tar.gz -C /

# Restart services
sudo systemctl restart kong haproxy
```

---

## Performance Tuning

### PostgreSQL (Gateway)

Edit `/etc/postgresql/15/main/postgresql.conf`:

```ini
# For 8GB RAM VM
shared_buffers = 2GB
effective_cache_size = 6GB
maintenance_work_mem = 512MB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 10MB
min_wal_size = 1GB
max_wal_size = 4GB
```

### PostgreSQL (DB-Sync)

Edit `/etc/postgresql/15/main/postgresql.conf`:

```ini
# For 32GB RAM VM
shared_buffers = 8GB
effective_cache_size = 24GB
maintenance_work_mem = 2GB
checkpoint_completion_target = 0.9
wal_buffers = 16MB
default_statistics_target = 100
random_page_cost = 1.1
effective_io_concurrency = 200
work_mem = 128MB
min_wal_size = 2GB
max_wal_size = 8GB
max_worker_processes = 8
max_parallel_workers_per_gather = 4
max_parallel_workers = 8
```

### Kong Performance

Edit `/etc/kong/kong.conf`:

```ini
# Increase worker connections
nginx_worker_processes = auto
nginx_events_worker_connections = 4096

# Increase ulimits
# Add to /etc/systemd/system/kong.service:
LimitNOFILE=65536
```

---

## Security Maintenance

### Regular Security Tasks

**Weekly:**
- Review Kong access logs for suspicious activity
- Check firewall rules are still in place
- Verify Block Producer has no access to VLAN 170

**Monthly:**
- Update system packages on all VMs
- Rotate database passwords
- Review API key usage patterns

**Every 90 Days:**
- KES key rotation (existing Cardano node maintenance)
- Review and update Kong plugins
- Security audit of exposed endpoints

### Update Packages

```bash
# Update API platform VMs
ansible-playbook ansible/playbooks/99-update-nodes.yml --limit api_platform

# Or manually on each VM
sudo apt update && sudo apt upgrade -y
```

### Rotate Passwords

```bash
# Kong database password
sudo -u postgres psql -c "ALTER USER kong WITH PASSWORD 'new_password';"
# Update /etc/kong/kong.conf
# Restart Kong

# DB-Sync password
sudo -u postgres psql -c "ALTER USER dbsync WITH PASSWORD 'new_password';"
# Update /opt/cardano-db-sync/config/pgpass
# Restart cardano-db-sync
```

---

## Scaling Considerations

### When to Scale

- Consistently hitting 80% of rate limits
- Response times > 500ms regularly
- DB-Sync queries slow (>1s)
- Kong CPU usage > 70%

### Scaling Options

1. **Add Third Relay** - More Ogmios backends
2. **Upgrade VMs** - More CPU/RAM for gateway/dbsync
3. **PostgreSQL Read Replicas** - For GraphQL queries
4. **CDN** - CloudFlare for static assets
5. **Geographic Distribution** - Relays in multiple regions

---

## Maintenance Windows

### Recommended Maintenance Schedule

**Best Time:** Tuesday-Thursday, 2-4 AM UTC (lowest traffic)

**Before Maintenance:**
1. Announce on status page
2. Backup all databases
3. Test in staging (if available)
4. Have rollback plan ready

**During Maintenance:**
1. Monitor Grafana dashboards
2. Check error rates
3. Test critical endpoints
4. Verify all services restart correctly

**After Maintenance:**
1. Monitor for 1 hour
2. Check logs for errors
3. Verify metrics return to normal
4. Update documentation

---

## Emergency Contacts

**Infrastructure Issues:**
- Michael Jones (you)

**Monitoring:**
- Grafana: http://192.168.160.2:3000
- Prometheus: http://192.168.160.2:9090

**Documentation:**
- This file: `docs/operations/api-platform-administration.md`
- Deployment guide: `docs/api-service/DEPLOYMENT-GUIDE.md`
- Architecture: `docs/architecture/overview.md`

---

## Quick Reference Commands

```bash
# Check all services
ansible api_platform,cardano_relays -m shell -a "systemctl is-active ogmios kong haproxy cardano-db-sync"

# Restart all API services
ssh michael@192.168.170.10 "sudo systemctl restart kong haproxy"
ssh michael@192.168.170.20 "sudo systemctl restart cardano-db-sync"

# View all logs
ssh michael@192.168.170.10 "sudo journalctl -u kong -u haproxy -f"
ssh michael@192.168.170.20 "sudo journalctl -u cardano-db-sync -f"
ssh michael@192.168.160.11 "sudo journalctl -u ogmios -u cardano-submit-api -f"

# Emergency stop all
ansible api_platform -m shell -a "systemctl stop kong haproxy cardano-db-sync" --become

# Emergency start all
ansible api_platform -m shell -a "systemctl start kong haproxy cardano-db-sync" --become
```

---

**End of Administration Guide**

