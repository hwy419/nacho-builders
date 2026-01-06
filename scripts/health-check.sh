#!/bin/bash

# Cardano Stake Pool Infrastructure Health Check Script
# This script checks the status of all components in the Cardano SPO infrastructure
# Use after power outages or system maintenance to verify everything is operational

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date '+%Y-%m-%d %H:%M:%S')

# Node IPs
BP_IP="192.168.160.10"
RELAY1_IP="192.168.160.11"
RELAY2_IP="192.168.160.12"
MONITOR_IP="192.168.160.2"
GATEWAY_IP="192.168.170.10"
DBSYNC_IP="192.168.170.20"

# Service names (using simple variables for compatibility)
BP_SERVICES="cnode"
RELAY1_SERVICES="cnode ogmios cardano-submit-api"
RELAY2_SERVICES="cnode ogmios"
MONITORING_SERVICES="prometheus grafana-server"
GATEWAY_SERVICES="kong haproxy"
DBSYNC_SERVICES="cardano-socket-tunnel cardano-db-sync postgresql"

# Results tracking
FAILED_CHECKS=0
TOTAL_CHECKS=0

# Utility functions
log_header() {
    echo -e "\n${BLUE}═══════════════════════════════════════════════════════════════${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}═══════════════════════════════════════════════════════════════${NC}"
}

log_section() {
    echo -e "\n${YELLOW}━━━ $1 ━━━${NC}"
}

log_success() {
    echo -e "${GREEN}✓${NC} $1"
    ((TOTAL_CHECKS++))
}

log_error() {
    echo -e "${RED}✗${NC} $1"
    ((FAILED_CHECKS++))
    ((TOTAL_CHECKS++))
}

log_warning() {
    echo -e "${YELLOW}⚠${NC} $1"
}

log_info() {
    echo -e "  $1"
}

# Check SSH connectivity
check_ssh() {
    local host=$1
    local name=$2
    
    if ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no michael@$host "exit" 2>/dev/null; then
        log_success "$name ($host) - SSH connection successful" "ssh_$name"
        return 0
    else
        log_error "$name ($host) - SSH connection failed" "ssh_$name"
        return 1
    fi
}

# Check service status
check_service() {
    local host=$1
    local service=$2
    local name=$3
    
    if ssh -o ConnectTimeout=5 michael@$host "sudo systemctl is-active $service" 2>/dev/null | grep -q "active"; then
        log_success "$name - $service is active" "${name}_${service}"
        return 0
    else
        log_error "$name - $service is not active" "${name}_${service}"
        return 1
    fi
}

# Check node sync status
check_node_sync() {
    local host=$1
    local name=$2
    
    local sync_status=$(ssh -o ConnectTimeout=10 michael@$host \
        "sudo -u cardano bash -c 'export CARDANO_NODE_SOCKET_PATH=/opt/cardano/cnode/sockets/node.socket && /home/cardano/.local/bin/cardano-cli query tip --mainnet 2>/dev/null'" \
        2>/dev/null | jq -r '.syncProgress // "error"' 2>/dev/null || echo "error")
    
    if [[ "$sync_status" == "error" ]]; then
        log_error "$name - Unable to query node status" "${name}_sync"
        return 1
    elif [[ "$sync_status" == "100.00" ]]; then
        log_success "$name - Fully synced (100%)" "${name}_sync"
        return 0
    else
        log_warning "$name - Syncing: ${sync_status}%" 
        ((TOTAL_CHECKS++))
        return 0
    fi
}

# Check topology connections
check_topology() {
    local host=$1
    local name=$2
    
    local peers=$(ssh -o ConnectTimeout=10 michael@$host \
        "sudo -u cardano bash -c 'ss -tn state established \"( sport = :6000 )\" | grep -v Local | wc -l'" \
        2>/dev/null || echo "0")
    
    if [[ $peers -gt 0 ]]; then
        log_success "$name - $peers peer connections established" "${name}_peers"
        return 0
    else
        log_error "$name - No peer connections" "${name}_peers"
        return 1
    fi
}

# Check API endpoints
check_api() {
    local host=$1
    local port=$2
    local name=$3
    local endpoint=$4
    
    if timeout 5 curl -s "http://${host}:${port}${endpoint}" >/dev/null 2>&1; then
        log_success "$name API endpoint responding on port $port" "${name}_api"
        return 0
    else
        log_error "$name API endpoint not responding on port $port" "${name}_api"
        return 1
    fi
}

