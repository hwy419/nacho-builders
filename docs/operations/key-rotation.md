# Key Rotation Procedures
## KES Key and Operational Certificate Management

This document covers the critical process of rotating KES (Key Evolving Signature) keys and generating new operational certificates.

---

## ⚠️ Important Warnings

1. **KES keys expire after ~90 days** - Pool stops producing blocks if expired
2. **Cold keys must NEVER touch a networked machine**
3. **Always verify current KES period before rotation**
4. **Test on testnet first if unsure**

---

## Rotation Schedule

| Key Type | Rotation Frequency | Validity Period |
|----------|-------------------|-----------------|
| KES Keys | Every ~90 days | 62 epochs (~90 days) |
| Op Cert | With each KES rotation | Matches KES validity |
| Cold Keys | Never (unless compromised) | Permanent |
| VRF Keys | Never (unless compromised) | Permanent |

---

## Pre-Rotation Checklist

> **See:** [Air-Gapped VM Setup Guide](../plans/air-gapped-vm-setup.md) for air-gapped machine configuration.

- [ ] Check current KES expiry in gLiveView
- [ ] Ensure air-gapped machine is ready (VM 114 in Proxmox)
- [ ] Have USB drive prepared (formatted, clean)
- [ ] Verify you have `cold.skey` and `cold.counter` on air-gapped
- [ ] Note current KES period from Block Producer

---

## Step 1: Check Current KES Status

On the **Block Producer**:

```bash
# Using gLiveView
cd $CNODE_HOME/scripts
./gLiveView.sh
# Look for "KES expiry" - should show remaining time
```

Or check directly:

```bash
# Get current KES period info
cardano-cli query kes-period-info \
  --mainnet \
  --op-cert-file $CNODE_HOME/priv/pool/NACHO/op.cert
```

**Output shows:**
- `qKesCurrentKesPeriod` - Current network KES period
- `qKesOnDiskOperationalCertificateNumber` - Your cert counter
- `qKesRemainingSlotsInKesPeriod` - Slots until expiry

---

## Step 2: Get Current KES Period

On the **Block Producer**, get the current KES period:

```bash
# Calculate current KES period
SLOTS_PER_KES_PERIOD=129600
CURRENT_SLOT=$(cardano-cli query tip --mainnet | jq -r '.slot')
CURRENT_KES_PERIOD=$((CURRENT_SLOT / SLOTS_PER_KES_PERIOD))

echo "Current KES Period: $CURRENT_KES_PERIOD"
```

**Write this number down** - you'll need it on the air-gapped machine.

---

## Step 3: Generate New KES Keys (Air-Gapped)

On the **Air-Gapped Machine**:

```bash
cd ~/cold-keys

# Generate new KES key pair
cardano-cli node key-gen-KES \
  --verification-key-file kes_new.vkey \
  --signing-key-file kes_new.skey

echo "New KES keys generated"
ls -la kes_new.*
```

---

## Step 4: Generate New Operational Certificate (Air-Gapped)

Still on the **Air-Gapped Machine**:

```bash
cd ~/cold-keys

# Use the KES period you noted from Step 2
# Replace XXXX with actual current KES period
KES_PERIOD=XXXX

cardano-cli node issue-op-cert \
  --kes-verification-key-file kes_new.vkey \
  --cold-signing-key-file cold.skey \
  --operational-certificate-issue-counter cold.counter \
  --kes-period $KES_PERIOD \
  --out-file op_new.cert

echo "New operational certificate generated"
echo "Counter has been incremented in cold.counter"
```

**Verify the certificate:**

```bash
cat op_new.cert
# Should show JSON with opcert data
```

---

## Step 5: Transfer to USB Drive

On the **Air-Gapped Machine**:

```bash
# Mount USB drive (adjust device as needed)
sudo mount /dev/sdb1 /mnt/usb

# Copy only the necessary files
cp kes_new.skey /mnt/usb/kes.skey
cp kes_new.vkey /mnt/usb/kes.vkey
cp op_new.cert /mnt/usb/op.cert

# Verify files
ls -la /mnt/usb/

# Safely unmount
sudo umount /mnt/usb
```

