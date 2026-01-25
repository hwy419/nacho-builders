# WireGuard VPN Administration

## Overview

WireGuard provides secure remote access to the infrastructure from anywhere. The VPN server runs on pfSense and allows access to all internal VLANs.

## Server Configuration

| Setting | Value |
|---------|-------|
| Server | pfSense (192.168.150.1) |
| Listen Port | 51820 (UDP) |
| Tunnel Network | 192.168.2.0/24 |
| Public Endpoint | nacho.builders:51820 |
| Public Key | `ymsAPBSdfu5YGQNBA0yTYhGnbL30JU97kvSn0USoVUo=` |

### Server Files on pfSense

| File | Purpose |
|------|---------|
| `/usr/local/etc/wireguard/wg0-native.conf` | WireGuard interface configuration |
| `/usr/local/etc/rc.d/wireguard.sh` | Startup script (starts WireGuard, adds firewall rules) |

## Current Clients

| Client | IP Address | Public Key |
|--------|------------|------------|
| Michael Mobile | 192.168.2.10 | `dmW8pnpqyr5/Qv8dQNmP2ZCdUYAK3YH7un5LMDw4yj0=` |
| Michael Mac | 192.168.2.11 | `z5UFGM9SjseFTRlt+wAya2fUidXu8WdLyCKGgVFvBQU=` |

## Accessible Networks

VPN clients can reach all internal networks:

| Network | Subnet | Resources |
|---------|--------|-----------|
| Management | 192.168.150.0/24 | pfSense, Proxmox, NPM, WordPress |
| Mainnet | 192.168.160.0/24 | Block Producer, Relays, Monitoring |
| Preprod | 192.168.161.0/24 | Preprod Relay |
| API Platform | 192.168.170.0/24 | Gateway, DB-Sync |

## Adding a New Client

### Step 1: Generate Client Keys

On the client machine (Mac/Linux):
```bash
# Install WireGuard tools if needed
# macOS: brew install wireguard-tools
# Linux: apt install wireguard-tools

# Generate key pair
wg genkey | tee privatekey | wg pubkey > publickey

# Display the keys
echo "Private Key: $(cat privatekey)"
echo "Public Key: $(cat publickey)"
```

### Step 2: Add Client to pfSense

SSH to pfSense and edit the WireGuard config:
```bash
ssh root@192.168.150.1

# Edit config
vi /usr/local/etc/wireguard/wg0-native.conf
```

Add a new peer section:
```ini
[Peer]
# Client Name
PublicKey = <client_public_key>
AllowedIPs = 192.168.2.XX/32
```

Assign a unique IP from the 192.168.2.10-99 range.

### Step 3: Reload WireGuard

```bash
# Reload the configuration
wg setconf wg0 /usr/local/etc/wireguard/wg0-native.conf

# Verify
wg show wg0
```

### Step 4: Create Client Configuration

Create a config file on the client:

**Full Tunnel (all traffic through VPN):**
```ini
[Interface]
PrivateKey = <client_private_key>
Address = 192.168.2.XX/24
DNS = 192.168.150.1

[Peer]
PublicKey = ymsAPBSdfu5YGQNBA0yTYhGnbL30JU97kvSn0USoVUo=
AllowedIPs = 0.0.0.0/0
Endpoint = nacho.builders:51820
PersistentKeepalive = 25
```

**Split Tunnel (only internal traffic through VPN - recommended):**
```ini
[Interface]
PrivateKey = <client_private_key>
Address = 192.168.2.XX/24
# DNS commented out for split tunnel

[Peer]
PublicKey = ymsAPBSdfu5YGQNBA0yTYhGnbL30JU97kvSn0USoVUo=
AllowedIPs = 192.168.1.0/24, 192.168.2.0/24, 192.168.150.0/24, 192.168.160.0/24, 192.168.161.0/24, 192.168.170.0/24
Endpoint = nacho.builders:51820
PersistentKeepalive = 25
```

### Step 5: Import to WireGuard App

- **macOS/iOS/Android:** Import the .conf file into the WireGuard app
- **Linux:** Copy to `/etc/wireguard/nacho-vpn.conf` and use `wg-quick up nacho-vpn`

