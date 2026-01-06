# Troubleshooting Runbook
## Emergency Procedures and Problem Resolution

This runbook provides step-by-step procedures for diagnosing and resolving common issues with the NACHO stake pool.

---

## Quick Diagnostics

### First Response Checklist

When something goes wrong, check these first:

```bash
# 1. Is the node running?
sudo systemctl status cnode

# 2. Is the node synced?
cardano-cli query tip --mainnet

# 3. Are there errors in logs?
journalctl -u cnode -n 50 --no-pager | grep -i error

# 4. Is network connectivity working?
ping 1.1.1.1

# 5. Are peers connected?
curl -s localhost:12798/metrics | grep connectedPeers
```

---

## Node Not Starting

### Symptoms
- `systemctl status cnode` shows failed
- Node exits immediately after start

### Diagnosis

```bash
# Check detailed status
sudo systemctl status cnode -l

# Check recent logs
journalctl -u cnode -n 100 --no-pager

# Look for specific errors
journalctl -u cnode | grep -i "error\|fatal\|failed"
```

### Common Causes & Solutions

#### Database Corruption

**Symptoms:** Errors about ledger state, chain validation failed

```bash
# Stop node
sudo systemctl stop cnode

# Backup current database (optional)
mv $CNODE_HOME/db $CNODE_HOME/db.backup.$(date +%Y%m%d)

# Re-sync using Mithril (faster)
cd $CNODE_HOME/scripts
./mithril-client.sh download

# Start node
sudo systemctl start cnode
```

#### Disk Full

**Symptoms:** "No space left on device" errors

```bash
# Check disk usage
df -h

# Clean up logs
sudo journalctl --vacuum-time=3d

# Clean old files
find $CNODE_HOME/logs -mtime +7 -delete

# If still full, may need to expand disk
```

#### Permission Issues

**Symptoms:** "Permission denied" errors

```bash
# Fix ownership
sudo chown -R cardano:cardano $CNODE_HOME

# Fix key permissions
chmod 400 $CNODE_HOME/priv/pool/NACHO/*.skey
```

#### Configuration Error

**Symptoms:** JSON parse errors, invalid config

```bash
# Validate topology JSON
python3 -m json.tool $CNODE_HOME/files/topology.json

# Validate config JSON
python3 -m json.tool $CNODE_HOME/files/config.json

# If invalid, restore from backup or regenerate
```

---

## Node Not Syncing

### Symptoms
- Tip difference increasing
- Slot number not advancing
- "Tip (Diff)" in gLiveView shows large number

### Diagnosis

```bash
# Check current tip
cardano-cli query tip --mainnet

# Compare to network tip
# Visit: https://pooltool.io or https://adapools.org

# Check peer count
./gLiveView.sh
# Look at In/Out peers
```

### Solutions

#### No Peers Connected

```bash
# Check topology file
cat $CNODE_HOME/files/topology.json

# Verify bootstrap peers are correct
# Should include backbone.cardano.iog.io:3001

# Check DNS resolution
dig backbone.cardano.iog.io

# Check firewall
sudo ufw status

# Restart node
sudo systemctl restart cnode
```

#### Firewall Blocking

```bash
# Check UFW
sudo ufw status

# Ensure port 6000 is allowed
sudo ufw allow 6000/tcp

# Check if node is listening
ss -tlnp | grep 6000
```

#### Network Connectivity Issues

```bash
# Test internet
ping 1.1.1.1
ping google.com

# Test Cardano network
curl -I https://backbone.cardano.iog.io:3001

# Check gateway
ping 192.168.160.1
```

---

## Block Producer Not Producing Blocks

### Symptoms
- Pool should have produced blocks but hasn't
- gLiveView shows no blocks produced
- Pool.vet shows missed slots

### Diagnosis

```bash
# Check if BP is running
sudo systemctl status cnode

# Check if synced
cardano-cli query tip --mainnet

# Check KES key status
cardano-cli query kes-period-info \
  --mainnet \
  --op-cert-file $CNODE_HOME/priv/pool/NACHO/op.cert

# Check connectivity to relays
nc -zv 192.168.160.11 6000
nc -zv 192.168.160.12 6000
```

### Solutions

#### KES Key Expired

**Symptoms:** KES period info shows expired or negative remaining

```bash
# Check KES status
cardano-cli query kes-period-info --mainnet --op-cert-file op.cert
```

**Solution:** Rotate KES keys immediately. See [Key Rotation](../operations/key-rotation.md)

#### Keys Not Found

```bash
# Verify keys exist
ls -la $CNODE_HOME/priv/pool/NACHO/

# Should see:
# kes.skey
# kes.vkey
# vrf.skey
# vrf.vkey
# op.cert
```

**Solution:** Restore keys from backup or regenerate from air-gapped machine

#### Topology Misconfigured

```bash
# BP should ONLY connect to own relays
cat $CNODE_HOME/files/topology.json

# Verify:
# - bootstrapPeers is empty []
# - localRoots contains only relay IPs
# - useLedgerAfterSlot is -1
```

#### Pool Not Registered

```bash
# Check pool registration
cardano-cli query pool-params \
  --stake-pool-id $(cat $CNODE_HOME/priv/pool/NACHO/pool.id) \
  --mainnet
```

---

## High Memory Usage

### Symptoms
- Memory usage >28GB
- System becoming slow
- OOM killer activated

### Diagnosis

