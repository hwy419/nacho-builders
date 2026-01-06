# NACHO Pool Configuration
## nacho.builders

This document contains the official pool parameters and configuration.

---

## Pool Parameters

| Parameter | Value | Notes |
|-----------|-------|-------|
| **Ticker** | NACHO | 3-5 characters |
| **Name** | NACHO Pool | Display name |
| **Fixed Fee** | 340 ADA | Per epoch (minimum) |
| **Margin** | 1.5% | Variable fee |
| **Pledge** | 10,000 ADA | Owner commitment |

---

## Pool Identity

| Field | Value |
|-------|-------|
| **Domain** | nacho.builders |
| **Homepage** | https://nacho.builders |
| **Relay 1 DNS** | nacho.builders:6001 |
| **Relay 2 DNS** | nacho.builders:6002 |

---

## Fee Calculation Example

If pool earns **10,000 ADA** in epoch rewards:

```
Fixed Fee:     340 ADA (to pool operator)
Remaining:     9,660 ADA
Margin (1.5%): 144.90 ADA (to pool operator)
Delegators:    9,515.10 ADA (distributed by stake)

Total to Operator: 484.90 ADA
Total to Delegators: 9,515.10 ADA
```

---

## Metadata File

**URL:** `https://hwy419.github.io/nacho-builders/poolMetaData.json`

```json
{
  "name": "NACHO Pool",
  "description": "NACHO Pool - Secure, reliable infrastructure, competitive fees, community focused.",
  "ticker": "NACHO",
  "homepage": "https://nacho.builders"
}
```

> **Note:** Extended metadata (with logo) will be added later.

---

## Extended Metadata File (Optional)

**URL:** `https://nacho.builders/extendedPoolMetaData.json`

```json
{
  "info": {
    "url_png_icon_64x64": "https://nacho.builders/images/nacho-icon-64.png",
    "url_png_logo": "https://nacho.builders/images/nacho-logo.png",
    "location": "United States",
    "social": {
      "twitter_handle": "",
      "telegram_handle": "",
      "github_handle": "",
      "discord_handle": ""
    },
    "about": {
      "me": "Family Medical Supply stake pool operator",
      "server": "Enterprise-grade infrastructure with redundant relays",
      "company": "Family Medical Supply"
    }
  }
}
```

---

## DNS Configuration

### A Records (AWS Route 53) ✅ Configured

| Hostname | Type | Value | TTL |
|----------|------|-------|-----|
| `nacho.builders` | A | WAN IP | 300 |

### Verification

```bash
# Verify DNS resolution
nslookup nacho.builders

# Or with dig
dig nacho.builders +short
```

---

## Registration Command Reference

When ready to register, the command will include:

```bash
cardano-cli conway stake-pool registration-certificate \
  --cold-verification-key-file cold.vkey \
  --vrf-verification-key-file vrf.vkey \
  --pool-pledge 10000000000 \
  --pool-cost 340000000 \
  --pool-margin 0.015 \
  --pool-reward-account-verification-key-file stake.vkey \
  --pool-owner-stake-verification-key-file stake.vkey \
  --mainnet \
  --pool-relay-ipv4 [WAN_IP] \
  --pool-relay-port 6001 \
  --pool-relay-ipv4 [WAN_IP] \
  --pool-relay-port 6002 \
  --metadata-url https://hwy419.github.io/nacho-builders/poolMetaData.json \
  --metadata-hash [CALCULATED_HASH] \
  --out-file pool-registration.cert
```

**Note:** Values are in lovelace (1 ADA = 1,000,000 lovelace)
- Pledge: 10,000 ADA = 10,000,000,000 lovelace
- Cost: 340 ADA = 340,000,000 lovelace
- Margin: 1.5% = 0.015

---

*Last Updated: December 23, 2025*