## Removing a Client

### Step 1: Remove from pfSense Config

```bash
ssh root@192.168.150.1
vi /usr/local/etc/wireguard/wg0-native.conf
# Delete the [Peer] section for the client
```

### Step 2: Reload WireGuard

```bash
wg setconf wg0 /usr/local/etc/wireguard/wg0-native.conf
wg show wg0
```

## Troubleshooting

### VPN Connected but Can't Reach Internal Networks

**Symptom:** WireGuard shows connected (handshake successful) but pings to internal IPs fail.

**Cause:** pfSense firewall rules may have been cleared.

**Fix:**
```bash
ssh root@192.168.150.1

# Check if rules exist
pfctl -a "natrules/wireguard" -sn
pfctl -a "userrules/wireguard" -sr

# If empty, reload WireGuard (which adds the rules)
/usr/local/etc/rc.d/wireguard.sh restart
```

### Handshake Not Completing

**Symptom:** WireGuard shows "Waiting for handshake" or no handshake timestamp.

**Checks:**
1. Verify UDP 51820 is open: `nc -zvu nacho.builders 51820`
2. Verify client public key matches what's in pfSense config
3. Verify endpoint is reachable: `ping nacho.builders`

### SSH to Relays Timeout via VPN

**Symptom:** Can ping relays but SSH times out.

**Cause:** VPN traffic is NATted, so relays see source IP as pfSense gateway, not VPN client IP.

**Fix:** Add UFW rule on relay to allow SSH from the pfSense gateway IP:
```bash
# On relay (via Proxmox console)
sudo ufw allow from 192.168.160.1 to any port 22 proto tcp comment "SSH from pfSense gateway"
# For preprod (VLAN 161):
sudo ufw allow from 192.168.161.1 to any port 22 proto tcp comment "SSH from pfSense gateway"
```

### Check VPN Status on pfSense

```bash
ssh root@192.168.150.1
/usr/local/etc/rc.d/wireguard.sh status
```

This shows:
- Interface status (UP/DOWN)
- Connected peers with last handshake time
- Data transfer statistics
- Active NAT and filter rules

## Firewall Rules

WireGuard requires specific pf rules to route traffic. These are managed by the startup script and placed in pfSense's evaluated anchors:

### NAT Rules (in `natrules/wireguard` anchor)

```
nat on igb2 from 192.168.2.0/24 to any -> (igb2)
nat on igb2.150 from 192.168.2.0/24 to any -> (igb2.150)
nat on igb2.160 from 192.168.2.0/24 to any -> (igb2.160)
nat on igb2.161 from 192.168.2.0/24 to any -> (igb2.161)
nat on igb2.170 from 192.168.2.0/24 to any -> (igb2.170)
```

### Filter Rules (in `userrules/wireguard` anchor)

```
pass in quick on wg0 from 192.168.2.0/24 to any keep state
pass out quick on wg0 to 192.168.2.0/24 keep state
pass out quick on igb2 from 192.168.2.0/24 to any keep state
pass out quick on igb2.150 from 192.168.2.0/24 to any keep state
pass out quick on igb2.160 from 192.168.2.0/24 to any keep state
pass out quick on igb2.161 from 192.168.2.0/24 to any keep state
pass out quick on igb2.170 from 192.168.2.0/24 to any keep state
```

## Key Rotation

For security, periodically rotate client keys:

1. Generate new key pair on client
2. Update public key in pfSense config
3. Update private key in client config
4. Reload WireGuard on both ends

Recommended rotation: Every 6-12 months or if a device is lost/compromised.

## Backup

The WireGuard configuration is included in pfSense config backups:
```bash
# Manual backup
ssh root@192.168.150.1 "cat /cf/conf/config.xml" > pfsense-backup.xml

# Or use Ansible
cd ~/claudecode/cardano-spo/ansible
ansible-playbook playbooks/91-backup-pfsense.yml
```

---

**Last Updated:** January 2026
**Related Documentation:**
- [Network Configuration](network-configuration.md)
- [pfSense Migration](pfsense-migration.md)