```bash
# Check memory usage
free -h

# Check node memory specifically
ps aux | grep cardano-node

# Check for memory leaks over time
watch -n 60 'ps aux | grep cardano-node'
```

### Solutions

#### Restart Node

```bash
# Graceful restart
sudo systemctl restart cnode

# Wait for sync
./gLiveView.sh
```

#### Increase Swap (Temporary)

```bash
# Create swap file
sudo fallocate -l 8G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Add to fstab for persistence
echo '/swapfile none swap sw 0 0' | sudo tee -a /etc/fstab
```

#### Check for Updates

Memory issues are sometimes fixed in newer versions:

```bash
cd $CNODE_HOME/scripts
./guild-deploy.sh -b master -n mainnet -t cnode -s p
sudo systemctl restart cnode
```

---

## Network Connectivity Issues

### Can't Reach Internet

```bash
# Check gateway
ping 192.168.160.1

# Check DNS
dig google.com

# Check routes
ip route show

# Check interface
ip addr show
```

**Solution:** Verify netplan configuration:

```bash
cat /etc/netplan/00-installer-config.yaml
sudo netplan apply
```

### Can't Reach Other Nodes

```bash
# From BP, test relays
ping 192.168.160.11
ping 192.168.160.12

# Test port connectivity
nc -zv 192.168.160.11 6000
nc -zv 192.168.160.12 6000
```

**Solution:** Check VLAN configuration and firewall rules

### External Can't Reach Relays

```bash
# Check port forward is working (from external)
nc -zv nacho.builders 6001

# Check node is listening
ss -tlnp | grep 6000

# Check UFW allows incoming
sudo ufw status
```

---

## Time Synchronization Issues

### Symptoms
- Blocks produced at wrong time
- "Slot in future" errors
- Sync issues

### Diagnosis

```bash
# Check time sync status
chronyc tracking

# Check NTP sources
chronyc sources

# Check system time
date
timedatectl
```

### Solutions

```bash
# Force sync
sudo chronyc makestep

# Restart chrony
sudo systemctl restart chrony

# Verify sync
chronyc tracking
# "Leap status" should be "Normal"
```

---

## Emergency Procedures

### Complete Node Failure

1. **Assess:** Determine if hardware or software issue
2. **Failover:** Ensure other nodes are operational
3. **Restore:** 
   - Rebuild VM from template
   - Restore configuration from backup
   - Sync database (use Mithril)
   - Restore keys (from secure backup)
4. **Verify:** Confirm node is synced and producing

### Key Compromise

1. **Isolate:** Disconnect affected systems
2. **Assess:** Determine which keys compromised
3. **Rotate:**
   - If hot keys: Rotate KES, generate new op.cert
   - If cold keys: Retire pool, register new pool
4. **Investigate:** Determine how breach occurred
5. **Harden:** Implement additional security measures

### Complete Pool Recovery

If all nodes are lost:

1. Set up new VMs (see Proxmox guide)
2. Install Ubuntu and harden (see main plan)
3. Install Guild Operators
4. Restore topology and config from backup
5. Restore hot keys from secure backup
6. Sync using Mithril
7. Verify pool operation

---

## Log Analysis

### Useful Log Commands

```bash
# Follow logs in real-time
journalctl -u cnode -f

# Last hour of logs
journalctl -u cnode --since "1 hour ago"

# Errors only
journalctl -u cnode -p err

# Search for specific term
journalctl -u cnode | grep -i "term"

# Export logs for analysis
journalctl -u cnode --since "2024-01-01" > cnode-logs.txt
```

### Common Log Messages

| Message | Meaning | Action |
|---------|---------|--------|
| "Switched to a fork" | Normal chain reorganization | None |
| "Tip changed" | Normal sync progress | None |
| "Connection refused" | Peer unavailable | Check if expected |
| "KES key expired" | Critical - can't produce | Rotate immediately |
| "Out of memory" | Memory exhausted | Restart, add swap |
| "Disk full" | No space left | Clean up, expand disk |

---

## Escalation

### When to Seek Help

- Pool missing multiple scheduled blocks
- Unexplained security events
- Hardware failures
- Network-wide issues

### Resources

| Issue Type | Resource |
|------------|----------|
| General SPO | [Telegram: SPO Workgroup](https://t.me/CardanoStakePoolWorkgroup) |
| Guild Tools | [GitHub Issues](https://github.com/cardano-community/guild-operators/issues) |
| Network Issues | [Cardano Forum](https://forum.cardano.org/) |
| Security | [IOG Security](https://iohk.io/en/contact/) |

---

## Quick Reference

### Restart Commands

```bash
# Restart node
sudo systemctl restart cnode

# Stop node
sudo systemctl stop cnode

# Start node
sudo systemctl start cnode

# Check status
sudo systemctl status cnode
```

### Diagnostic Commands

```bash
# Sync status
cardano-cli query tip --mainnet

# KES status
cardano-cli query kes-period-info --mainnet --op-cert-file op.cert

# Peer count
curl -s localhost:12798/metrics | grep connectedPeers

# Memory usage
free -h

# Disk usage
df -h
```

### Recovery Commands

```bash
# Resync from Mithril
cd $CNODE_HOME/scripts
./mithril-client.sh download

# Fix permissions
sudo chown -R cardano:cardano $CNODE_HOME
chmod 400 $CNODE_HOME/priv/pool/NACHO/*.skey

# Restore network
sudo netplan apply
```

---

*Document Version: 1.0*
*Last Updated: December 2024*

