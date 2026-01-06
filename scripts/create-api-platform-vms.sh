#!/bin/bash
# Create Proxmox VMs for Cardano API Platform (VLAN 170)
# Run this on the Proxmox host

set -e

echo "======================================="
echo " Create API Platform VMs on VLAN 170"
echo "======================================="
echo

# Check if running on Proxmox
if [ ! -f /etc/pve/.version ]; then
    echo "ERROR: This script must be run on the Proxmox host"
    exit 1
fi

# Check if VMs already exist
if qm status 120 &>/dev/null; then
    echo "⚠️  WARNING: VM 120 (cardano-gateway) already exists"
    read -p "Do you want to recreate it? (yes/no): " RECREATE
    if [ "$RECREATE" = "yes" ]; then
        echo "Stopping and removing VM 120..."
        qm stop 120 || true
        qm destroy 120
    else
        echo "Skipping VM 120 creation"
    fi
fi

if qm status 121 &>/dev/null; then
    echo "⚠️  WARNING: VM 121 (cardano-dbsync) already exists"
    read -p "Do you want to recreate it? (yes/no): " RECREATE
    if [ "$RECREATE" = "yes" ]; then
        echo "Stopping and removing VM 121..."
        qm stop 121 || true
        qm destroy 121
    else
        echo "Skipping VM 121 creation"
    fi
fi

echo
echo "Creating VM 120: cardano-gateway"
echo "  - vCPUs: 4"
echo "  - RAM: 8 GB"
echo "  - Storage: 50 GB"
echo "  - Network: VLAN 170"
echo

qm create 120 --name cardano-gateway \
  --memory 8192 --cores 4 --cpu host \
  --net0 virtio,bridge=vmbr0,tag=170,firewall=1 \
  --scsihw virtio-scsi-single \
  --virtio0 local-lvm:50 \
  --boot order=virtio0 --ostype l26 \
  --agent 1

echo "✅ VM 120 created successfully!"
echo

echo "Creating VM 121: cardano-dbsync"
echo "  - vCPUs: 8"
echo "  - RAM: 32 GB"
echo "  - Storage: 500 GB"
echo "  - Network: VLAN 170"
echo

qm create 121 --name cardano-dbsync \
  --memory 32768 --cores 8 --cpu host \
  --net0 virtio,bridge=vmbr0,tag=170,firewall=1 \
  --scsihw virtio-scsi-single \
  --virtio0 local-lvm:500 \
  --boot order=virtio0 --ostype l26 \
  --agent 1

echo "✅ VM 121 created successfully!"
echo

echo "======================================="
echo " VM Creation Summary"
echo "======================================="
echo
qm list | head -1
qm list | grep -E "(120|121)"
echo

echo "==============================================="
echo " Next Steps:"
echo "==============================================="
echo "1. Download Ubuntu 22.04 Server ISO if not present:"
echo "   cd /var/lib/vz/template/iso/"
echo "   wget https://releases.ubuntu.com/22.04/ubuntu-22.04.4-live-server-amd64.iso"
echo
echo "2. Attach ISO to each VM:"
echo "   qm set 120 --ide2 local:iso/ubuntu-22.04.4-live-server-amd64.iso,media=cdrom"
echo "   qm set 121 --ide2 local:iso/ubuntu-22.04.4-live-server-amd64.iso,media=cdrom"
echo
echo "3. Start VMs and install Ubuntu:"
echo "   qm start 120"
echo "   qm start 121"
echo
echo "4. Access console via Proxmox Web UI"
echo
echo "5. During Ubuntu installation, configure static IPs:"
echo "   - cardano-gateway: 192.168.170.10/24, gateway 192.168.170.1"
echo "   - cardano-dbsync:  192.168.170.20/24, gateway 192.168.170.1"
echo
echo "6. After installation, run bootstrap playbook:"
echo "   ansible-playbook ansible/playbooks/00-bootstrap.yml --limit api_platform"
echo




