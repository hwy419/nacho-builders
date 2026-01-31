#!/bin/bash

# Quick Health Check for Cardano SPO Infrastructure
# A faster version that checks essential services

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

echo -e "${GREEN}=== Cardano SPO Quick Health Check ===${NC}"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Check function
check() {
    local name=$1
    local cmd=$2
    
    echo -n "Checking $name... "
    if eval "$cmd" >/dev/null 2>&1; then
        echo -e "${GREEN}✓ OK${NC}"
        return 0
    else
        echo -e "${RED}✗ FAILED${NC}"
        return 1
    fi
}

# Node connectivity and sync
echo -e "\n${YELLOW}Cardano Nodes:${NC}"
check "Block Producer connectivity" "ssh -o ConnectTimeout=3 michael@192.168.160.10 'exit'"
check "Block Producer service" "ssh -o ConnectTimeout=3 michael@192.168.160.10 'sudo systemctl is-active cnode'"
check "Relay 1 connectivity" "ssh -o ConnectTimeout=3 michael@192.168.160.11 'exit'"
check "Relay 1 service" "ssh -o ConnectTimeout=3 michael@192.168.160.11 'sudo systemctl is-active cnode'"
check "Relay 2 connectivity" "ssh -o ConnectTimeout=3 michael@192.168.160.12 'exit'"
check "Relay 2 service" "ssh -o ConnectTimeout=3 michael@192.168.160.12 'sudo systemctl is-active cnode'"

# API Services
echo -e "\n${YELLOW}API Services:${NC}"
check "Ogmios on Relay 1" "ssh -o ConnectTimeout=3 michael@192.168.160.11 'sudo systemctl is-active ogmios'"
check "Ogmios on Relay 2" "ssh -o ConnectTimeout=3 michael@192.168.160.12 'sudo systemctl is-active ogmios'"
check "Submit API on Relay 1" "ssh -o ConnectTimeout=3 michael@192.168.160.11 'sudo systemctl is-active cardano-submit-api'"

# Monitoring
echo -e "\n${YELLOW}Monitoring:${NC}"
check "Prometheus" "ssh -o ConnectTimeout=3 michael@192.168.160.2 'sudo systemctl is-active prometheus'"
check "Grafana" "ssh -o ConnectTimeout=3 michael@192.168.160.2 'sudo systemctl is-active grafana-server'"
check "Grafana Web UI" "curl -s --max-time 5 -o /dev/null -w '%{http_code}' http://192.168.160.2:3000 | grep -q 200"

# DB-Sync
echo -e "\n${YELLOW}DB-Sync:${NC}"
check "DB-Sync connectivity" "ssh -o ConnectTimeout=3 michael@192.168.170.20 'exit'"
check "PostgreSQL" "ssh -o ConnectTimeout=3 michael@192.168.170.20 'sudo systemctl is-active postgresql'"
check "Socket tunnel" "ssh -o ConnectTimeout=3 michael@192.168.170.20 'sudo systemctl is-active cardano-socket-tunnel'"
check "DB-Sync service" "ssh -o ConnectTimeout=3 michael@192.168.170.20 'sudo systemctl is-active cardano-db-sync'"

# Quick sync status
echo -e "\n${YELLOW}Sync Status:${NC}"
BP_SYNC=$(ssh -o ConnectTimeout=3 michael@192.168.160.10 "cd / && sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket 2>/dev/null | jq -r '.syncProgress // \"N/A\"'" 2>/dev/null || echo "N/A")
RELAY1_SYNC=$(ssh -o ConnectTimeout=3 michael@192.168.160.11 "cd / && sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket 2>/dev/null | jq -r '.syncProgress // \"N/A\"'" 2>/dev/null || echo "N/A")
RELAY2_SYNC=$(ssh -o ConnectTimeout=3 michael@192.168.160.12 "cd / && sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket 2>/dev/null | jq -r '.syncProgress // \"N/A\"'" 2>/dev/null || echo "N/A")
DBSYNC_BLOCK=$(ssh -o ConnectTimeout=3 michael@192.168.170.20 "sudo -u postgres psql -d dbsync -t -c 'SELECT MAX(block_no) FROM block;' 2>/dev/null | tr -d ' '" 2>/dev/null || echo "0")

echo "  Block Producer: ${BP_SYNC}%"
echo "  Relay 1: ${RELAY1_SYNC}%"
echo "  Relay 2: ${RELAY2_SYNC}%"
echo "  DB-Sync blocks: $(printf "%'d" $DBSYNC_BLOCK)"

echo -e "\n${GREEN}Health check complete!${NC}"