#!/usr/bin/env node
/**
 * Block Subscription Test (Direct to Relay)
 *
 * Connects directly to Ogmios relay nodes to subscribe to new blocks.
 * Bypasses the caching proxy since chain sync requires stateful connections.
 *
 * Usage: node block-subscription-direct.js [num-connections]
 * Example: node block-subscription-direct.js 2
 */

const WebSocket = require('ws');

// Direct relay connections (no proxy)
const RELAY_ENDPOINTS = [
  'ws://192.168.160.11:1337',
  'ws://192.168.160.12:1337',
];

const NUM_CONNECTIONS = parseInt(process.argv[2] || '1', 10);

let running = true;
let totalBlocks = 0;
let totalRollbacks = 0;
const connectionStats = new Map();

function formatSlot(slot) {
  return slot?.toLocaleString() || 'N/A';
}

async function runSubscription(id, endpoint) {
  const stats = {
    blocks: 0,
    rollbacks: 0,
    lastBlock: null,
    connected: false,
    startTime: Date.now(),
    endpoint: endpoint,
  };
  connectionStats.set(id, stats);

  return new Promise((resolve) => {
    console.log(`[Conn ${id}] Connecting to ${endpoint}...`);
    const ws = new WebSocket(endpoint);
    let requestId = 0;

    const send = (method, params = {}) => {
      const msgId = ++requestId;
      ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id: msgId }));
      return msgId;
    };

    ws.on('open', () => {
      stats.connected = true;
      console.log(`[Conn ${id}] Connected to ${endpoint}`);

      // Get current tip first
      send('queryNetwork/tip');
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Handle tip query response - start chain sync from tip
        if (response.result && response.result.slot && response.result.id && !stats.lastBlock) {
          const tip = response.result;
          console.log(`[Conn ${id}] Current tip: slot ${formatSlot(tip.slot)}`);

          // Find intersection at tip
          send('findIntersection', {
            points: [{ slot: tip.slot, id: tip.id }]
          });
          return;
        }

        // Handle findIntersection response
        if (response.result && response.result.intersection) {
          console.log(`[Conn ${id}] Intersection found, waiting for blocks...`);
          send('nextBlock');
          return;
        }

        // Handle RollForward (new block)
        if (response.result && response.result.direction === 'forward') {
          stats.blocks++;
          totalBlocks++;

          const block = response.result.block;
          let slot = 'unknown';
          let height = 'N/A';
          let txCount = 0;
          let era = 'unknown';

          // Parse block based on era
          if (block.babbage) {
            era = 'babbage';
            slot = block.babbage.slot;
            height = block.babbage.height;
            txCount = block.babbage.transactions?.length || 0;
          } else if (block.conway) {
            era = 'conway';
            slot = block.conway.slot;
            height = block.conway.height;
            txCount = block.conway.transactions?.length || 0;
          } else if (block.allegra) {
            era = 'allegra';
            slot = block.allegra.slot;
          } else if (block.mary) {
            era = 'mary';
            slot = block.mary.slot;
          } else if (block.alonzo) {
            era = 'alonzo';
            slot = block.alonzo.slot;
          } else if (block.shelley) {
            era = 'shelley';
            slot = block.shelley.slot;
          }

          const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
          console.log(
            `[Conn ${id}] [${elapsed}s] NEW BLOCK: ` +
            `slot ${formatSlot(slot)}, height ${height}, ${txCount} txs (${era})`
          );

          stats.lastBlock = { slot, height, era };

          if (running) {
            send('nextBlock');
          }
          return;
        }

        // Handle RollBackward
        if (response.result && response.result.direction === 'backward') {
          stats.rollbacks++;
          totalRollbacks++;

          const point = response.result.point;
          if (point === 'origin') {
            console.log(`[Conn ${id}] ROLLBACK to origin`);
          } else {
            console.log(`[Conn ${id}] ROLLBACK to slot ${formatSlot(point?.slot)}`);
          }

          if (running) {
            send('nextBlock');
          }
          return;
        }

        // Handle errors
        if (response.error) {
          console.error(`[Conn ${id}] Error: ${JSON.stringify(response.error)}`);
        }

      } catch (err) {
        console.error(`[Conn ${id}] Parse error:`, err.message);
      }
    });

    ws.on('close', () => {
      stats.connected = false;
      console.log(`[Conn ${id}] Disconnected (blocks: ${stats.blocks}, rollbacks: ${stats.rollbacks})`);

      if (running) {
        console.log(`[Conn ${id}] Reconnecting in 5s...`);
        setTimeout(() => runSubscription(id, endpoint), 5000);
      } else {
        resolve();
      }
    });

    ws.on('error', (err) => {
      console.error(`[Conn ${id}] Error:`, err.message);
    });
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('Block Subscription Test (Direct to Relays)');
  console.log('='.repeat(70));
  console.log(`Relays: ${RELAY_ENDPOINTS.join(', ')}`);
  console.log(`Connections: ${NUM_CONNECTIONS}`);
  console.log('Press Ctrl+C to stop');
  console.log('='.repeat(70));
  console.log('');

  const startTime = Date.now();

  // Distribute connections across relays
  for (let i = 1; i <= NUM_CONNECTIONS; i++) {
    const endpoint = RELAY_ENDPOINTS[(i - 1) % RELAY_ENDPOINTS.length];
    runSubscription(i, endpoint);
    await new Promise(r => setTimeout(r, 500));
  }

  // Status reporter
  const statusInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const activeConns = [...connectionStats.values()].filter(s => s.connected).length;
    console.log(`\n--- [${elapsed}s] Active: ${activeConns}/${NUM_CONNECTIONS}, Blocks: ${totalBlocks}, Rollbacks: ${totalRollbacks} ---\n`);
  }, 30000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    running = false;
    clearInterval(statusInterval);

    await new Promise(r => setTimeout(r, 2000));

    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    console.log('');
    console.log('='.repeat(70));
    console.log('FINAL RESULTS');
    console.log('='.repeat(70));
    console.log(`Duration:    ${duration} seconds`);
    console.log(`Connections: ${NUM_CONNECTIONS}`);
    console.log(`Blocks:      ${totalBlocks}`);
    console.log(`Rollbacks:   ${totalRollbacks}`);
    console.log('='.repeat(70));

    process.exit(0);
  });
}

main().catch(console.error);