**Files to transfer:**
- `kes.skey` (renamed from kes_new.skey)
- `kes.vkey` (renamed from kes_new.vkey)
- `op.cert` (renamed from op_new.cert)

---

## Step 6: Deploy to Block Producer

On the **Block Producer**:

```bash
# Mount USB drive
sudo mount /dev/sdb1 /mnt/usb

# Backup existing keys
cd $CNODE_HOME/priv/pool/NACHO
cp kes.skey kes.skey.backup.$(date +%Y%m%d)
cp kes.vkey kes.vkey.backup.$(date +%Y%m%d)
cp op.cert op.cert.backup.$(date +%Y%m%d)

# Copy new keys
sudo cp /mnt/usb/kes.skey ./kes.skey
sudo cp /mnt/usb/kes.vkey ./kes.vkey
sudo cp /mnt/usb/op.cert ./op.cert

# Set correct ownership and permissions
sudo chown cardano:cardano kes.skey kes.vkey op.cert
chmod 400 kes.skey

# Unmount USB
sudo umount /mnt/usb
```

---

## Step 7: Restart Block Producer

```bash
# Restart the node
sudo systemctl restart cnode

# Wait for startup
sleep 30

# Verify node is running
sudo systemctl status cnode

# Check logs for errors
journalctl -u cnode -n 50 --no-pager
```

---

## Step 8: Verify New Keys

```bash
# Check KES period info with new cert
cardano-cli query kes-period-info \
  --mainnet \
  --op-cert-file $CNODE_HOME/priv/pool/NACHO/op.cert

# Use gLiveView to verify
cd $CNODE_HOME/scripts
./gLiveView.sh
# KES expiry should show ~90 days
```

---

## Step 9: Clean Up

On the **Air-Gapped Machine**:

```bash
cd ~/cold-keys

# Keep the new keys as backup (or archive old ones)
mv kes.skey kes.skey.old.$(date +%Y%m%d)
mv kes.vkey kes.vkey.old.$(date +%Y%m%d)
mv op.cert op.cert.old.$(date +%Y%m%d)

# Rename new keys to current
mv kes_new.skey kes.skey
mv kes_new.vkey kes.vkey
mv op_new.cert op.cert
```

On the **Block Producer**:

```bash
# Securely wipe USB drive contents
sudo shred -vfz -n 3 /dev/sdb1
```

---

## Troubleshooting

### Node Won't Start After Key Rotation

```bash
# Check logs for specific error
journalctl -u cnode -n 100 | grep -i error

# Common issues:
# - Wrong KES period used
# - Permissions on key files
# - Counter mismatch
```

### KES Period Mismatch

If you used the wrong KES period:

1. Go back to air-gapped machine
2. Regenerate op.cert with correct period
3. Transfer and deploy again

**Note:** The counter in `cold.counter` will have incremented. This is fine.

### Counter Issues

The operational certificate counter must always increase. If you see errors about the counter:

1. Check current counter on chain:
   ```bash
   cardano-cli query pool-params --stake-pool-id $(cat pool.id) --mainnet
   ```
2. Ensure `cold.counter` on air-gapped has higher value
3. If needed, manually increment counter (advanced)

---

## Automation Reminder

Set a calendar reminder for:
- **60 days** after rotation: Start planning next rotation
- **75 days** after rotation: Execute rotation
- **85 days** after rotation: Emergency reminder if not done

---

## Quick Reference

```bash
# Check KES expiry
cardano-cli query kes-period-info --mainnet --op-cert-file op.cert

# Get current KES period
echo $(($(cardano-cli query tip --mainnet | jq -r '.slot') / 129600))

# Generate KES keys (air-gapped)
cardano-cli node key-gen-KES --verification-key-file kes.vkey --signing-key-file kes.skey

# Generate op cert (air-gapped)
cardano-cli node issue-op-cert \
  --kes-verification-key-file kes.vkey \
  --cold-signing-key-file cold.skey \
  --operational-certificate-issue-counter cold.counter \
  --kes-period $KES_PERIOD \
  --out-file op.cert
```

---

*Document Version: 1.0*
*Last Updated: December 2024*