# Check DB-Sync status
check_dbsync() {
    local current_block=$(ssh -o ConnectTimeout=10 michael@$DBSYNC_IP \
        "sudo -u postgres psql -d dbsync -t -c 'SELECT MAX(block_no) FROM block;' 2>/dev/null" \
        2>/dev/null | tr -d ' ' || echo "0")
    
    if [[ $current_block -gt 0 ]]; then
        log_success "DB-Sync - Block height: $(printf "%'d" $current_block)" "dbsync_height"
        
        # Check if actively syncing
        local prev_block=$current_block
        sleep 5
        local new_block=$(ssh -o ConnectTimeout=10 michael@$DBSYNC_IP \
            "sudo -u postgres psql -d dbsync -t -c 'SELECT MAX(block_no) FROM block;' 2>/dev/null" \
            2>/dev/null | tr -d ' ' || echo "0")
        
        if [[ $new_block -gt $prev_block ]]; then
            local rate=$((($new_block - $prev_block) * 12))
            log_info "Sync rate: ~$rate blocks/minute"
        else
            log_warning "DB-Sync appears to be stalled"
        fi
        return 0
    else
        log_error "DB-Sync - No blocks found in database" "dbsync_height"
        return 1
    fi
}

# Check monitoring endpoints
check_monitoring() {
    # Prometheus
    if timeout 5 curl -s "http://${MONITOR_IP}:9090/-/ready" >/dev/null 2>&1; then
        log_success "Prometheus is ready" "prometheus_ready"
    else
        log_error "Prometheus is not ready" "prometheus_ready"
    fi
    
    # Grafana
    if timeout 5 curl -s "http://${MONITOR_IP}:3000/api/health" >/dev/null 2>&1; then
        log_success "Grafana is healthy" "grafana_health"
    else
        log_error "Grafana is not healthy" "grafana_health"
    fi
}

# Main health check flow
main() {
    log_header "CARDANO STAKE POOL HEALTH CHECK"
    echo "Timestamp: $TIMESTAMP"
    echo "Checking all infrastructure components..."
    
    # 1. Network Connectivity
    log_section "Network Connectivity"
    check_ssh "$BP_IP" "Block Producer"
    check_ssh "$RELAY1_IP" "Relay 1"
    check_ssh "$RELAY2_IP" "Relay 2"
    check_ssh "$MONITOR_IP" "Monitoring"
    check_ssh "$GATEWAY_IP" "API Gateway"
    check_ssh "$DBSYNC_IP" "DB-Sync"
    
    # 2. Cardano Node Services
    log_section "Cardano Node Services"
    if check_ssh "$BP_IP" "BP" >/dev/null 2>&1; then
        check_service "$BP_IP" "cnode" "Block Producer"
    fi
    
    if check_ssh "$RELAY1_IP" "Relay1" >/dev/null 2>&1; then
        for service in $RELAY1_SERVICES; do
            check_service "$RELAY1_IP" "$service" "Relay 1"
        done
    fi
    
    if check_ssh "$RELAY2_IP" "Relay2" >/dev/null 2>&1; then
        for service in $RELAY2_SERVICES; do
            check_service "$RELAY2_IP" "$service" "Relay 2"
        done
    fi
    
    # 3. Node Sync Status
    log_section "Node Synchronization"
    check_node_sync "$BP_IP" "Block Producer"
    check_node_sync "$RELAY1_IP" "Relay 1"
    check_node_sync "$RELAY2_IP" "Relay 2"
    
    # 4. Topology & Connections
    log_section "Network Topology"
    check_topology "$BP_IP" "Block Producer"
    check_topology "$RELAY1_IP" "Relay 1"
    check_topology "$RELAY2_IP" "Relay 2"
    
    # 5. API Services
    log_section "API Services"
    check_api "$RELAY1_IP" "1337" "Ogmios (Relay 1)" "/health"
    check_api "$RELAY2_IP" "1337" "Ogmios (Relay 2)" "/health"
    # Note: Submit API currently only listens on localhost
    
    # 6. Monitoring Stack
    log_section "Monitoring Services"
    if check_ssh "$MONITOR_IP" "Monitoring" >/dev/null 2>&1; then
        for service in $MONITORING_SERVICES; do
            check_service "$MONITOR_IP" "$service" "Monitoring"
        done
        check_monitoring
    fi
    
    # 7. DB-Sync Services
    log_section "DB-Sync Services"
    if check_ssh "$DBSYNC_IP" "DB-Sync" >/dev/null 2>&1; then
        for service in $DBSYNC_SERVICES; do
            check_service "$DBSYNC_IP" "$service" "DB-Sync"
        done
        check_dbsync
    fi
    
    # 8. API Gateway
    log_section "API Gateway"
    if check_ssh "$GATEWAY_IP" "Gateway" >/dev/null 2>&1; then
        for service in $GATEWAY_SERVICES; do
            check_service "$GATEWAY_IP" "$service" "Gateway"
        done
    fi
    
    # Summary Report
    log_header "HEALTH CHECK SUMMARY"
    echo "Total checks performed: $TOTAL_CHECKS"
    echo "Failed checks: $FAILED_CHECKS"
    
    if [[ $FAILED_CHECKS -eq 0 ]]; then
        echo -e "\n${GREEN}✓ All systems operational!${NC}"
        exit 0
    else
        echo -e "\n${RED}✗ $FAILED_CHECKS issues detected${NC}"
        echo -e "\n${YELLOW}Please check the logs above for failed components.${NC}"
        exit 1
    fi
}

# Run main function
main "$@"