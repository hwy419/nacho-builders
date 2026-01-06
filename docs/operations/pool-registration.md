# Pool Registration Guide
## NACHO Stake Pool - nacho.builders

This guide covers the complete process for registering the NACHO stake pool on Cardano mainnet.

---

## Prerequisites Checklist

Before starting pool registration, verify:

- [x] All nodes fully synchronized (100%)
- [x] Monitoring operational (Grafana/Prometheus)
- [x] Pool metadata hosted and accessible
- [ ] Air-gapped VM created and configured
- [ ] Sufficient ADA for registration (~515 ADA minimum)

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                        POOL REGISTRATION WORKFLOW                            │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐         ┌──────────────┐         ┌──────────────┐         │
│  │   Phase 1    │         │   Phase 2    │         │   Phase 3    │         │
│  │  Air-Gapped  │ ──────► │    Block     │ ──────► │   Network    │         │
│  │    Setup     │         │   Producer   │         │ Registration │         │
│  └──────────────┘         └──────────────┘         └──────────────┘         │
│                                                                              │
│  • Create VM (114)        • Transfer hot keys     • Build registration TX   │
│  • Install cardano-cli    • Configure BP          • Sign on air-gapped      │
│  • Generate all keys      • Restart node          • Submit to mainnet       │
│  • Create op.cert         • Verify operation      • Verify on explorers     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Air-Gapped VM Setup

> **Full Guide:** See `plans/air-gapped-vm-setup.md` for detailed instructions.

### Quick Summary

1. **Create VM 114** in Proxmox:
   - Name: `air-gapped`
   - vCPUs: 2, RAM: 8GB, Disk: 64GB
   - **NO NETWORK DEVICE** (critical!)
   - Storage: NVME02

2. **Install Ubuntu Desktop 24.04**:
   - Use Proxmox noVNC console
   - Skip network configuration
   - Create user: `coldkeys`

3. **Transfer cardano-cli via USB**:
   - Download on Block Producer
   - Copy to USB drive
   - Pass USB to VM via Proxmox
   - Install to `/usr/local/bin/`

4. **Generate Keys** (on air-gapped VM):

```bash
cd ~/cold-keys

# Payment keys
cardano-cli address key-gen \
    --verification-key-file payment.vkey \
    --signing-key-file payment.skey

# Stake keys
cardano-cli stake-address key-gen \
    --verification-key-file stake.vkey \
    --signing-key-file stake.skey

# Cold keys (pool identity)
cardano-cli node key-gen \
    --cold-verification-key-file cold.vkey \
    --cold-signing-key-file cold.skey \
    --operational-certificate-issue-counter-file cold.counter

# VRF keys
cardano-cli node key-gen-VRF \
    --verification-key-file vrf.vkey \
    --signing-key-file vrf.skey

# KES keys
cardano-cli node key-gen-KES \
    --verification-key-file kes.vkey \
    --signing-key-file kes.skey

# Set permissions
chmod 400 *.skey cold.counter
```

5. **Generate Addresses**:

```bash
# Payment address (with stake)
cardano-cli address build \
    --payment-verification-key-file payment.vkey \
    --stake-verification-key-file stake.vkey \
    --mainnet \
    --out-file payment.addr

# Stake address
cardano-cli stake-address build \
    --stake-verification-key-file stake.vkey \
    --mainnet \
    --out-file stake.addr

# Pool ID
cardano-cli stake-pool id \
    --cold-verification-key-file cold.vkey \
    --output-format bech32 \
    --out-file pool.id

echo "Payment Address: $(cat payment.addr)"
echo "Stake Address: $(cat stake.addr)"
echo "Pool ID: $(cat pool.id)"
```

6. **Get Current KES Period** (on Block Producer):

```bash
# SSH to Block Producer
ssh michael@192.168.160.10
sudo -u cardano bash

export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket
cardano-cli query tip --mainnet | jq -r '.slot'

# Calculate KES period: slot / 129600
# Example: slot 141234567 / 129600 = 1089
```

7. **Generate Operational Certificate** (on air-gapped):

```bash
# Use KES period from previous step
KES_PERIOD=<calculated_value>

cardano-cli node issue-op-cert \
    --kes-verification-key-file kes.vkey \
    --cold-signing-key-file cold.skey \
    --operational-certificate-issue-counter cold.counter \
    --kes-period $KES_PERIOD \
    --out-file op.cert
```

---

## Phase 2: Block Producer Configuration

### Files to Transfer

Transfer these files from air-gapped VM to Block Producer.

**Transfer Methods:**
- **Physical USB** - See [Air-Gapped VM Setup Guide](../plans/air-gapped-vm-setup.md)
- **Virtual Disk (No Physical Access)** - See [Virtual Disk Transfer Guide](../plans/air-gapped-virtual-transfer.md)

