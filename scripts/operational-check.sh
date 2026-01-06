#!/bin/bash

# Operational Health Check for Cardano SPO Infrastructure
# This script verifies services are actually functioning, not just running

set -euo pipefail

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}=== Cardano SPO Operational Health Check ===${NC}"
echo "Timestamp: $(date '+%Y-%m-%d %H:%M:%S')"
echo "Checking operational status of all components..."
echo ""

# Track overall health
ISSUES=0

# Helper function
check_operational() {
    local name=$1
    local check_cmd=$2
    local expected=$3
    
    echo -n "Checking $name... "
    local result=$(eval "$check_cmd" 2>/dev/null || echo "FAILED")
    
    if [[ "$result" == *"$expected"* ]] || [[ "$result" == "$expected" ]]; then
        echo -e "${GREEN}✓ OPERATIONAL${NC} - $result"
        return 0
    else
        echo -e "${RED}✗ ISSUE${NC} - $result"
        ((ISSUES++))
        return 1
    fi
}

# 1. CARDANO NODES - Check sync status and block height
echo -e "\n${YELLOW}Cardano Nodes Operational Status:${NC}"

# Block Producer
BP_INFO=$(ssh -o ConnectTimeout=3 michael@192.168.160.10 "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket 2>/dev/null | jq -r 'select(.syncProgress != null) | \"Block: \" + (.block|tostring) + \" | Sync: \" + .syncProgress + \"%\"'" 2>/dev/null || echo "FAILED")
if [[ "$BP_INFO" == *"100.00%"* ]]; then
    echo -e "  Block Producer: ${GREEN}✓ OPERATIONAL${NC} - $BP_INFO"
else
    echo -e "  Block Producer: ${YELLOW}⚠ SYNCING${NC} - $BP_INFO"
fi

# Relay 1
RELAY1_INFO=$(ssh -o ConnectTimeout=3 michael@192.168.160.11 "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket 2>/dev/null | jq -r 'select(.syncProgress != null) | \"Block: \" + (.block|tostring) + \" | Sync: \" + .syncProgress + \"%\"'" 2>/dev/null || echo "FAILED")
if [[ "$RELAY1_INFO" == *"100.00%"* ]]; then
    echo -e "  Relay 1: ${GREEN}✓ OPERATIONAL${NC} - $RELAY1_INFO"
else
    echo -e "  Relay 1: ${YELLOW}⚠ SYNCING${NC} - $RELAY1_INFO"
fi

# Relay 2
RELAY2_INFO=$(ssh -o ConnectTimeout=3 michael@192.168.160.12 "sudo -u cardano /home/cardano/.local/bin/cardano-cli query tip --mainnet --socket-path /opt/cardano/cnode/sockets/node.socket 2>/dev/null | jq -r 'select(.syncProgress != null) | \"Block: \" + (.block|tostring) + \" | Sync: \" + .syncProgress + \"%\"'" 2>/dev/null || echo "FAILED")
if [[ "$RELAY2_INFO" == *"100.00%"* ]]; then
    echo -e "  Relay 2: ${GREEN}✓ OPERATIONAL${NC} - $RELAY2_INFO"
else
    echo -e "  Relay 2: ${YELLOW}⚠ SYNCING${NC} - $RELAY2_INFO"
fi

# 2. PEER CONNECTIONS - Verify nodes have active connections
echo -e "\n${YELLOW}Network Connectivity:${NC}"
BP_PEERS=$(ssh -o ConnectTimeout=3 michael@192.168.160.10 "ss -tn state established '( sport = :6000 )' 2>/dev/null | grep -v Local | wc -l" 2>/dev/null || echo "0")
RELAY1_PEERS=$(ssh -o ConnectTimeout=3 michael@192.168.160.11 "ss -tn state established '( sport = :6000 )' 2>/dev/null | grep -v Local | wc -l" 2>/dev/null || echo "0")
RELAY2_PEERS=$(ssh -o ConnectTimeout=3 michael@192.168.160.12 "ss -tn state established '( sport = :6000 )' 2>/dev/null | grep -v Local | wc -l" 2>/dev/null || echo "0")

echo "  Block Producer: $BP_PEERS peers (expected: 2 relays only)"
echo "  Relay 1: $RELAY1_PEERS peers"
echo "  Relay 2: $RELAY2_PEERS peers"

# 3. API SERVICES - Test actual endpoints
echo -e "\n${YELLOW}API Services Operational Tests:${NC}"

# Ogmios on Relay 1 - Test WebSocket endpoint
OGMIOS1_RESP=$(echo '{"jsonrpc":"2.0","method":"queryNetworkBlockHeight","id":1}' | nc -w 2 192.168.160.11 1337 2>/dev/null | jq -r '.result // "FAILED"' 2>/dev/null || echo "FAILED")
if [[ "$OGMIOS1_RESP" =~ ^[0-9]+$ ]]; then
    echo -e "  Ogmios Relay 1: ${GREEN}✓ OPERATIONAL${NC} - Block height: $OGMIOS1_RESP"
else
    echo -e "  Ogmios Relay 1: ${RED}✗ NOT RESPONDING${NC}"
    ((ISSUES++))
fi

# Ogmios on Relay 2
OGMIOS2_RESP=$(echo '{"jsonrpc":"2.0","method":"queryNetworkBlockHeight","id":1}' | nc -w 2 192.168.160.12 1337 2>/dev/null | jq -r '.result // "FAILED"' 2>/dev/null || echo "FAILED")
if [[ "$OGMIOS2_RESP" =~ ^[0-9]+$ ]]; then
    echo -e "  Ogmios Relay 2: ${GREEN}✓ OPERATIONAL${NC} - Block height: $OGMIOS2_RESP"
