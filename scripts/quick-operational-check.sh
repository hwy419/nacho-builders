#!/bin/bash

# Quick Operational Health Check for Cardano SPO
# Faster version with essential checks only

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Cardano SPO Quick Operational Check ===${NC}"
echo "Time: $(date '+%H:%M:%S')"
echo ""

# 1. Node Sync Status (Essential)
echo -e "${YELLOW}Node Status:${NC}"
for node in "192.168.160.10:BP" "192.168.160.11:Relay1" "192.168.160.12:Relay2"; do
    IFS=':' read -r ip name <<< "$node"
    SYNC=$(ssh -o ConnectTimeout=2 michael@$ip "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket 2>/dev/null | jq -r '.syncProgress // \"N/A\"'" 2>/dev/null || echo "ERROR")
    if [[ "$SYNC" == "100.00" ]]; then
        echo -e "  $name: ${GREEN}✓ Synced${NC}"
    else
        echo -e "  $name: ${YELLOW}$SYNC%${NC}"
    fi
done

# 2. Peer Connections
echo -e "\n${YELLOW}Peer Connections:${NC}"
BP_PEERS=$(ssh -o ConnectTimeout=2 michael@192.168.160.10 "ss -tn state established '( sport = :6000 )' 2>/dev/null | grep -c -v Local" 2>/dev/null || echo "?")
R1_PEERS=$(ssh -o ConnectTimeout=2 michael@192.168.160.11 "ss -tn state established '( sport = :6000 )' 2>/dev/null | grep -c -v Local" 2>/dev/null || echo "?")
R2_PEERS=$(ssh -o ConnectTimeout=2 michael@192.168.160.12 "ss -tn state established '( sport = :6000 )' 2>/dev/null | grep -c -v Local" 2>/dev/null || echo "?")
echo "  BP: $BP_PEERS | Relay1: $R1_PEERS | Relay2: $R2_PEERS"

# 3. API Quick Test
echo -e "\n${YELLOW}API Services:${NC}"
# Test Ogmios port connectivity only
echo -n "  Ogmios R1: "
if nc -zw1 192.168.160.11 1337 2>/dev/null; then
    echo -e "${GREEN}✓ Port Open${NC}"
else
    echo -e "${RED}✗ Port Closed${NC}"
fi

echo -n "  Ogmios R2: "
if nc -zw1 192.168.160.12 1337 2>/dev/null; then
    echo -e "${GREEN}✓ Port Open${NC}"
else
    echo -e "${RED}✗ Port Closed${NC}"
fi

echo -n "  Submit API: "
if nc -zw1 192.168.160.11 8090 2>/dev/null; then
    echo -e "${GREEN}✓ Port Open${NC}"
else
    echo -e "${RED}✗ Port Closed${NC}"
fi

# 4. DB-Sync Progress
echo -e "\n${YELLOW}DB-Sync:${NC}"
DB_BLOCK=$(ssh -o ConnectTimeout=2 michael@192.168.170.20 "sudo -u postgres psql -d dbsync -t -c 'SELECT MAX(block_no) FROM block' 2>/dev/null" 2>/dev/null | tr -d ' ' || echo "0")
DB_EPOCH=$(ssh -o ConnectTimeout=2 michael@192.168.170.20 "sudo -u postgres psql -d dbsync -t -c 'SELECT MAX(epoch_no) FROM block' 2>/dev/null" 2>/dev/null | tr -d ' ' || echo "0")
if [[ $DB_BLOCK -gt 0 ]]; then
    echo -e "  Block: $DB_BLOCK (Epoch: $DB_EPOCH)"
    # Quick activity check
    sleep 3
    DB_BLOCK2=$(ssh -o ConnectTimeout=2 michael@192.168.170.20 "sudo -u postgres psql -d dbsync -t -c 'SELECT MAX(block_no) FROM block' 2>/dev/null" 2>/dev/null | tr -d ' ' || echo "0")
    if [[ $DB_BLOCK2 -gt $DB_BLOCK ]]; then
        RATE=$(( (DB_BLOCK2 - DB_BLOCK) * 20 ))
        echo -e "  Status: ${GREEN}✓ Syncing (~$RATE blocks/min)${NC}"
    else
        echo -e "  Status: ${YELLOW}⚠ May be stalled${NC}"
    fi
else
    echo -e "  ${RED}✗ Cannot query database${NC}"
fi

# 5. Quick Resource Check
echo -e "\n${YELLOW}Disk Usage:${NC}"
ssh -o ConnectTimeout=2 michael@192.168.160.10 "df -h /opt/cardano 2>/dev/null | tail -1 | awk '{print \"  BP: \"\$5\" used\"}'" 2>/dev/null || echo "  BP: N/A"
ssh -o ConnectTimeout=2 michael@192.168.170.20 "df -h /opt/cardano-db-sync 2>/dev/null | tail -1 | awk '{print \"  DB-Sync: \"\$5\" used\"}'" 2>/dev/null || echo "  DB-Sync: N/A"

echo -e "\n${GREEN}Check complete!${NC}"