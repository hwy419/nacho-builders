#!/bin/bash
# Add VLAN 170 network adapter to Nginx Proxy Manager VM
# Run this on the Proxmox host

set -e

echo "==================================="
echo " Add VLAN 170 to Nginx Proxy Manager"
echo "==================================="
echo

# Check if running on Proxmox
if [ ! -f /etc/pve/.version ]; then
    echo "ERROR: This script must be run on the Proxmox host"
    exit 1
fi

# Prompt for NPM VM ID
echo "Finding Nginx Proxy Manager VM..."
echo
qm list | head -1
qm list | grep -E "(proxy|nginx|npm)" || true
echo

read -p "Enter the VM ID for Nginx Proxy Manager: " NPM_VM_ID

if [ -z "$NPM_VM_ID" ]; then
    echo "ERROR: VM ID is required"
    exit 1
fi

# Verify VM exists
if ! qm status $NPM_VM_ID &>/dev/null; then
    echo "ERROR: VM ID $NPM_VM_ID not found"
    exit 1
fi

echo
echo "Current VM configuration:"
qm config $NPM_VM_ID | grep net
echo

# Add the network adapter
echo "Adding VLAN 170 network adapter (ens20)..."
qm set $NPM_VM_ID --net2 virtio,bridge=vmbr0,tag=170,firewall=1

echo
echo "✅ Network adapter added successfully!"
echo
echo "New configuration:"
qm config $NPM_VM_ID | grep net
echo

echo "==============================================="
echo " Next Steps:"
echo "==============================================="
echo "1. The new interface will appear as 'ens20' in the VM"
echo "2. SSH to NPM VM: ssh <user>@192.168.150.224"
echo "3. Configure ens20 in netplan:"
echo "   sudo nano /etc/netplan/00-installer-config.yaml"
echo
echo "4. Add this configuration:"
echo "   ens20:"
echo "     addresses:"
echo "       - 192.168.170.5/24"
echo
echo "5. Apply: sudo netplan apply"
echo "6. Verify: ping 192.168.170.1"
echo

read -p "Press Enter to continue..."






