# Security Checklist
## Comprehensive Security Guidelines for Stake Pool Operations

This document provides security requirements and verification procedures for the NACHO stake pool.

---

## Security Layers

```
┌─────────────────────────────────────────────────────────────┐
│                    PHYSICAL SECURITY                        │
│  Air-gapped machine, secure key storage, physical access    │
├─────────────────────────────────────────────────────────────┤
│                    NETWORK SECURITY                         │
│  VLAN isolation, firewall rules, port restrictions          │
├─────────────────────────────────────────────────────────────┤
│                    HOST SECURITY                            │
│  OS hardening, UFW, fail2ban, SSH keys                      │
├─────────────────────────────────────────────────────────────┤
│                    APPLICATION SECURITY                     │
│  Topology restrictions, key permissions, monitoring         │
└─────────────────────────────────────────────────────────────┘
```

---

## Network Security Checklist

### VLAN Isolation
- [x] Cardano VLAN (160) created and active ✅
- [x] VLAN properly tagged on Proxmox bridge ✅
- [x] VMs assigned to correct VLAN ✅

### Firewall Rules (UniFi)
- [x] Block Producer has NO port forwards ✅
- [x] Relay 1 port forward: 6001 → 192.168.160.11:6000 ✅
- [x] Relay 2 port forward: 6002 → 192.168.160.12:6000 ✅
- [x] LAN → Cardano SSH allowed (port 22) ✅
- [x] VPN → Cardano SSH allowed (port 22) ✅
- [x] Cardano → LAN blocked ✅
- [x] Cardano → VPN blocked ✅
- [x] Cardano internal traffic allowed ✅

### Verification Commands

```bash
# Test from LAN - should work
ssh cardano@192.168.160.10

# Test from Cardano node to LAN - should fail
ping 192.168.150.222

# Test external port (from outside network)
nc -zv nacho.builders 6001
```

---

## Host Security Checklist

### SSH Configuration
- [ ] Password authentication disabled
- [ ] Root login disabled
- [ ] SSH keys configured
- [ ] Only `cardano` user allowed

**Verify:**
```bash
grep -E "^(PasswordAuthentication|PermitRootLogin|AllowUsers)" /etc/ssh/sshd_config
```

**Expected:**
```
PasswordAuthentication no
PermitRootLogin prohibit-password
AllowUsers cardano
```

### UFW Firewall
- [ ] Default deny incoming
- [ ] Default allow outgoing
- [ ] SSH allowed from management networks
- [ ] Port 6000 configured appropriately

**Verify:**
```bash
sudo ufw status verbose
```

**Block Producer Expected:**
```
22/tcp    ALLOW IN    192.168.150.0/24
22/tcp    ALLOW IN    192.168.2.0/24
6000/tcp  ALLOW IN    192.168.160.11
6000/tcp  ALLOW IN    192.168.160.12
```

**Relay Expected:**
```
22/tcp    ALLOW IN    192.168.150.0/24
22/tcp    ALLOW IN    192.168.2.0/24
6000/tcp  ALLOW IN    Anywhere
```

### Fail2ban
- [ ] Fail2ban installed and running
- [ ] SSH jail configured
- [ ] Aggressive mode enabled

**Verify:**
```bash
sudo fail2ban-client status sshd
```

### System Hardening
- [ ] Automatic security updates enabled
- [ ] Kernel hardening applied (sysctl)
- [ ] Shared memory hardened
- [ ] Unnecessary services disabled

**Verify:**
```bash
# Check unattended upgrades
systemctl is-enabled unattended-upgrades

# Check sysctl settings
sysctl net.ipv4.tcp_syncookies
# Should be: 1

sysctl net.ipv4.icmp_echo_ignore_broadcasts
# Should be: 1
```

### Time Synchronization
- [ ] Chrony installed and running
- [ ] Synchronized with reliable NTP sources

**Verify:**
```bash
chronyc tracking
# Should show "Leap status: Normal"
```

---

## Key Security Checklist

### Cold Keys (Air-Gapped Only)

> **See:** [Air-Gapped VM Setup Guide](../plans/air-gapped-vm-setup.md) for complete setup instructions.
> **See:** [Pool Registration Guide](../operations/pool-registration.md) for key generation steps.

- [ ] `cold.skey` NEVER on networked machine
- [ ] `cold.counter` NEVER on networked machine
- [ ] `stake.skey` NEVER on networked machine
- [ ] `payment.skey` NEVER on networked machine
- [ ] Air-gapped VM (114) has NO network interface
- [ ] USB transfers use shred after each use
- [ ] Encrypted backups stored in multiple locations

### Hot Keys (Block Producer Only)
- [ ] `vrf.skey` present on BP at `/opt/cardano/cnode/priv/pool/NACHO/`
- [ ] `kes.skey` present on BP at `/opt/cardano/cnode/priv/pool/NACHO/`
- [ ] `op.cert` present on BP at `/opt/cardano/cnode/priv/pool/NACHO/`
- [ ] Correct file permissions (400)

