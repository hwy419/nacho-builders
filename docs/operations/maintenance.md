# Maintenance Procedures
## Routine Maintenance and Updates

This document covers routine maintenance tasks for the NACHO stake pool infrastructure.

---

## Maintenance Schedule

| Task | Frequency | Priority |
|------|-----------|----------|
| System updates | Weekly | Medium |
| Node software updates | As released | High |
| KES key rotation | Every ~90 days | Critical |
| Log rotation check | Monthly | Low |
| Disk cleanup | Monthly | Low |
| Backup verification | Monthly | Medium |
| Full system backup | Quarterly | Medium |

---

## System Updates

### Ubuntu Security Updates

**On each node:**

```bash
# Check for updates
sudo apt update
sudo apt list --upgradable

# Apply security updates only
sudo apt upgrade -y

# If kernel updated, plan a reboot
```

### Reboot Procedure

**Important:** Reboot nodes one at a time to maintain pool availability.

```bash
# 1. Stop the Cardano node gracefully
sudo systemctl stop cnode

# 2. Reboot
sudo reboot

# 3. After reboot, verify node started
sudo systemctl status cnode

# 4. Wait for sync before moving to next node
./gLiveView.sh
# Wait until tip diff is 0
```

**Order of reboots:**
1. Relay 2 (least critical)
2. Relay 1
3. Block Producer (most critical - ensure relays are synced first)

---

## Cardano Node Updates

### Check Current Version

```bash
cardano-node --version
cardano-cli --version
```

### Update via Guild Operators

```bash
# Navigate to scripts
cd $CNODE_HOME/scripts

# Download latest guild-deploy
curl -sS -o guild-deploy.sh https://raw.githubusercontent.com/cardano-community/guild-operators/master/scripts/cnode-helper-scripts/guild-deploy.sh
chmod 755 guild-deploy.sh

# Update components (downloads new binaries)
./guild-deploy.sh -b master -n mainnet -t cnode -s p

# Restart node
sudo systemctl restart cnode

# Verify version
cardano-node --version
```

### Update Order

1. **Relay 2** - Update and verify synced
2. **Relay 1** - Update and verify synced
3. **Block Producer** - Update and verify synced

**Wait at least 10 minutes between each node to ensure stability.**

---

## Disk Maintenance

### Check Disk Usage

```bash
# Overall disk usage
df -h

# Cardano-specific directories
du -sh $CNODE_HOME/db
du -sh $CNODE_HOME/logs
du -sh /var/log
```

### Clean Up Logs

```bash
# Rotate and compress logs
sudo journalctl --vacuum-time=7d

# Clean old log files
find $CNODE_HOME/logs -name "*.log" -mtime +30 -delete

# Clean apt cache
sudo apt clean
sudo apt autoremove -y
```

### Database Maintenance

The Cardano database (`$CNODE_HOME/db`) grows over time. If disk space is critical:

```bash
# Check database size
du -sh $CNODE_HOME/db

# If needed, can resync from Mithril (faster than from scratch)
# WARNING: This will cause downtime
cd $CNODE_HOME/scripts
./mithril-client.sh download
```

---

## Configuration Backup

### What to Backup

```bash
# Create backup directory
BACKUP_DIR=~/backups/$(date +%Y%m%d)
mkdir -p $BACKUP_DIR

# Backup configurations
cp $CNODE_HOME/files/topology.json $BACKUP_DIR/
cp $CNODE_HOME/files/config.json $BACKUP_DIR/
cp $CNODE_HOME/scripts/env $BACKUP_DIR/
cp /etc/netplan/*.yaml $BACKUP_DIR/

# Backup pool keys (hot keys only - cold keys are on air-gapped)
cp $CNODE_HOME/priv/pool/NACHO/*.vkey $BACKUP_DIR/
# Note: .skey files should be backed up securely

# Create archive
tar -czvf ~/backups/config-backup-$(date +%Y%m%d).tar.gz $BACKUP_DIR/
```

### Backup Verification