| File | Purpose | Destination |
|------|---------|-------------|
| `vrf.skey` | VRF signing key | `/opt/cardano/cnode/priv/pool/NACHO/` |
| `vrf.vkey` | VRF verification key | `/opt/cardano/cnode/priv/pool/NACHO/` |
| `kes.skey` | KES signing key | `/opt/cardano/cnode/priv/pool/NACHO/` |
| `kes.vkey` | KES verification key | `/opt/cardano/cnode/priv/pool/NACHO/` |
| `op.cert` | Operational certificate | `/opt/cardano/cnode/priv/pool/NACHO/` |
| `cold.vkey` | Cold verification key (for reference) | `/opt/cardano/cnode/priv/pool/NACHO/` |
| `pool.id` | Pool ID (for reference) | `/opt/cardano/cnode/priv/pool/NACHO/` |

**NEVER transfer:** `cold.skey`, `cold.counter`, `stake.skey`, `payment.skey`

### Setup Block Producer Keys

```bash
# SSH to Block Producer
ssh michael@192.168.160.10

# Create pool directory
sudo mkdir -p /opt/cardano/cnode/priv/pool/NACHO
sudo chown -R cardano:cardano /opt/cardano/cnode/priv/pool/NACHO

# Mount USB and copy files
sudo mount /dev/sdb1 /mnt
sudo cp /mnt/*.vkey /mnt/*.skey /mnt/op.cert /mnt/pool.id /opt/cardano/cnode/priv/pool/NACHO/
sudo umount /mnt

# Set permissions
sudo chown cardano:cardano /opt/cardano/cnode/priv/pool/NACHO/*
sudo chmod 400 /opt/cardano/cnode/priv/pool/NACHO/*.skey
sudo chmod 400 /opt/cardano/cnode/priv/pool/NACHO/op.cert

# Verify
ls -la /opt/cardano/cnode/priv/pool/NACHO/
```

### Update Block Producer Configuration

Edit the cnode environment to enable block production:

```bash
sudo -u cardano nano /opt/cardano/cnode/scripts/env
```

Ensure these settings:

```bash
POOL_NAME="NACHO"
POOL_DIR="${CNODE_HOME}/priv/pool/${POOL_NAME}"
```

### Restart Block Producer

```bash
sudo systemctl restart cnode

# Verify node started with pool keys
sudo journalctl -u cnode -f --no-pager | head -50

# Check gLiveView - should show pool info
sudo -u cardano /opt/cardano/cnode/scripts/gLiveView.sh
```

---

## Phase 3: Pool Registration Transaction

### Step 1: Fund Payment Address

Send at least **515 ADA** to your payment address:
- 500 ADA = Pool deposit (refundable on pool retirement)
- 2 ADA = Stake address registration deposit
- ~13 ADA = Transaction fees and buffer

**Payment Address:** (from air-gapped VM `payment.addr` file)

Use a wallet (Daedalus, Yoroi, Eternl) to send ADA to this address.

### Step 2: Verify Funds (on Block Producer)

```bash
ssh michael@192.168.160.10
sudo -u cardano bash

export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket

# Query UTxOs at payment address
PAYMENT_ADDR="<your_payment_address>"
cardano-cli query utxo --address $PAYMENT_ADDR --mainnet
```

### Step 3: Get Protocol Parameters

```bash
cardano-cli query protocol-parameters --mainnet --out-file protocol-params.json
```

### Step 4: Calculate Metadata Hash

```bash
# Download your metadata file
curl -o poolMetaData.json https://hwy419.github.io/nacho-builders/poolMetaData.json

# Calculate hash
cardano-cli hash anchor-data --file-text poolMetaData.json
# Save this hash for the registration certificate
```

### Step 5: Create Registration Certificate (on Block Producer)

First, create the stake address registration certificate:

```bash
# Need stake.vkey from air-gapped (copy via USB if not already present)
cardano-cli stake-address registration-certificate \
    --stake-verification-key-file stake.vkey \
    --key-reg-deposit-amt 2000000 \
    --out-file stake-registration.cert
```

Then create the pool registration certificate:

```bash
# Pool parameters
PLEDGE=10000000000          # 10,000 ADA in lovelace
COST=340000000              # 340 ADA minimum fixed fee
MARGIN=0.015                # 1.5% margin
METADATA_URL="https://hwy419.github.io/nacho-builders/poolMetaData.json"
METADATA_HASH="<hash_from_step_4>"

# Get current WAN IP for relay
WAN_IP=$(curl -s ifconfig.me)

cardano-cli conway stake-pool registration-certificate \
    --cold-verification-key-file cold.vkey \
    --vrf-verification-key-file vrf.vkey \
    --pool-pledge $PLEDGE \
    --pool-cost $COST \
    --pool-margin $MARGIN \
    --pool-reward-account-verification-key-file stake.vkey \
    --pool-owner-stake-verification-key-file stake.vkey \
    --mainnet \
    --single-host-pool-relay nacho.builders \
    --pool-relay-port 6001 \
    --single-host-pool-relay nacho.builders \
    --pool-relay-port 6002 \
    --metadata-url "$METADATA_URL" \
    --metadata-hash "$METADATA_HASH" \
    --out-file pool-registration.cert
```