**Verify:**
```bash
ls -la $CNODE_HOME/priv/pool/NACHO/
# All .skey files should show: -r--------
```

### Key File Permissions

```bash
# Set correct permissions
chmod 400 $CNODE_HOME/priv/pool/NACHO/*.skey
chmod 400 $CNODE_HOME/priv/pool/NACHO/op.cert
chown cardano:cardano $CNODE_HOME/priv/pool/NACHO/*
```

---

## Application Security Checklist

### Block Producer Topology
- [ ] `bootstrapPeers` is empty array
- [ ] `useLedgerAfterSlot` set to -1
- [ ] Only own relays in `localRoots`
- [ ] `PeerSharing` disabled

**Verify:**
```bash
cat $CNODE_HOME/files/topology.json | jq '.bootstrapPeers'
# Should be: []

cat $CNODE_HOME/files/config.json | jq '.PeerSharing'
# Should be: false
```

### Relay Configuration
- [ ] Connects to bootstrap peers
- [ ] Connects to Block Producer
- [ ] Connects to other relay
- [ ] `PeerSharing` can be enabled

---

## Backup Security Checklist

### Cold Key Backups
- [ ] Multiple encrypted copies exist
- [ ] Stored in different physical locations
- [ ] Recovery tested

### Configuration Backups
- [ ] Topology files backed up
- [ ] Config files backed up
- [ ] Scripts backed up
- [ ] Netplan configs backed up

### Backup Encryption

```bash
# Encrypt backup with GPG
gpg --symmetric --cipher-algo AES256 backup.tar.gz

# Decrypt
gpg --decrypt backup.tar.gz.gpg > backup.tar.gz
```

---

## Operational Security Checklist

### Access Control
- [ ] Strong passwords for all accounts
- [ ] SSH keys have passphrases
- [ ] Two-factor authentication where possible
- [ ] Access logged and auditable

### Monitoring
- [ ] Node status monitored
- [ ] Alerts configured for anomalies
- [ ] Logs reviewed regularly
- [ ] Failed login attempts monitored

### Incident Response
- [ ] Contact list maintained
- [ ] Recovery procedures documented
- [ ] Key rotation procedure known
- [ ] Backup restoration tested

---

## Security Audit Procedure

### Monthly Audit

```bash
#!/bin/bash
# Save as ~/scripts/security-audit.sh

echo "=== Security Audit $(date) ==="

echo -e "\n--- SSH Configuration ---"
grep -E "^(PasswordAuthentication|PermitRootLogin)" /etc/ssh/sshd_config

echo -e "\n--- UFW Status ---"
sudo ufw status

echo -e "\n--- Fail2ban Status ---"
sudo fail2ban-client status

echo -e "\n--- Failed SSH Attempts (last 24h) ---"
grep "Failed password" /var/log/auth.log | tail -10

echo -e "\n--- Key File Permissions ---"
ls -la $CNODE_HOME/priv/pool/NACHO/ 2>/dev/null || echo "Not a BP node"

echo -e "\n--- Open Ports ---"
ss -tlnp

echo -e "\n--- Running Services ---"
systemctl list-units --type=service --state=running | head -20

echo -e "\n--- Last Logins ---"
last -10

echo "=== Audit Complete ==="
```

### Quarterly Review

1. Review all firewall rules
2. Audit user accounts
3. Check for unused services
4. Review and rotate any shared credentials
5. Test backup restoration
6. Review security logs for patterns

---

## Incident Response

### If Compromise Suspected

1. **Isolate** - Disconnect affected system from network
2. **Assess** - Determine scope of compromise
3. **Preserve** - Save logs and evidence
4. **Rotate** - Change all credentials
5. **Restore** - Rebuild from known good state
6. **Review** - Identify how breach occurred

### Key Compromise Response

If cold keys are compromised:

1. **Immediately** retire the pool
2. Generate new cold keys on air-gapped machine
3. Register new pool
4. Notify delegators
5. Investigate breach

If hot keys are compromised:

1. Stop Block Producer
2. Rotate KES keys immediately
3. Generate new operational certificate
4. Review how compromise occurred
5. Strengthen security

---

## Security Resources

- [Cardano Security Best Practices](https://developers.cardano.org/docs/operate-a-stake-pool/security/)
- [CIS Ubuntu Benchmark](https://www.cisecurity.org/benchmark/ubuntu_linux)
- [SPO Security Telegram](https://t.me/CardanoStakePoolWorkgroup)

---

## Penetration Test History

| Date | Type | Result | Report |
|------|------|--------|--------|
| Dec 24, 2025 | Grey-box (production) | STRONG | [pentest-report-2024-12-24.md](pentest-report-2024-12-24.md) |

### Latest Findings Summary
- **0 Critical / 0 High** vulnerabilities
- **2 Medium**: NOPASSWD sudo configuration
- **1 Low**: PeerSharing disabled on relays
- All security controls verified working

### Recommended Test Schedule
- **Quarterly**: Full penetration test
- **Monthly**: Security audit script (see above)
- **After changes**: Targeted testing of affected areas

---

*Document Version: 1.1*
*Last Updated: December 24, 2025*

