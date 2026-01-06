# Air-Gapped File Transfer via Virtual Disk
## No Physical USB Required - Proxmox Virtual Disk Method

This guide covers how to securely transfer files between an air-gapped VM and networked VMs using a virtual disk image managed through Proxmox, without requiring physical USB access.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    VIRTUAL DISK TRANSFER WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   Proxmox Host (192.168.150.222)                                            │
│   ┌─────────────────────────────────────────────────────────────────────┐   │
│   │                                                                      │   │
│   │   ┌──────────────┐                        ┌──────────────┐          │   │
│   │   │  Air-Gapped  │    Virtual Disk        │    Block     │          │   │
│   │   │   VM (114)   │◄──── transfer.img ────►│   Producer   │          │   │
│   │   │  NO NETWORK  │    (attach/detach)     │   VM (111)   │          │   │
│   │   │              │                        │              │          │   │
│   │   │  Generates   │                        │  Receives    │          │   │
│   │   │  cold keys   │                        │  hot keys    │          │   │
│   │   └──────────────┘                        └──────────────┘          │   │
│   │                                                                      │   │
│   │   The virtual disk is NEVER attached to both VMs simultaneously     │   │
│   │                                                                      │   │
│   └─────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Security Principles

1. **Air-gapped VM (114) NEVER has a network interface** - This is non-negotiable
2. **Virtual disk is NEVER attached to both VMs at the same time**
3. **Only transfer what's necessary** - Hot keys only, never cold keys
4. **Shred files on virtual disk after transfer**
5. **Virtual disk can be deleted/recreated for each transfer**

---

## Prerequisites

- SSH access to Proxmox host (192.168.150.222)
- Air-gapped VM (114) created with NO network interface
- Block Producer VM (111) running

---

## Step 1: Create Virtual Transfer Disk

SSH into Proxmox host:

```bash
ssh root@192.168.150.222
```

Create a small virtual disk image for transfers:

```bash
# Create a 100MB disk image for file transfers
# Using raw format for simplicity
qemu-img create -f raw /var/lib/vz/images/transfer-disk.img 100M

# Format it with ext4
# First, set up a loop device
LOOP_DEV=$(losetup -f --show /var/lib/vz/images/transfer-disk.img)
mkfs.ext4 $LOOP_DEV
losetup -d $LOOP_DEV

echo "Transfer disk created at /var/lib/vz/images/transfer-disk.img"
```

---

## Step 2: Transfer Workflow - Air-Gapped to Block Producer

### 2.1: Attach Disk to Air-Gapped VM

On Proxmox host:

```bash
# Attach the transfer disk to air-gapped VM (114) as an unused disk
qm set 114 -scsi1 /var/lib/vz/images/transfer-disk.img

# Start VM 114 if not running
qm start 114
```

### 2.2: Mount and Copy Files (Air-Gapped VM)

Access VM 114 via Proxmox noVNC console:

```bash
# Find the new disk (usually /dev/sdb)
lsblk

# Mount the transfer disk
sudo mkdir -p /mnt/transfer
sudo mount /dev/sdb /mnt/transfer

# Copy hot keys to transfer disk
sudo cp ~/cold-keys/vrf.skey /mnt/transfer/
sudo cp ~/cold-keys/vrf.vkey /mnt/transfer/
sudo cp ~/cold-keys/kes.skey /mnt/transfer/
sudo cp ~/cold-keys/kes.vkey /mnt/transfer/
sudo cp ~/cold-keys/op.cert /mnt/transfer/
sudo cp ~/cold-keys/cold.vkey /mnt/transfer/
sudo cp ~/cold-keys/pool.id /mnt/transfer/
sudo cp ~/cold-keys/payment.addr /mnt/transfer/
sudo cp ~/cold-keys/stake.vkey /mnt/transfer/

# Sync and unmount
sync
sudo umount /mnt/transfer
```

### 2.3: Detach from Air-Gapped, Attach to Block Producer

On Proxmox host:

```bash
# Detach from air-gapped VM
qm set 114 -delete scsi1

# Attach to Block Producer VM (111)
qm set 111 -scsi1 /var/lib/vz/images/transfer-disk.img
```

### 2.4: Copy Files on Block Producer

SSH to Block Producer:

```bash
ssh michael@192.168.160.10

# Find and mount the transfer disk
lsblk
sudo mkdir -p /mnt/transfer
sudo mount /dev/sdb /mnt/transfer

# Create pool directory
sudo mkdir -p /opt/cardano/cnode/priv/pool/NACHO

# Copy files
sudo cp /mnt/transfer/*.vkey /opt/cardano/cnode/priv/pool/NACHO/
sudo cp /mnt/transfer/*.skey /opt/cardano/cnode/priv/pool/NACHO/
sudo cp /mnt/transfer/op.cert /opt/cardano/cnode/priv/pool/NACHO/
sudo cp /mnt/transfer/pool.id /opt/cardano/cnode/priv/pool/NACHO/
sudo cp /mnt/transfer/payment.addr /opt/cardano/cnode/priv/pool/NACHO/

# Set permissions
sudo chown -R cardano:cardano /opt/cardano/cnode/priv/pool/NACHO/
sudo chmod 400 /opt/cardano/cnode/priv/pool/NACHO/*.skey
sudo chmod 400 /opt/cardano/cnode/priv/pool/NACHO/op.cert

# Verify
ls -la /opt/cardano/cnode/priv/pool/NACHO/

# Shred files on transfer disk
sudo shred -vfz -n 1 /mnt/transfer/*

# Unmount
sudo umount /mnt/transfer
```

### 2.5: Detach and Clean Up

On Proxmox host:

```bash
# Detach from Block Producer
qm set 111 -delete scsi1

# Optionally, securely wipe the transfer disk
shred -vfz -n 1 /var/lib/vz/images/transfer-disk.img

# Or delete and recreate for next use
rm /var/lib/vz/images/transfer-disk.img
```

---

## Step 3: Transfer Workflow - Block Producer to Air-Gapped

For signing transactions, you need to transfer unsigned transactions TO the air-gapped VM.

### 3.1: Prepare Files on Block Producer

```bash
ssh michael@192.168.160.10

# Get protocol parameters (needed for offline transaction building)
sudo -u cardano bash -c '
export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket
cardano-cli query protocol-parameters --mainnet --out-file /tmp/protocol-params.json
cardano-cli query tip --mainnet --out-file /tmp/tip.json
'

# Copy to a location accessible for transfer
sudo cp /tmp/protocol-params.json /home/michael/
sudo cp /tmp/tip.json /home/michael/
```

### 3.2: Attach Transfer Disk to Block Producer

On Proxmox host:

```bash
# Recreate clean transfer disk
qemu-img create -f raw /var/lib/vz/images/transfer-disk.img 100M
LOOP_DEV=$(losetup -f --show /var/lib/vz/images/transfer-disk.img)
mkfs.ext4 $LOOP_DEV
losetup -d $LOOP_DEV

# Attach to Block Producer
qm set 111 -scsi1 /var/lib/vz/images/transfer-disk.img
```

### 3.3: Copy Files to Transfer Disk (Block Producer)

```bash
ssh michael@192.168.160.10

sudo mount /dev/sdb /mnt/transfer
sudo cp /home/michael/protocol-params.json /mnt/transfer/
sudo cp /home/michael/tip.json /mnt/transfer/
# Copy any unsigned transactions
sudo cp /home/michael/*.unsigned /mnt/transfer/ 2>/dev/null || true
sync
sudo umount /mnt/transfer
```

### 3.4: Move to Air-Gapped VM

On Proxmox host:

```bash
qm set 111 -delete scsi1
qm set 114 -scsi1 /var/lib/vz/images/transfer-disk.img
```

### 3.5: Access Files on Air-Gapped VM

Via Proxmox noVNC console on VM 114:

```bash
sudo mount /dev/sdb /mnt/transfer
cp /mnt/transfer/* ~/cardano/
sudo umount /mnt/transfer
```

---

## Automation Script

Create this script on the Proxmox host for easier transfers:

```bash
cat << 'EOF' > /root/transfer-disk.sh
#!/bin/bash
# Virtual disk transfer helper for air-gapped workflow

TRANSFER_DISK="/var/lib/vz/images/transfer-disk.img"
AIRGAPPED_VM=114
BP_VM=111

case "$1" in
    create)
        echo "Creating fresh transfer disk..."
        rm -f $TRANSFER_DISK
        qemu-img create -f raw $TRANSFER_DISK 100M
        LOOP_DEV=$(losetup -f --show $TRANSFER_DISK)
        mkfs.ext4 -q $LOOP_DEV
        losetup -d $LOOP_DEV
        echo "Transfer disk created: $TRANSFER_DISK"
        ;;
    
    to-airgapped)
        echo "Attaching transfer disk to air-gapped VM ($AIRGAPPED_VM)..."
        qm set $BP_VM -delete scsi1 2>/dev/null
        qm set $AIRGAPPED_VM -scsi1 $TRANSFER_DISK
        echo "Disk attached to VM $AIRGAPPED_VM"
        echo "Access via: Proxmox Console -> VM $AIRGAPPED_VM"
        ;;
    
    to-bp)
        echo "Attaching transfer disk to Block Producer ($BP_VM)..."
        qm set $AIRGAPPED_VM -delete scsi1 2>/dev/null
        qm set $BP_VM -scsi1 $TRANSFER_DISK
        echo "Disk attached to VM $BP_VM"
        echo "SSH to: ssh michael@192.168.160.10"
        ;;
    
    detach)
        echo "Detaching transfer disk from all VMs..."
        qm set $AIRGAPPED_VM -delete scsi1 2>/dev/null
        qm set $BP_VM -delete scsi1 2>/dev/null
        echo "Disk detached"
        ;;
    
    destroy)
        echo "Destroying transfer disk..."
        qm set $AIRGAPPED_VM -delete scsi1 2>/dev/null
        qm set $BP_VM -delete scsi1 2>/dev/null
        shred -vfz -n 1 $TRANSFER_DISK 2>/dev/null
        rm -f $TRANSFER_DISK
        echo "Transfer disk destroyed"
        ;;
    
    status)
        echo "Transfer disk: $TRANSFER_DISK"
        ls -la $TRANSFER_DISK 2>/dev/null || echo "  Not created"
        echo ""
        echo "VM $AIRGAPPED_VM (air-gapped) disks:"
        qm config $AIRGAPPED_VM | grep scsi || echo "  No SCSI disks"
        echo ""
        echo "VM $BP_VM (Block Producer) disks:"
        qm config $BP_VM | grep scsi || echo "  No SCSI disks"
        ;;
    
    *)
        echo "Usage: $0 {create|to-airgapped|to-bp|detach|destroy|status}"
        echo ""
        echo "Commands:"
        echo "  create       - Create a fresh transfer disk"
        echo "  to-airgapped - Attach disk to air-gapped VM (114)"
        echo "  to-bp        - Attach disk to Block Producer (111)"
        echo "  detach       - Detach disk from all VMs"
        echo "  destroy      - Securely delete transfer disk"
        echo "  status       - Show current attachment status"
        exit 1
        ;;
esac
EOF

chmod +x /root/transfer-disk.sh
```

### Usage Examples

```bash
# On Proxmox host:

# Create fresh transfer disk
./transfer-disk.sh create

# Attach to air-gapped VM (after generating keys)
./transfer-disk.sh to-airgapped

# Move to Block Producer (after copying keys to disk)
./transfer-disk.sh to-bp

# Check status
./transfer-disk.sh status

# Clean up after transfer
./transfer-disk.sh destroy
```

---

## Complete Workflow Example

### Initial Key Transfer (Air-Gapped → Block Producer)

```bash
# 1. On Proxmox host: Create and attach to air-gapped
ssh root@192.168.150.222
./transfer-disk.sh create
./transfer-disk.sh to-airgapped

# 2. On Air-Gapped VM (via noVNC console): Copy keys
sudo mount /dev/sdb /mnt/transfer
sudo cp ~/cold-keys/{vrf.skey,vrf.vkey,kes.skey,kes.vkey,op.cert,cold.vkey,pool.id,payment.addr,stake.vkey} /mnt/transfer/
sync && sudo umount /mnt/transfer

# 3. On Proxmox host: Move to Block Producer
./transfer-disk.sh to-bp

# 4. On Block Producer: Copy keys to pool directory
ssh michael@192.168.160.10
sudo mount /dev/sdb /mnt/transfer
sudo mkdir -p /opt/cardano/cnode/priv/pool/NACHO
sudo cp /mnt/transfer/* /opt/cardano/cnode/priv/pool/NACHO/
sudo chown -R cardano:cardano /opt/cardano/cnode/priv/pool/NACHO/
sudo chmod 400 /opt/cardano/cnode/priv/pool/NACHO/*.skey
sudo shred -vfz -n 1 /mnt/transfer/*
sudo umount /mnt/transfer

# 5. On Proxmox host: Clean up
./transfer-disk.sh destroy
```