```bash
# List backup contents
tar -tzvf ~/backups/config-backup-*.tar.gz

# Test extraction
tar -xzvf ~/backups/config-backup-*.tar.gz -C /tmp/
ls -la /tmp/$(date +%Y%m%d)/
```

---

## Topology Updates

### When to Update Topology

- Adding new peer relationships
- Removing non-responsive peers
- After pool registration changes
- When recommended by community

### Update Procedure

```bash
# Edit topology file
nano $CNODE_HOME/files/topology.json

# Validate JSON syntax
python3 -m json.tool $CNODE_HOME/files/topology.json > /dev/null

# Restart node to apply
sudo systemctl restart cnode

# Verify peers in gLiveView
./gLiveView.sh
```

---

## Certificate Renewal

### SSL Certificates (If Using HTTPS)

If you host pool metadata or have HTTPS endpoints:

```bash
# Check certificate expiry
openssl x509 -enddate -noout -in /path/to/cert.pem

# Renew with certbot (if using Let's Encrypt)
sudo certbot renew
```

### Pool Metadata

If pool metadata changes:

1. Update JSON file
2. Upload to hosting location
3. Submit pool re-registration transaction

---

## Health Checks

### Quick Health Check Script

Create `/home/cardano/scripts/health-check.sh`:

```bash
#!/bin/bash

echo "=== Cardano Node Health Check ==="
echo "Date: $(date)"
echo ""

# Node status
echo "--- Node Status ---"
systemctl is-active cnode

# Sync status
echo ""
echo "--- Sync Status ---"
cardano-cli query tip --mainnet | jq '.'

# Peer count
echo ""
echo "--- Peer Count ---"
curl -s localhost:12798/metrics 2>/dev/null | grep connectedPeers || echo "Metrics unavailable"

# Memory
echo ""
echo "--- Memory Usage ---"
free -h | head -2

# Disk
echo ""
echo "--- Disk Usage ---"
df -h / | tail -1

# KES expiry
echo ""
echo "--- KES Status ---"
if [ -f "$CNODE_HOME/priv/pool/NACHO/op.cert" ]; then
    cardano-cli query kes-period-info --mainnet --op-cert-file $CNODE_HOME/priv/pool/NACHO/op.cert 2>/dev/null | head -5
else
    echo "Op cert not found (relay node?)"
fi

echo ""
echo "=== Health Check Complete ==="
```

```bash
chmod +x /home/cardano/scripts/health-check.sh
```

---

## Scheduled Maintenance Windows

### Recommended Schedule

| Day | Time (Local) | Task |
|-----|--------------|------|
| Sunday | 02:00-04:00 | System updates, reboots |
| 1st of Month | 02:00-04:00 | Deep maintenance |
| As Needed | Low activity | Node software updates |

### Before Maintenance

1. Check pool is not slot leader soon
2. Notify delegators (optional)
3. Ensure backups are current
4. Have recovery plan ready

### During Maintenance

1. Monitor logs actively
2. Keep one relay running if possible
3. Document any issues

### After Maintenance

1. Verify all nodes synced
2. Check peer connectivity
3. Verify block production capability
4. Update maintenance log

---

## Maintenance Log Template

Keep a log at `~/maintenance-log.md`:

```markdown
# Maintenance Log

## 2024-12-22 - System Updates

**Nodes Updated:** Relay1, Relay2, BP
**Changes:**
- Ubuntu security updates applied
- Rebooted all nodes

**Issues:** None
**Duration:** 45 minutes
**Verified:** All nodes synced, peers healthy

---

## 2024-12-15 - Node Version Update

**Previous Version:** 8.7.2
**New Version:** 8.7.3
**Changes:**
- Updated cardano-node via guild-deploy

**Issues:** None
**Duration:** 30 minutes
**Verified:** Version confirmed, blocks producing

---
```

---

## Emergency Contacts

| Issue | Resource |
|-------|----------|
| Node problems | SPO Telegram: t.me/CardanoStakePoolWorkgroup |
| Network issues | Cardano Forum |
| Guild Operators | GitHub Issues |

---

*Document Version: 1.0*
*Last Updated: December 2024*