else
    echo -e "  Ogmios Relay 2: ${RED}✗ NOT RESPONDING${NC}"
    ((ISSUES++))
fi

# Submit API - Check if port is listening
SUBMIT_API_CHECK=$(nc -zv -w 2 192.168.160.11 8090 2>&1 | grep -o "succeeded" || echo "FAILED")
if [[ "$SUBMIT_API_CHECK" == "succeeded" ]]; then
    echo -e "  Submit API: ${GREEN}✓ OPERATIONAL${NC} - Port 8090 accepting connections"
else
    echo -e "  Submit API: ${RED}✗ NOT ACCESSIBLE${NC}"
    ((ISSUES++))
fi

# 4. MONITORING STACK
echo -e "\n${YELLOW}Monitoring Stack:${NC}"

# Prometheus targets
PROM_TARGETS=$(curl -s --max-time 3 http://192.168.160.2:9090/api/v1/targets 2>/dev/null | jq -r '.data.activeTargets | length // 0' 2>/dev/null || echo "0")
if [[ $PROM_TARGETS -gt 0 ]]; then
    echo -e "  Prometheus: ${GREEN}✓ OPERATIONAL${NC} - Monitoring $PROM_TARGETS targets"
else
    echo -e "  Prometheus: ${RED}✗ NO TARGETS${NC}"
    ((ISSUES++))
fi

# Grafana API
GRAFANA_STATUS=$(curl -s --max-time 3 -o /dev/null -w "%{http_code}" http://192.168.160.2:3000/api/health 2>/dev/null || echo "000")
if [[ "$GRAFANA_STATUS" == "200" ]]; then
    echo -e "  Grafana: ${GREEN}✓ OPERATIONAL${NC} - Web UI responding"
else
    echo -e "  Grafana: ${YELLOW}⚠ WEB UI ISSUE${NC} - HTTP $GRAFANA_STATUS"
fi

# 5. DB-SYNC PROGRESS
echo -e "\n${YELLOW}DB-Sync Status:${NC}"

# Check if actively syncing
DBSYNC_INFO=$(ssh -o ConnectTimeout=3 michael@192.168.170.20 "sudo -u postgres psql -d dbsync -t -c \"SELECT 'Block: ' || MAX(block_no) || ' | Epoch: ' || MAX(epoch_no) || ' | Latest: ' || to_char(MAX(time), 'YYYY-MM-DD HH24:MI') FROM block;\" 2>/dev/null" 2>/dev/null || echo "QUERY FAILED")
if [[ "$DBSYNC_INFO" != "QUERY FAILED" ]]; then
    echo -e "  Database: ${GREEN}✓ ACCESSIBLE${NC}"
    echo "  $DBSYNC_INFO"
    
    # Check recent activity
    RECENT_BLOCKS=$(ssh -o ConnectTimeout=3 michael@192.168.170.20 "sudo -u postgres psql -d dbsync -t -c \"SELECT COUNT(*) FROM block WHERE time > NOW() - INTERVAL '5 minutes';\" 2>/dev/null | tr -d ' '" 2>/dev/null || echo "0")
    if [[ $RECENT_BLOCKS -gt 0 ]]; then
        echo -e "  Sync Status: ${GREEN}✓ ACTIVELY SYNCING${NC} - $RECENT_BLOCKS blocks in last 5 min"
    else
        echo -e "  Sync Status: ${YELLOW}⚠ POSSIBLY STALLED${NC}"
        ((ISSUES++))
    fi
else
    echo -e "  Database: ${RED}✗ CANNOT QUERY${NC}"
    ((ISSUES++))
fi

# 6. SYSTEM RESOURCES
echo -e "\n${YELLOW}System Resources:${NC}"

# Check disk space on critical nodes
echo "  Disk Usage:"
for host in "192.168.160.10:BP" "192.168.160.11:Relay1" "192.168.160.12:Relay2" "192.168.170.20:DB-Sync"; do
    IFS=':' read -r ip name <<< "$host"
    DISK_USAGE=$(ssh -o ConnectTimeout=2 michael@$ip "df -h /opt 2>/dev/null | grep -v Filesystem | awk '{print \$5\" used\"}'" 2>/dev/null || echo "N/A")
    echo "    $name: $DISK_USAGE"
done

# Memory usage
echo "  Memory Usage:"
for host in "192.168.160.10:BP" "192.168.160.11:Relay1" "192.168.160.12:Relay2"; do
    IFS=':' read -r ip name <<< "$host"
    MEM_USAGE=$(ssh -o ConnectTimeout=2 michael@$ip "free -h 2>/dev/null | grep Mem | awk '{print \$3\"/\"\$2\" (\"int(\$3/\$2*100)\"%)\"}'" 2>/dev/null || echo "N/A")
    echo "    $name: $MEM_USAGE"
done

# SUMMARY
echo -e "\n${BLUE}════════════════════════════════════════${NC}"
if [[ $ISSUES -eq 0 ]]; then
    echo -e "${GREEN}✓ ALL SYSTEMS OPERATIONAL${NC}"
    echo "All components are functioning correctly."
    exit 0
else
    echo -e "${RED}✗ $ISSUES ISSUES DETECTED${NC}"
    echo "Please review the issues above."
    exit 1
fi