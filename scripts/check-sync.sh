#!/bin/bash
# check-sync.sh - Check Cardano node sync status across all nodes
# Usage: ./scripts/check-sync.sh
#
# NACHO Stake Pool - nacho.builders

# Node IPs
BP_IP="192.168.160.10"
RELAY1_IP="192.168.160.11"
RELAY2_IP="192.168.160.12"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo "========================================"
echo "  NACHO Stake Pool - Sync Status Check"
echo "========================================"
echo ""

for host in $BP_IP $RELAY1_IP $RELAY2_IP; do
    case $host in
        $BP_IP)     node_name="Block Producer" ;;
        $RELAY1_IP) node_name="Relay 1" ;;
        $RELAY2_IP) node_name="Relay 2" ;;
    esac
    
    echo "=== $node_name ($host) ==="
    
    result=$(ssh -o ConnectTimeout=10 -o StrictHostKeyChecking=accept-new michael@$host \
        "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet'" 2>&1)
    
    if [ $? -eq 0 ]; then
        echo "$result"
        
        # Extract sync progress
        sync=$(echo "$result" | grep -o '"syncProgress": "[^"]*"' | cut -d'"' -f4)
        if [ ! -z "$sync" ]; then
            if [ "$sync" == "100.00" ]; then
                echo -e "${GREEN}✅ Fully synced${NC}"
            elif (( $(echo "$sync > 90" | bc -l) )); then
                echo -e "${YELLOW}⏳ Almost synced ($sync%)${NC}"
            else
                echo -e "${YELLOW}⏳ Syncing ($sync%)${NC}"
            fi
        fi
    else
        echo -e "${RED}❌ Failed to connect or node not responding${NC}"
        echo "$result"
    fi
    echo ""
done

echo "========================================"
echo "  Check complete: $(date)"
echo "========================================"


