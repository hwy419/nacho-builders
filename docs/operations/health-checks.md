# Health Check Scripts
## Cardano SPO Infrastructure Monitoring

This document describes the health check scripts available for monitoring your Cardano stake pool infrastructure after system maintenance, power outages, or regular operational checks.

---

## Quick Health Check Script

**Location:** `scripts/quick-health-check.sh`

### Purpose
A fast, lightweight script that checks essential services across your Cardano infrastructure. Perfect for quick status checks after system reboots or power outages.

### Usage
```bash
cd ~/claudecode/cardano-spo
./scripts/quick-health-check.sh
```

### What It Checks
1. **Cardano Nodes**
   - SSH connectivity to all nodes
   - `cnode` service status on Block Producer and Relays
   
2. **API Services**
   - Ogmios on both relays
   - Submit API on Relay 1
   
3. **Monitoring Stack**
   - Prometheus service
   - Grafana service
   - Grafana web UI accessibility
   
4. **DB-Sync**
   - PostgreSQL database
   - Socket tunnel service
   - DB-Sync service
   
5. **Sync Status**
   - Shows sync percentage for all nodes
   - Current block height for DB-Sync

### Sample Output
```
=== Cardano SPO Quick Health Check ===
Timestamp: 2025-12-30 22:58:14

Cardano Nodes:
Checking Block Producer connectivity... ✓ OK
Checking Block Producer service... ✓ OK
Checking Relay 1 connectivity... ✓ OK
Checking Relay 1 service... ✓ OK
Checking Relay 2 connectivity... ✓ OK
Checking Relay 2 service... ✓ OK

API Services:
Checking Ogmios on Relay 1... ✓ OK
Checking Ogmios on Relay 2... ✓ OK
Checking Submit API on Relay 1... ✓ OK

Monitoring:
Checking Prometheus... ✓ OK
Checking Grafana... ✓ OK
Checking Grafana Web UI... ✓ OK

DB-Sync:
Checking DB-Sync connectivity... ✓ OK
Checking PostgreSQL... ✓ OK
Checking Socket tunnel... ✓ OK
Checking DB-Sync service... ✓ OK

Sync Status:
  Block Producer: 100.00%
  Relay 1: 100.00%
  Relay 2: 100.00%
  DB-Sync blocks: 364,291

Health check complete!
```

---

## Comprehensive Health Check Script

**Location:** `scripts/health-check.sh`

### Purpose
A thorough health check that performs deep validation of all components, including:
- Network topology verification
- Peer connection counts
- API endpoint testing
- Detailed service status
- Performance metrics

### Usage
```bash
cd ~/claudecode/cardano-spo
./scripts/health-check.sh
```

### Features
- Color-coded output for easy reading
- Detailed error reporting
- Summary report with failure count
- Exit codes for automation (0 = success, 1 = failures detected)

---

## Manual Health Checks

### Check Individual Node Status
```bash
# Check Block Producer
ssh michael@192.168.160.10 "sudo systemctl status cnode"

# Check sync status
ssh michael@192.168.160.10 "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket"
```

### Check API Endpoints
```bash
# Ogmios health check
curl http://192.168.160.11:1337/health

# Submit API (currently localhost only)
ssh michael@192.168.160.11 "curl http://localhost:8090/api/v1/health"
```

### Check Monitoring
```bash
# Grafana dashboard
open http://192.168.160.2:3000

# Prometheus targets
open http://192.168.160.2:9090/targets
```

### Check DB-Sync Progress
```bash
ssh michael@192.168.170.20 "sudo -u postgres psql -d dbsync -c 'SELECT MAX(block_no) as current_block, MAX(epoch_no) as epoch FROM block;'"
```

---

## Automated Monitoring

### Using with Cron
Add to your crontab for regular health checks:
```bash
# Run quick health check every hour
0 * * * * /home/michael/claudecode/cardano-spo/scripts/quick-health-check.sh >> /var/log/cardano-health.log 2>&1

# Run comprehensive check daily at 2 AM
0 2 * * * /home/michael/claudecode/cardano-spo/scripts/health-check.sh >> /var/log/cardano-health-full.log 2>&1
```

### Integration with Alerting
The scripts return exit codes that can trigger alerts:
- Exit code 0: All systems operational
- Exit code 1: One or more failures detected

Example with email alerting:
```bash
#!/bin/bash
if ! /home/michael/claudecode/cardano-spo/scripts/quick-health-check.sh; then
    echo "Cardano infrastructure issues detected" | mail -s "ALERT: Cardano Health Check Failed" your-email@example.com
fi
```

---

## Post-Power Outage Checklist

After a power outage, run these checks in order:

1. **Network Infrastructure**
   ```bash
   # Check if all VMs are running (from Proxmox host)
   pvesh get /nodes/eth-node/qemu --output-format json | jq '.[] | select(.vmid >= 111 and .vmid <= 113) | {vmid, name, status}'
   ```

2. **Run Quick Health Check**
   ```bash
   ./scripts/quick-health-check.sh
   ```

3. **Check Node Connections**
   ```bash
   # Check peer counts
   for host in 192.168.160.10 192.168.160.11 192.168.160.12; do
       echo "=== Node $host ==="
       ssh michael@$host "ss -tn state established '( sport = :6000 )' | grep -v Local | wc -l"
   done
   ```

4. **Verify Monitoring**
   - Access Grafana: http://192.168.160.2:3000
   - Check all dashboard panels are receiving data

5. **Test API Endpoints**
   ```bash
   # Once Kong/HAProxy are configured
   curl -H "X-API-Key: your-key" https://api.nacho.builders/v1/ogmios
   ```

---

## Troubleshooting

### Common Issues After Power Outage

1. **Nodes not syncing**
   - Check time synchronization: `timedatectl status`
   - Verify NTP: `sudo systemctl status chrony`
   - Restart node if needed: `sudo systemctl restart cnode`

2. **No peer connections**
   - Check firewall: `sudo ufw status`
   - Verify topology file: `cat /opt/cardano/cnode/files/topology.json`
   - Check DNS resolution: `nslookup nacho.builders`

3. **DB-Sync stuck**
   - Check socket tunnel: `ls -la /var/run/cardano/node.socket`
   - Restart services:
     ```bash
     sudo systemctl restart cardano-socket-tunnel
     sudo systemctl restart cardano-db-sync
     ```

4. **Monitoring not working**
   - Check if containers are running (on monitoring host)
   - Restart services if needed:
     ```bash
     sudo systemctl restart prometheus grafana-server
     ```

---

## API Testing

### Current Status
- ✅ Ogmios: Running on both relays (ports 1337)
- ⚠️ Submit API: Running but only on localhost (needs fix)
- ⚠️ Kong Gateway: Not fully configured yet
- ⚠️ HAProxy: Not fully configured yet

### Testing Ogmios
```bash
# Direct test
echo '{"jsonrpc":"2.0","method":"queryNetworkTip","id":1}' | nc 192.168.160.11 1337

# Or via curl
curl -X POST http://192.168.160.11:1337 \
  -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","method":"queryNetworkTip","id":1}'
```

### Next Steps for API Platform
1. Fix Submit API to listen on all interfaces
2. Complete Kong Gateway configuration
3. Set up HAProxy load balancing
4. Configure API keys and rate limiting

---

*Last Updated: December 30, 2025*