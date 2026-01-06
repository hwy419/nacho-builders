# Air-Gapped Ubuntu Desktop VM Setup Guide
## Secure Cold Key Storage and Transaction Signing

This guide covers setting up a completely network-isolated Ubuntu Desktop 24.04 VM in Proxmox for secure Cardano cold key operations.

---

## File Transfer Options

This guide assumes **physical USB access** to the Proxmox host. If you don't have physical access, see:

> **[Virtual Disk Transfer Guide](air-gapped-virtual-transfer.md)** - Transfer files using Proxmox virtual disks instead of physical USB. This method maintains the same security guarantees while enabling fully remote operation.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Prerequisites](#2-prerequisites)
3. [Download Ubuntu Desktop ISO](#3-download-ubuntu-desktop-iso)
4. [Create the Air-Gapped VM](#4-create-the-air-gapped-vm)
5. [Install Ubuntu Desktop](#5-install-ubuntu-desktop)
6. [Verify Network Isolation](#6-verify-network-isolation)
7. [Install Cardano CLI](#7-install-cardano-cli)
8. [Configure the Environment](#8-configure-the-environment)
9. [Generate Cold Keys](#9-generate-cold-keys)
10. [Transaction Signing Workflow](#10-transaction-signing-workflow)
11. [Backup Procedures](#11-backup-procedures)
12. [Security Hardening](#12-security-hardening)

---

## 1. Overview

### Why Air-Gapped?

```
┌─────────────────────────────────────────────────────────────────┐
│                    SECURITY ARCHITECTURE                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│   ┌──────────────┐         USB Transfer        ┌──────────────┐ │
│   │  Air-Gapped  │◄──────────────────────────►│    Block     │ │
│   │   VM (Cold)  │    (manual, verified)       │   Producer   │ │
│   │              │                             │    (Hot)     │ │
│   │ • cold.skey  │                             │ • kes.skey   │ │
│   │ • cold.counter                             │ • vrf.skey   │ │
│   │ • stake.skey │                             │ • op.cert    │ │
│   │ • payment.skey                             │              │ │
│   │              │                             │              │ │
│   │   NO NETWORK │                             │   NETWORK    │ │
│   └──────────────┘                             └──────────────┘ │
│                                                                  │
│   Access: Proxmox Console ONLY                                   │
│   Network: NONE (no vNIC)                                        │
│   USB: Controlled file transfer                                  │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### What This VM Will Do

- Store cold keys (cold.skey, cold.counter)
- Store stake signing key (stake.skey)
- Store payment signing key (payment.skey)
- Sign transactions offline
- Generate KES keys and operational certificates
- NEVER connect to any network

### Access Method

- **Proxmox noVNC Console** - Built-in web console
- **Proxmox SPICE Console** - Better performance (optional)
- No SSH, no network access of any kind

---

## 2. Prerequisites

### Hardware Requirements

| Resource | Minimum | Recommended |
|----------|---------|-------------|
| vCPUs | 2 | 2 |
| RAM | 4 GB | 8 GB |
| Disk | 32 GB | 64 GB |

### Required Items

- [ ] Proxmox VE access (https://192.168.150.222:8006)
- [ ] Ubuntu Desktop 24.04 LTS ISO
- [ ] USB drive (8GB+, will be formatted)
- [ ] Second USB drive for backups (recommended)

### Suggested VM ID

| VM ID | Name | Storage | Purpose |
|-------|------|---------|---------|
| 114 | air-gapped | NVME02 | Cold key storage & signing |

---

## 3. Download Ubuntu Desktop ISO

### Option A: Download via Proxmox Host

SSH into Proxmox:

```bash
ssh root@192.168.150.222
```

Download the ISO:

```bash
cd /var/lib/vz/template/iso/
wget https://releases.ubuntu.com/24.04/ubuntu-24.04.3-desktop-amd64.iso
```

Verify download (optional but recommended):

```bash
# Check file size (should be ~6GB)
ls -lh ubuntu-24.04.3-desktop-amd64.iso

# Verify SHA256 (get hash from Ubuntu website)
sha256sum ubuntu-24.04.3-desktop-amd64.iso
```

### Option B: Upload via Web UI

1. Go to Proxmox Web UI
2. Select **local** storage → **ISO Images**
3. Click **Upload**
4. Select downloaded Ubuntu Desktop 24.04 ISO

---

## 4. Create the Air-Gapped VM

### Step 4.1: Create VM via Web UI

Click **Create VM** button in Proxmox

### Step 4.2: General Tab

```
Node:     eth-node
VM ID:    114
Name:     air-gapped
```

### Step 4.3: OS Tab

```
ISO image:    ubuntu-24.04.3-desktop-amd64.iso
Type:         Linux
Version:      6.x - 2.6 Kernel
```

### Step 4.4: System Tab

```
Machine:           q35
BIOS:              OVMF (UEFI)
Add EFI Disk:      ☑ Yes
EFI Storage:       NVME02
SCSI Controller:   VirtIO SCSI single
Qemu Agent:        ☐ No (not needed without network)
Add TPM:           ☐ No
```

### Step 4.5: Disks Tab

```
Bus/Device:        VirtIO Block (virtio0)
Storage:           NVME02
Disk size (GiB):   64
Cache:             Write back
Discard:           ☑ Yes
SSD emulation:     ☑ Yes
IO thread:         ☑ Yes
```

### Step 4.6: CPU Tab

```
Sockets:   1
Cores:     2
Type:      host
```

### Step 4.7: Memory Tab

```
Memory (MiB):      8192
Ballooning:        ☐ No
```

### Step 4.8: Network Tab - CRITICAL!

```
No network device:  ☑ (Check this box!)
```

**⚠️ THIS IS THE MOST IMPORTANT STEP**

Select **No network device** to ensure complete isolation.

If this option isn't visible:
1. Complete the wizard with default network
2. After creation, go to **Hardware**
3. Select **Network Device**
4. Click **Remove**

### Step 4.9: Confirm Tab

- Review all settings
- Ensure **NO network device** is configured
- ☐ Start after created (don't start yet)
- Click **Finish**

### Step 4.10: Verify No Network

After VM creation, verify:

```bash
# On Proxmox host
qm config 114 | grep net

# Should return NOTHING (no output = no network)
```

Or in Web UI:
- Go to **VM 114 → Hardware**
- Verify NO "Network Device" listed

---

## 5. Install Ubuntu Desktop

### Step 5.1: Start VM and Open Console

1. Select VM 114 in Proxmox
2. Click **Start**
3. Click **Console** (noVNC)

### Step 5.2: Boot Ubuntu Installer

- Select **Try or Install Ubuntu**
- Wait for live environment to load

### Step 5.3: Installation Steps

1. **Welcome**
   - Select language: English
   - Click **Install Ubuntu**

2. **Keyboard**
   - Select your keyboard layout
   - Click **Continue**

3. **Connect to the Internet**
   - Select **I don't want to connect to the internet**
   - Click **Continue**

4. **What do you want to do with Ubuntu?**
   - Select **Install Ubuntu**
   - Click **Next**

5. **How would you like to install Ubuntu?**
   - Select **Interactive installation**
   - Click **Next**

6. **What apps would you like to install?**
   - Select **Default selection**
   - Click **Next**

7. **Install recommended proprietary software?**
   - ☐ Uncheck both options (we don't need drivers)
   - Click **Next**

8. **How do you want to install Ubuntu?**
   - Select **Erase disk and install Ubuntu**
   - Click **Next**

9. **Create your account**
   ```
   Your name:     Cold Keys
   Computer name: air-gapped
   Username:      coldkeys
   Password:      [STRONG PASSWORD - write it down securely]
   ```
   - Select **Require my password to log in**
   - Click **Next**

10. **Select your timezone**
    - Choose your timezone (offline, so approximate is fine)
    - Click **Next**

11. **Review your choices**
    - Verify settings
    - Click **Install**

12. Wait for installation to complete (~10-15 minutes)

13. Click **Restart now**

### Step 5.4: Remove Installation Media

When prompted:
1. In Proxmox Web UI, go to **VM 114 → Hardware**
2. Select **CD/DVD Drive**
3. Click **Edit**
4. Select **Do not use any media**
5. Click **OK**
6. Press **Enter** in console to continue boot

### Step 5.5: First Boot

- Log in with your credentials
- Skip any online account setup
- Skip Ubuntu Pro
- Choose privacy settings (all can be disabled)
- Skip software updates (no network anyway)

---

## 6. Verify Network Isolation

### Step 6.1: Check Network Interfaces

Open Terminal (Ctrl+Alt+T or search for Terminal):

```bash
# List all network interfaces
ip link show

# Expected output - ONLY loopback:
# 1: lo: <LOOPBACK,UP,LOWER_UP> mtu 65536 qdisc noqueue state UNKNOWN
#     link/loopback 00:00:00:00:00:00 brd 00:00:00:00:00:00
```

**If you see ANY other interface (eth0, ens18, etc.), STOP and remove it from VM hardware!**

### Step 6.2: Verify No IP Addresses

```bash
ip addr show

# Should only show:
# 1: lo: <LOOPBACK,UP,LOWER_UP>
#     inet 127.0.0.1/8 scope host lo
```

### Step 6.3: Verify No Routes

```bash
ip route show

# Should be empty or show only loopback
```

### Step 6.4: Test Network Isolation

```bash
# These should ALL fail
ping -c 1 8.8.8.8
ping -c 1 google.com
curl https://google.com

# Expected: "Network is unreachable" or similar errors
```

### Step 6.5: Document Verification

```bash
# Create verification log
echo "=== Air-Gap Verification $(date) ===" > ~/air-gap-verify.log
echo "Network interfaces:" >> ~/air-gap-verify.log
ip link show >> ~/air-gap-verify.log
echo -e "\nIP addresses:" >> ~/air-gap-verify.log
ip addr show >> ~/air-gap-verify.log
echo -e "\nRoutes:" >> ~/air-gap-verify.log
ip route show >> ~/air-gap-verify.log
echo -e "\nPing test (should fail):" >> ~/air-gap-verify.log
ping -c 1 8.8.8.8 2>&1 >> ~/air-gap-verify.log

cat ~/air-gap-verify.log
```

---

## 7. Install Cardano CLI

Since we have no network, we need to transfer the cardano-cli binary via USB.

### Step 7.1: Download on Networked Machine

On your **Block Producer** or any networked machine:

```bash
# Create transfer directory
mkdir -p ~/usb-transfer

# Download cardano-cli (adjust version as needed)
cd ~/usb-transfer

# Get the latest cardano-node release
CARDANO_VERSION="10.1.3"
wget https://github.com/IntersectMBO/cardano-node/releases/download/${CARDANO_VERSION}/cardano-node-${CARDANO_VERSION}-linux.tar.gz

# Extract just the CLI
tar -xzf cardano-node-${CARDANO_VERSION}-linux.tar.gz
cp bin/cardano-cli ./

# Verify it works
./cardano-cli --version

# Also download libsodium and other dependencies if needed
# (Ubuntu 24.04 should have most in repos, but we can't access repos)

# Get the protocol parameters (needed for transaction building)
cardano-cli query protocol-parameters --mainnet --out-file protocol-parameters.json
```

### Step 7.2: Prepare USB Drive

On the networked machine:

```bash
# Insert USB drive
# Identify the device (usually /dev/sdb or /dev/sdc)
lsblk

# Format as ext4 (adjust device name!)
sudo mkfs.ext4 /dev/sdb1

# Mount
sudo mount /dev/sdb1 /mnt

# Copy files
sudo cp ~/usb-transfer/cardano-cli /mnt/
sudo cp ~/usb-transfer/protocol-parameters.json /mnt/

# Create a simple install script
cat << 'EOF' | sudo tee /mnt/install.sh
#!/bin/bash
sudo cp /mnt/cardano-cli /usr/local/bin/
sudo chmod +x /usr/local/bin/cardano-cli
echo "Cardano CLI installed!"
cardano-cli --version
EOF
sudo chmod +x /mnt/install.sh

# Unmount safely
sudo umount /mnt
```

### Step 7.3: Install on Air-Gapped VM

In Proxmox, pass USB to the VM:

1. Go to **VM 114 → Hardware**
2. Click **Add → USB Device**
3. Select **Use USB Vendor/Device ID**
4. Find your USB drive in the list
5. Click **Add**

In the air-gapped VM:

```bash
# Find the USB device
lsblk

# Mount USB (adjust device name)
sudo mkdir -p /mnt/usb
sudo mount /dev/sdb1 /mnt/usb

# Run install script
cd /mnt/usb
sudo bash install.sh

# Verify
cardano-cli --version

# Copy protocol parameters
mkdir -p ~/cardano
cp /mnt/usb/protocol-parameters.json ~/cardano/

# Unmount
sudo umount /mnt/usb
```

### Step 7.4: Remove USB from VM

1. In Proxmox Web UI, go to **VM 114 → Hardware**
2. Select the USB Device
3. Click **Remove**

---

## 8. Configure the Environment

### Step 8.1: Create Directory Structure

```bash
# Create cold keys directory
mkdir -p ~/cold-keys
chmod 700 ~/cold-keys

# Create working directory
mkdir -p ~/cardano/transactions
chmod 700 ~/cardano
chmod 700 ~/cardano/transactions

# Create scripts directory
mkdir -p ~/scripts
```

### Step 8.2: Set Environment Variables

```bash
# Add to ~/.bashrc
cat << 'EOF' >> ~/.bashrc

# Cardano Air-Gapped Environment
export CARDANO_HOME="$HOME/cardano"
export COLD_KEYS="$HOME/cold-keys"
export CARDANO_NODE_NETWORK_ID="mainnet"

# Aliases for safety
alias cardano-cli='cardano-cli'
alias ll='ls -la'
EOF

source ~/.bashrc
```

### Step 8.3: Create Helper Scripts

**Transaction signing script:**

```bash
cat << 'EOF' > ~/scripts/sign-tx.sh
#!/bin/bash
# Sign a transaction with cold keys

if [ -z "$1" ]; then
    echo "Usage: $0 <unsigned-tx-file>"
    exit 1
fi

UNSIGNED_TX="$1"
SIGNED_TX="${UNSIGNED_TX%.unsigned}.signed"

echo "=== Transaction Signing ==="
echo "Input:  $UNSIGNED_TX"
echo "Output: $SIGNED_TX"
echo ""

# Display transaction details
echo "Transaction details:"
cardano-cli transaction view --tx-file "$UNSIGNED_TX"
echo ""

read -p "Sign this transaction? (yes/no): " CONFIRM
if [ "$CONFIRM" != "yes" ]; then
    echo "Aborted."
    exit 1
fi

# Determine which keys to use based on transaction type
echo ""
echo "Select signing keys:"
echo "1) Cold key only (pool operations)"
echo "2) Payment key only (simple transfers)"
echo "3) Stake key only (delegation)"
echo "4) Payment + Stake keys"
echo "5) Cold + Payment + Stake keys (pool registration)"
read -p "Choice [1-5]: " KEY_CHOICE

SIGNING_KEYS=""
case $KEY_CHOICE in
    1) SIGNING_KEYS="--signing-key-file $COLD_KEYS/cold.skey" ;;
    2) SIGNING_KEYS="--signing-key-file $COLD_KEYS/payment.skey" ;;
    3) SIGNING_KEYS="--signing-key-file $COLD_KEYS/stake.skey" ;;
    4) SIGNING_KEYS="--signing-key-file $COLD_KEYS/payment.skey --signing-key-file $COLD_KEYS/stake.skey" ;;
    5) SIGNING_KEYS="--signing-key-file $COLD_KEYS/cold.skey --signing-key-file $COLD_KEYS/payment.skey --signing-key-file $COLD_KEYS/stake.skey" ;;
    *) echo "Invalid choice"; exit 1 ;;
esac

cardano-cli transaction sign \
    --tx-file "$UNSIGNED_TX" \
    $SIGNING_KEYS \
    --mainnet \
    --out-file "$SIGNED_TX"

echo ""
echo "Transaction signed successfully!"
echo "Signed transaction: $SIGNED_TX"
echo ""
echo "Transfer this file to your online machine for submission."
EOF
chmod +x ~/scripts/sign-tx.sh
```

**KES key generation script:**

```bash
cat << 'EOF' > ~/scripts/rotate-kes.sh
#!/bin/bash
# Generate new KES keys and operational certificate

echo "=== KES Key Rotation ==="
echo ""
read -p "Enter current KES period (from block producer): " KES_PERIOD

if ! [[ "$KES_PERIOD" =~ ^[0-9]+$ ]]; then
    echo "Error: KES period must be a number"
    exit 1
fi

cd $COLD_KEYS

# Backup existing keys
if [ -f kes.skey ]; then
    BACKUP_DATE=$(date +%Y%m%d-%H%M%S)
    mkdir -p backups
    cp kes.skey backups/kes.skey.$BACKUP_DATE
    cp kes.vkey backups/kes.vkey.$BACKUP_DATE
    cp op.cert backups/op.cert.$BACKUP_DATE 2>/dev/null
    echo "Existing keys backed up to backups/"
fi

# Generate new KES keys
echo ""
echo "Generating new KES key pair..."
cardano-cli node key-gen-KES \
    --verification-key-file kes_new.vkey \
    --signing-key-file kes_new.skey

echo "Generating new operational certificate..."
cardano-cli node issue-op-cert \
    --kes-verification-key-file kes_new.vkey \
    --cold-signing-key-file cold.skey \
    --operational-certificate-issue-counter cold.counter \
    --kes-period $KES_PERIOD \
    --out-file op_new.cert

# Rename to final names
mv kes_new.skey kes.skey
mv kes_new.vkey kes.vkey
mv op_new.cert op.cert

echo ""
echo "=== KES Rotation Complete ==="
echo ""
echo "Files to transfer to Block Producer:"
echo "  - $COLD_KEYS/kes.skey"
echo "  - $COLD_KEYS/kes.vkey"
echo "  - $COLD_KEYS/op.cert"
echo ""
echo "Counter has been incremented in cold.counter"
EOF
chmod +x ~/scripts/rotate-kes.sh
```

---

## 9. Generate Cold Keys

### Step 9.1: Generate Payment Key Pair

```bash
cd ~/cold-keys

cardano-cli address key-gen \
    --verification-key-file payment.vkey \
    --signing-key-file payment.skey

echo "Payment keys generated"
```

### Step 9.2: Generate Stake Key Pair

```bash
cardano-cli stake-address key-gen \
    --verification-key-file stake.vkey \
    --signing-key-file stake.skey

echo "Stake keys generated"
```

### Step 9.3: Generate Cold Key Pair

```bash
cardano-cli node key-gen \
    --cold-verification-key-file cold.vkey \
    --cold-signing-key-file cold.skey \
    --operational-certificate-issue-counter-file cold.counter

echo "Cold keys generated"
```

### Step 9.4: Generate VRF Key Pair

```bash
cardano-cli node key-gen-VRF \
    --verification-key-file vrf.vkey \
    --signing-key-file vrf.skey

echo "VRF keys generated"
```

### Step 9.5: Set Permissions

```bash
chmod 400 ~/cold-keys/*.skey
chmod 400 ~/cold-keys/cold.counter
ls -la ~/cold-keys/
```

### Step 9.6: Generate Addresses

```bash
# Generate payment address
cardano-cli address build \
    --payment-verification-key-file payment.vkey \
    --stake-verification-key-file stake.vkey \
    --mainnet \
    --out-file payment.addr

# Generate stake address
cardano-cli stake-address build \
    --stake-verification-key-file stake.vkey \
    --mainnet \
    --out-file stake.addr

echo "Addresses generated:"
echo "Payment: $(cat payment.addr)"
echo "Stake: $(cat stake.addr)"
```

### Step 9.7: Generate Pool ID

```bash
cardano-cli stake-pool id \
    --cold-verification-key-file cold.vkey \
    --output-format bech32 \
    --out-file pool.id

echo "Pool ID: $(cat pool.id)"
```

---

## 10. Transaction Signing Workflow

### Workflow Overview

```
┌─────────────────┐     USB      ┌─────────────────┐     Network    ┌─────────────┐
│  Block Producer │ ──────────► │   Air-Gapped    │                │   Cardano   │
│                 │             │       VM        │                │   Network   │
│ 1. Build TX     │             │ 2. Sign TX      │                │             │
│    (unsigned)   │             │    (offline)    │                │             │
│                 │ ◄────────── │                 │                │             │
│ 3. Submit TX    │     USB     │                 │ ──────────────►│ 4. Confirm  │
└─────────────────┘             └─────────────────┘                └─────────────┘
```

### Step 10.1: Build Transaction (Block Producer)

On your **Block Producer** (networked):

```bash
# Example: Build a simple ADA transfer
cardano-cli transaction build \
    --mainnet \
    --tx-in <UTXO_TXHASH>#<UTXO_INDEX> \
    --tx-out <RECIPIENT_ADDR>+<AMOUNT> \
    --change-address <YOUR_ADDR> \
    --out-file tx.unsigned

# Copy to USB
sudo mount /dev/sdb1 /mnt
cp tx.unsigned /mnt/
cp protocol-parameters.json /mnt/  # If updated
sudo umount /mnt
```

### Step 10.2: Transfer to Air-Gapped VM

1. Remove USB from Block Producer
2. Insert USB into Proxmox host
3. Pass USB to Air-Gapped VM (see Section 7.3)

### Step 10.3: Sign Transaction (Air-Gapped)

```bash
# Mount USB
sudo mount /dev/sdb1 /mnt/usb

# Copy unsigned transaction
cp /mnt/usb/tx.unsigned ~/cardano/transactions/

# Sign using helper script
cd ~/cardano/transactions
~/scripts/sign-tx.sh tx.unsigned

# Copy signed transaction to USB
cp tx.signed /mnt/usb/

# Unmount
sudo umount /mnt/usb
```

### Step 10.4: Submit Transaction (Block Producer)

1. Remove USB from Proxmox (remove from VM hardware first)
2. Insert USB into Block Producer machine

```bash
# Mount USB
sudo mount /dev/sdb1 /mnt

# Copy signed transaction
cp /mnt/tx.signed ~/

# Submit to network
cardano-cli transaction submit \
    --mainnet \
    --tx-file tx.signed

# Verify
echo "Transaction submitted!"

# Clean USB
sudo shred -vfz -n 1 /mnt/tx.unsigned /mnt/tx.signed
sudo umount /mnt
```

---

## 11. Backup Procedures

### Step 11.1: Create Encrypted Backup

On the **Air-Gapped VM**:

```bash
# Install GPG (should be pre-installed)
gpg --version

# Create backup archive
cd ~
tar -czvf cold-keys-backup.tar.gz cold-keys/

# Encrypt with strong passphrase
gpg --symmetric --cipher-algo AES256 cold-keys-backup.tar.gz

# This creates cold-keys-backup.tar.gz.gpg
# Remove unencrypted archive
shred -vfz -n 3 cold-keys-backup.tar.gz
```

### Step 11.2: Transfer Backup to USB

```bash
# Mount USB
sudo mount /dev/sdb1 /mnt/usb

# Copy encrypted backup
cp cold-keys-backup.tar.gz.gpg /mnt/usb/

# Also copy verification keys (these can be public)
cp ~/cold-keys/*.vkey /mnt/usb/
cp ~/cold-keys/pool.id /mnt/usb/
cp ~/cold-keys/*.addr /mnt/usb/

# Unmount
sudo umount /mnt/usb
```

### Step 11.3: Store Backups Securely

**Recommended backup locations:**

1. **Primary USB** - Stored in fireproof safe
2. **Secondary USB** - Stored at different physical location
3. **Paper backup** - Write down recovery passphrase

**NEVER store backups:**
- In cloud storage
- On networked computers
- In email
- In password managers connected to internet

### Step 11.4: Test Backup Recovery

Periodically test that you can restore:

```bash
# On a test machine (can be air-gapped VM itself)
gpg --decrypt cold-keys-backup.tar.gz.gpg > cold-keys-restore.tar.gz
tar -xzvf cold-keys-restore.tar.gz

# Verify files
ls -la cold-keys/

# Clean up test
shred -vfz -n 3 cold-keys-restore.tar.gz
rm -rf cold-keys/  # Only if this was a test restore!
```

---

## 12. Security Hardening

### Step 12.1: Disable Unnecessary Services

```bash
# Disable Bluetooth
sudo systemctl disable bluetooth
sudo systemctl stop bluetooth

# Disable printing
sudo systemctl disable cups
sudo systemctl stop cups

# Disable Avahi (network discovery)
sudo systemctl disable avahi-daemon
sudo systemctl stop avahi-daemon
```

### Step 12.2: Screen Lock Settings

1. Open **Settings → Privacy → Screen Lock**
2. Enable **Automatic Screen Lock**
3. Set **Screen Lock Delay** to 1 minute
4. Enable **Lock Screen on Suspend**

### Step 12.3: Disable USB Auto-Mount (Optional)

For extra security, disable automatic USB mounting:

```bash
# Create udev rule to prevent auto-mount
echo 'SUBSYSTEM=="usb", ENV{UDISKS_AUTO}="0"' | sudo tee /etc/udev/rules.d/99-disable-automount.rules
sudo udevadm control --reload-rules
```

Then manually mount USBs when needed.

### Step 12.4: Create Audit Log

```bash
cat << 'EOF' > ~/scripts/audit-log.sh
#!/bin/bash
# Log all cold key operations

LOG_FILE=~/cold-keys/audit.log
echo "[$(date '+%Y-%m-%d %H:%M:%S')] $*" >> "$LOG_FILE"
EOF
chmod +x ~/scripts/audit-log.sh

# Usage: ~/scripts/audit-log.sh "Generated new KES keys"
```

### Step 12.5: Regular Verification

Create a monthly verification checklist:

```bash
cat << 'EOF' > ~/scripts/monthly-verify.sh
#!/bin/bash
echo "=== Monthly Air-Gap Verification ==="
echo "Date: $(date)"
echo ""

echo "1. Network Isolation Check:"
ip link show | grep -v "lo:"
if [ $? -eq 0 ]; then
    echo "   WARNING: Network interface detected!"
else
    echo "   ✓ No network interfaces (good)"
fi

echo ""
echo "2. Key Files Present:"
for f in cold.skey cold.vkey cold.counter stake.skey stake.vkey payment.skey payment.vkey vrf.skey vrf.vkey; do
    if [ -f ~/cold-keys/$f ]; then
        echo "   ✓ $f"
    else
        echo "   ✗ $f MISSING!"
    fi
done

echo ""
echo "3. Key Permissions:"
ls -la ~/cold-keys/*.skey | awk '{print "   " $1 " " $9}'

echo ""
echo "4. Disk Space:"
df -h / | tail -1 | awk '{print "   Used: " $3 " / " $2 " (" $5 ")"}'

echo ""
echo "=== Verification Complete ==="
EOF
chmod +x ~/scripts/monthly-verify.sh
```

---

## Quick Reference

### Key Files Location

| File | Location | Purpose |
|------|----------|---------|
| cold.skey | ~/cold-keys/ | Pool cold signing key |
| cold.vkey | ~/cold-keys/ | Pool cold verification key |
| cold.counter | ~/cold-keys/ | Op cert counter |
| stake.skey | ~/cold-keys/ | Stake signing key |
| stake.vkey | ~/cold-keys/ | Stake verification key |
| payment.skey | ~/cold-keys/ | Payment signing key |
| payment.vkey | ~/cold-keys/ | Payment verification key |
| vrf.skey | ~/cold-keys/ | VRF signing key (transfer to BP) |
| vrf.vkey | ~/cold-keys/ | VRF verification key |
| kes.skey | ~/cold-keys/ | KES signing key (transfer to BP) |
| kes.vkey | ~/cold-keys/ | KES verification key |
| op.cert | ~/cold-keys/ | Operational cert (transfer to BP) |

### Files to Transfer to Block Producer

After initial setup, transfer these to Block Producer:

- `vrf.skey`
- `vrf.vkey`
- `kes.skey`
- `kes.vkey`
- `op.cert`
- `cold.vkey` (verification only)
- `pool.id`

**NEVER transfer to Block Producer:**
- `cold.skey`
- `cold.counter`
- `stake.skey`
- `payment.skey`

### Common Commands

```bash
# Sign transaction
~/scripts/sign-tx.sh tx.unsigned

# Rotate KES keys
~/scripts/rotate-kes.sh

# Monthly verification
~/scripts/monthly-verify.sh

# View transaction
cardano-cli transaction view --tx-file tx.unsigned

# Check key hash
cardano-cli node key-hash-VRF --verification-key-file vrf.vkey
```

### USB Workflow Summary

1. **Build** unsigned TX on Block Producer
2. **Copy** to USB, unmount safely
3. **Transfer** USB to air-gapped VM (via Proxmox USB passthrough)
4. **Sign** transaction offline
5. **Copy** signed TX to USB, unmount safely
6. **Remove** USB from VM in Proxmox
7. **Transfer** USB to Block Producer
8. **Submit** signed TX to network
9. **Shred** files on USB

---

## Troubleshooting

### VM Won't Boot

1. Check EFI disk is configured
2. Verify ISO is removed after install
3. Check boot order in VM Options

### USB Not Detected

1. Ensure USB device is added to VM hardware
2. Try different USB port on Proxmox host
3. Check `lsblk` output in VM

### cardano-cli Not Working

1. Verify binary is executable: `chmod +x /usr/local/bin/cardano-cli`
2. Check library dependencies: `ldd /usr/local/bin/cardano-cli`
3. May need to copy additional libraries from source machine

### Screen Resolution Issues

In noVNC console:
1. Try different display settings in VM Hardware
2. Or use SPICE console for better graphics

---

## Next Steps

After completing this setup:

1. [ ] Generate all cold keys
2. [ ] Transfer hot keys (vrf, kes, op.cert) to Block Producer
3. [ ] Create encrypted backups
4. [ ] Store backups in multiple secure locations
5. [ ] Test transaction signing workflow
6. [ ] Document your specific passphrase storage location

---

*Document Version: 1.0*
*Last Updated: December 2024*

