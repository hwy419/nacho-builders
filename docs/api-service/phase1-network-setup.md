# Phase 1: Network Infrastructure Setup
## Cardano API Service Platform

This document guides you through creating VLAN 170 and configuring network connectivity for the API platform.

---

## Step 1: Create VLAN 170 in UniFi Network Controller

### Access UniFi Controller

1. Open your UniFi Network Controller
2. Navigate to **Settings → Networks**
3. Click **Create New Network**

### VLAN Configuration

```
Name:           API-Platform
Network Type:   Standard (VLAN)
VLAN ID:        170
Gateway IP:     192.168.170.1/24

Advanced Settings:
  DHCP Mode:      None (we'll use static IPs)
  IPv6:           Disabled
  Multicast DNS:  Disabled
  IGMP Snooping:  Enabled
```

4. Click **Apply**
5. Wait for changes to propagate (~30 seconds)

### Verification

From any device on your LAN, verify the VLAN was created:

```bash
ping 192.168.170.1
```

This should work once the VLAN is active.

---

## Step 2: Configure UniFi Firewall Rules

Navigate to **Settings → Firewall & Security → Firewall Rules**

### Rule 1: Allow VLAN 170 to Cardano Relays (Specific Ports)

```
Name:        API-to-Cardano-Relays
Type:        LAN In
Action:      Allow
Source:
  Network:   API-Platform (192.168.170.0/24)
Destination:
  Type:      IP Group
  Group:     Create new "Cardano-Relays" with:
             - 192.168.160.11
             - 192.168.160.12
  Port:      1337, 8090, 6000
Protocol:    TCP
```

### Rule 2: Block VLAN 170 to Block Producer (Explicit Deny)

```
Name:        Block-API-to-BP
Type:        LAN In
Action:      Drop
Source:
  Network:   API-Platform
Destination:
  Type:      IP Address
  IP:        192.168.160.10
Protocol:    All
```

### Rule 3: Allow Management LAN to VLAN 170 SSH

```
Name:        LAN-to-API-SSH
Type:        LAN In
Action:      Allow
Source:
  Network:   Default (LAN)
  Also add:  VPN (192.168.2.0/24) if applicable
Destination:
  Network:   API-Platform
  Port:      22
Protocol:    TCP
```

### Rule Order Matters

Ensure rules are in this order (top to bottom):
1. API-to-Cardano-Relays (allow specific)
2. Block-API-to-BP (deny specific)
3. LAN-to-API-SSH (allow management)
4. (Other existing rules)

---

## Step 3: Add Network Adapter to Nginx Proxy Manager VM

### Find NPM VM ID

First, identify your NPM VM ID in Proxmox:

```bash
ssh root@192.168.150.222
qm list | grep -i proxy
# Or:
qm list | grep 192.168.150.224
```

Note the VM ID (e.g., 100, 101, etc.)

### Add Third Network Adapter

```bash
# Replace <NPM_VM_ID> with your actual VM ID
qm set <NPM_VM_ID> --net2 virtio,bridge=vmbr0,tag=170,firewall=1

# Verify it was added
qm config <NPM_VM_ID> | grep net
```

You should see three network adapters:
- `net0`: VLAN 1 (150.224)
- `net1`: VLAN 160
- `net2`: VLAN 170 (newly added)

---

## Step 4: Configure ens20 Inside NPM VM

### SSH to NPM VM

```bash
ssh <user>@192.168.150.224
```

### Check Current Network Interfaces

```bash
ip link show
```

You should now see `ens20` (or similar) as a new interface.

### Edit Netplan Configuration

```bash
sudo nano /etc/netplan/00-installer-config.yaml
```

### Add ens20 Configuration

Add the new interface to your existing netplan config:

```yaml
network:
  version: 2
  ethernets:
    ens18:
      addresses:
        - 192.168.150.224/24
      routes:
        - to: default
          via: 192.168.150.1
      nameservers:
        addresses: [1.1.1.1, 8.8.8.8]
    
    ens19:
      addresses:
        - 192.168.160.XXX/24    # Your existing VLAN 160 IP
      # No default route - specific routes only
    
    ens20:                       # NEW - VLAN 170
      addresses:
        - 192.168.170.5/24
      # No default route - used to reach VLAN 170 only
```

**Important:** Keep your existing ens18 and ens19 configurations exactly as they are!

### Apply Configuration

```bash
# Test the configuration first
sudo netplan try
# This will apply for 120 seconds and auto-rollback if you disconnect
# Press Enter to keep the changes

# Or apply directly
sudo netplan apply
```

### Verify ens20 Configuration

```bash
# Check ens20 has the IP
ip addr show ens20

# Test connectivity to VLAN 170 gateway
ping -c 3 192.168.170.1

# Should work and show successful pings
```

---

## Step 5: Verification Checklist

- [ ] VLAN 170 created in UniFi
- [ ] Three firewall rules created and in correct order
- [ ] NPM VM has net2 adapter with VLAN tag 170
- [ ] ens20 interface has IP 192.168.170.5
- [ ] Can ping 192.168.170.1 from NPM VM
- [ ] Existing ens18 and ens19 still working

---

## Troubleshooting

### Can't Ping 192.168.170.1

**Check:**
1. VLAN 170 is created and active in UniFi
2. ens20 has correct IP: `ip addr show ens20`
3. Interface is up: `ip link show ens20`

**Fix:**
```bash
# Bring interface up if down
sudo ip link set ens20 up
```

### NPM Lost Network After netplan apply

**If you get disconnected:**
1. Access NPM via Proxmox console: **VM → Console**
2. Check netplan config for syntax errors
3. Restore backup:
   ```bash
   sudo cp /etc/netplan/00-installer-config.yaml.backup /etc/netplan/00-installer-config.yaml
   sudo netplan apply
   ```

### VLAN 170 Gateway Not Responding

**Verify UniFi:**
1. Check VLAN 170 is created
2. Check Gateway IP is 192.168.170.1
3. Check network is not paused

---

## Next Steps

Once this phase is complete, proceed to:
- **Phase 2:** Create Proxmox VMs on VLAN 170
- **Phase 3:** Configure NPM proxy hosts

**Status:** Network infrastructure ready for API platform deployment