Create delegation certificate (owner delegates to own pool):

```bash
cardano-cli stake-address stake-delegation-certificate \
    --stake-verification-key-file stake.vkey \
    --cold-verification-key-file cold.vkey \
    --out-file owner-delegation.cert
```

### Step 6: Build Registration Transaction

```bash
# Get UTxO info
PAYMENT_ADDR="<your_payment_address>"
cardano-cli query utxo --address $PAYMENT_ADDR --mainnet

# Use the UTxO with sufficient funds
TX_IN="<txhash>#<index>"

# Build transaction
cardano-cli conway transaction build \
    --mainnet \
    --tx-in $TX_IN \
    --tx-out $PAYMENT_ADDR+1000000 \
    --change-address $PAYMENT_ADDR \
    --certificate-file stake-registration.cert \
    --certificate-file pool-registration.cert \
    --certificate-file owner-delegation.cert \
    --witness-override 3 \
    --out-file pool-registration.unsigned
```

### Step 7: Sign Transaction (Air-Gapped)

Transfer `pool-registration.unsigned` to air-gapped VM via USB.

On air-gapped VM:

```bash
cd ~/cold-keys

# Sign with all required keys
cardano-cli transaction sign \
    --tx-file /mnt/usb/pool-registration.unsigned \
    --signing-key-file cold.skey \
    --signing-key-file stake.skey \
    --signing-key-file payment.skey \
    --mainnet \
    --out-file /mnt/usb/pool-registration.signed
```

### Step 8: Submit Transaction

Transfer signed transaction back to Block Producer via USB.

```bash
cardano-cli transaction submit \
    --mainnet \
    --tx-file pool-registration.signed

echo "Pool registration submitted!"
```

### Step 9: Verify Registration

```bash
# Get pool ID
POOL_ID=$(cat /opt/cardano/cnode/priv/pool/NACHO/pool.id)

# Query pool parameters
cardano-cli query pool-params --stake-pool-id $POOL_ID --mainnet

# Check on blockchain explorers:
# - https://cardanoscan.io/pool/$POOL_ID
# - https://pool.pm/$POOL_ID
# - https://cexplorer.io/pool/$POOL_ID
```

---

## Post-Registration Checklist

- [ ] Pool appears on blockchain explorers
- [ ] Pool parameters match intended values
- [ ] Relays are discoverable (check topology)
- [ ] Block Producer shows pool info in gLiveView
- [ ] Delegation to pool is active
- [ ] Monitor for first block production (may take several epochs)

---

## Important Notes

### Pool Activation Timeline

1. **Epoch N**: Registration transaction submitted
2. **Epoch N+1**: Pool becomes active
3. **Epoch N+2**: Pool can be elected for block production
4. **Epoch N+3+**: Rewards begin (if blocks produced)

### Key Security Reminders

| Key | Location | Never On |
|-----|----------|----------|
| `cold.skey` | Air-gapped only | Any networked machine |
| `cold.counter` | Air-gapped only | Any networked machine |
| `stake.skey` | Air-gapped only | Any networked machine |
| `payment.skey` | Air-gapped only | Any networked machine |
| `kes.skey` | Block Producer | Relays, internet |
| `vrf.skey` | Block Producer | Relays, internet |

### KES Key Rotation

KES keys expire every ~90 days (62 epochs). Set a calendar reminder to rotate before expiration:

```bash
# Check KES expiry on Block Producer
cardano-cli query kes-period-info \
    --mainnet \
    --op-cert-file /opt/cardano/cnode/priv/pool/NACHO/op.cert
```

---

## Troubleshooting

### Transaction Fails with Insufficient Funds

- Verify UTxO has enough ADA (>515)
- Check transaction fees in build output
- Ensure change address is correct

### Pool Not Appearing on Explorers

- Wait for next epoch boundary
- Verify transaction was confirmed
- Check pool ID matches

### Block Producer Not Producing Blocks

- Verify all key files are present and have correct permissions
- Check op.cert KES period is current
- Ensure topology allows relay connections
- Monitor logs: `journalctl -u cnode -f`

---

## Quick Reference

### Pool Parameters

| Parameter | Value | Lovelace |
|-----------|-------|----------|
| Ticker | NACHO | — |
| Pledge | 10,000 ADA | 10,000,000,000 |
| Fixed Fee | 340 ADA | 340,000,000 |
| Margin | 1.5% | 0.015 |
| Metadata URL | https://hwy419.github.io/nacho-builders/poolMetaData.json | — |

### Key Commands

```bash
# Check sync status
cardano-cli query tip --mainnet

# Query pool params
cardano-cli query pool-params --stake-pool-id <pool_id> --mainnet

# Check KES expiry
cardano-cli query kes-period-info --mainnet --op-cert-file op.cert

# Query stake address
cardano-cli query stake-address-info --address <stake_addr> --mainnet
```

---

*Document Version: 1.0*
*Last Updated: December 27, 2025*