### Transaction Signing (Block Producer → Air-Gapped → Block Producer)

```bash
# 1. Build unsigned TX on Block Producer
# 2. On Proxmox: Create disk and attach to BP
./transfer-disk.sh create
./transfer-disk.sh to-bp

# 3. On BP: Copy unsigned TX to disk
sudo mount /dev/sdb /mnt/transfer
sudo cp pool-registration.unsigned /mnt/transfer/
sudo umount /mnt/transfer

# 4. On Proxmox: Move to air-gapped
./transfer-disk.sh to-airgapped

# 5. On Air-Gapped: Sign TX
sudo mount /dev/sdb /mnt/transfer
cardano-cli transaction sign --tx-file /mnt/transfer/pool-registration.unsigned ...
cp pool-registration.signed /mnt/transfer/
sudo umount /mnt/transfer

# 6. On Proxmox: Move back to BP
./transfer-disk.sh to-bp

# 7. On BP: Submit signed TX
sudo mount /dev/sdb /mnt/transfer
cp /mnt/transfer/pool-registration.signed ./
sudo umount /mnt/transfer
cardano-cli transaction submit --mainnet --tx-file pool-registration.signed

# 8. Clean up
./transfer-disk.sh destroy
```

---

## Security Considerations

### What Makes This Secure

1. **Air-gapped VM has NO network interface** - Cannot be compromised remotely
2. **Virtual disk is never shared simultaneously** - No direct VM-to-VM communication
3. **Transfer disk is ephemeral** - Created fresh, destroyed after use
4. **Files are shredded** - Data doesn't persist on transfer medium
5. **Cold keys never leave air-gapped VM** - Only hot keys are transferred

### Comparison to Physical USB

| Aspect | Physical USB | Virtual Disk |
|--------|--------------|--------------|
| Air-gap integrity | ✅ True air-gap | ✅ True air-gap (no network on VM) |
| Physical access required | Yes | No |
| Can be done remotely | No | Yes (via Proxmox) |
| Risk of malware on medium | USB can carry malware | Disk is fresh each time |
| Audit trail | Manual | Proxmox logs |

### Additional Hardening

1. **Log all transfers** - Add logging to the transfer script
2. **Checksums** - Verify file integrity after transfer
3. **Time limits** - Don't leave transfer disk attached
4. **Encryption** - Optionally encrypt files on transfer disk

---

## Troubleshooting

### Disk Not Appearing in VM

```bash
# On Proxmox, verify attachment
qm config 114 | grep scsi

# In VM, rescan SCSI bus
echo "- - -" | sudo tee /sys/class/scsi_host/host*/scan
lsblk
```

### Permission Denied on Mount

```bash
# Check if disk is formatted
sudo file -s /dev/sdb

# If not formatted, format it
sudo mkfs.ext4 /dev/sdb
```

### Disk Shows as Busy

```bash
# Check what's using it
sudo lsof +D /mnt/transfer

# Force unmount if needed
sudo umount -f /mnt/transfer
```

---

## Quick Reference

| Action | Proxmox Command |
|--------|-----------------|
| Create disk | `./transfer-disk.sh create` |
| Attach to air-gapped | `./transfer-disk.sh to-airgapped` |
| Attach to BP | `./transfer-disk.sh to-bp` |
| Check status | `./transfer-disk.sh status` |
| Secure delete | `./transfer-disk.sh destroy` |

| Action | VM Command |
|--------|------------|
| Mount disk | `sudo mount /dev/sdb /mnt/transfer` |
| Unmount disk | `sudo umount /mnt/transfer` |
| Shred files | `sudo shred -vfz -n 1 /mnt/transfer/*` |

---

*Document Version: 1.0*
*Last Updated: December 28, 2025*

