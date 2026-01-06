#!/bin/bash

# Ultra-fast health check - no long-running commands

echo "=== Cardano SPO Fast Status Check ==="
echo "Time: $(date '+%Y-%m-%d %H:%M:%S')"
echo ""

# Quick service checks
echo "Service Status:"
echo -n "  Block Producer: "; ssh -o ConnectTimeout=2 michael@192.168.160.10 "systemctl is-active cnode" 2>/dev/null || echo "unreachable"
echo -n "  Relay 1: "; ssh -o ConnectTimeout=2 michael@192.168.160.11 "systemctl is-active cnode" 2>/dev/null || echo "unreachable"
echo -n "  Relay 2: "; ssh -o ConnectTimeout=2 michael@192.168.160.12 "systemctl is-active cnode" 2>/dev/null || echo "unreachable"
echo -n "  DB-Sync: "; ssh -o ConnectTimeout=2 michael@192.168.170.20 "systemctl is-active cardano-db-sync" 2>/dev/null || echo "unreachable"
echo -n "  Monitoring: "; ssh -o ConnectTimeout=2 michael@192.168.160.2 "systemctl is-active prometheus" 2>/dev/null || echo "unreachable"

echo ""
echo "API Services:"
echo -n "  Ogmios Relay1: "; ssh -o ConnectTimeout=2 michael@192.168.160.11 "systemctl is-active ogmios" 2>/dev/null || echo "unreachable"
echo -n "  Ogmios Relay2: "; ssh -o ConnectTimeout=2 michael@192.168.160.12 "systemctl is-active ogmios" 2>/dev/null || echo "unreachable"
echo -n "  Submit API: "; ssh -o ConnectTimeout=2 michael@192.168.160.11 "systemctl is-active cardano-submit-api" 2>/dev/null || echo "unreachable"

echo ""
echo "DB-Sync Progress:"
ssh -o ConnectTimeout=2 michael@192.168.170.20 "sudo -u postgres psql -d dbsync -t -c 'SELECT '\''  Block: '\'' || MAX(block_no) || '\'' (Epoch '\'' || MAX(epoch_no) || '\'''\'' FROM block;' 2>/dev/null" 2>/dev/null || echo "  Unable to query"

echo ""
echo "Done!"