#!/usr/bin/env node
/**
 * Block Subscription Test
 *
 * Connects to Ogmios and subscribes to new blocks using the chain sync protocol.
 * Uses findIntersection to start at tip, then nextBlock to follow the chain.
 *
 * Usage: node block-subscription-test.js [api-key] [num-connections]
 * Example: node block-subscription-test.js napi_xxx 5
 */

const WebSocket = require('ws');

const API_URL = 'wss://api.nacho.builders/v1/ogmios';
const API_KEY = process.argv[2] || 'napi_mgVKAufdHBk4DOvGft4tyGhQJO0RxlKb';
const NUM_CONNECTIONS = parseInt(process.argv[3] || '1', 10);

let running = true;
let totalBlocks = 0;
let totalRollbacks = 0;
const connectionStats = new Map();

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatSlot(slot) {
  // Convert slot to approximate time (slots are ~1 second on mainnet)
  return slot.toLocaleString();
}

async function runSubscription(id) {
  const stats = {
    blocks: 0,
    rollbacks: 0,
    lastBlock: null,
    connected: false,
    startTime: Date.now(),
  };
  connectionStats.set(id, stats);

  return new Promise((resolve) => {
    const ws = new WebSocket(API_URL, { headers: { 'apikey': API_KEY } });
    let requestId = 0;

    const send = (method, params = {}) => {
      const id = ++requestId;
      ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
      return id;
    };

    ws.on('open', async () => {
      stats.connected = true;
      console.log(`[Conn ${id}] Connected, finding intersection at tip...`);

      // First, get the current tip
      send('queryNetwork/tip');
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Handle tip query response
        if (response.result && response.result.slot && !stats.lastBlock) {
          const tip = response.result;
          console.log(`[Conn ${id}] Current tip: slot ${formatSlot(tip.slot)}, hash ${tip.id.slice(0, 16)}...`);

          // Find intersection at the tip
          send('findIntersection', {
            points: [{ slot: tip.slot, id: tip.id }]
          });
          return;
        }

        // Handle findIntersection response
        if (response.result && response.result.intersection) {
          const intersection = response.result.intersection;
          console.log(`[Conn ${id}] Intersection found at slot ${formatSlot(intersection.slot)}`);
          console.log(`[Conn ${id}] Waiting for new blocks...`);

          // Start requesting next blocks
          send('nextBlock');
          return;
        }

        // Handle nextBlock response - RollForward (new block)
        if (response.result && response.result.direction === 'forward') {
          stats.blocks++;
          totalBlocks++;

          const block = response.result.block;
          stats.lastBlock = block;

          // Extract block info based on block type
          let blockInfo = '';
          if (block.babbage || block.conway) {
            const b = block.babbage || block.conway;
            const txCount = b.transactions?.length || 0;
            blockInfo = `slot ${formatSlot(b.slot)}, ${txCount} txs, height ${b.height || 'N/A'}`;
          } else if (block.ebb) {
            blockInfo = `EBB at epoch ${block.ebb.epoch}`;
          } else {
            blockInfo = `slot ${block.slot || 'unknown'}`;
          }

          const elapsed = ((Date.now() - stats.startTime) / 1000).toFixed(0);
          console.log(`[Conn ${id}] [${elapsed}s] NEW BLOCK #${stats.blocks}: ${blockInfo}`);

          // Request next block
          if (running) {
            send('nextBlock');
          }
          return;
        }

        // Handle nextBlock response - RollBackward (chain reorg)
        if (response.result && response.result.direction === 'backward') {
          stats.rollbacks++;
          totalRollbacks++;

          const point = response.result.point;
          const slot = point?.slot || point?.id || 'origin';
          console.log(`[Conn ${id}] ROLLBACK to ${typeof slot === 'number' ? 'slot ' + formatSlot(slot) : slot}`);

          // Continue following the chain
          if (running) {
            send('nextBlock');
          }
          return;
        }

        // Handle errors
        if (response.error) {
          console.error(`[Conn ${id}] Error: ${response.error.message}`);
        }

      } catch (err) {
        console.error(`[Conn ${id}] Parse error:`, err.message);
      }
    });

    ws.on('close', () => {
      stats.connected = false;
      console.log(`[Conn ${id}] Disconnected (blocks: ${stats.blocks}, rollbacks: ${stats.rollbacks})`);
      connectionStats.delete(id);

      // Reconnect if still running
      if (running) {
        console.log(`[Conn ${id}] Reconnecting in 5s...`);
        setTimeout(() => runSubscription(id), 5000);
      } else {
        resolve();
      }
    });

    ws.on('error', (err) => {
      console.error(`[Conn ${id}] WebSocket error:`, err.message);
    });
  });
}

async function main() {
  console.log('='.repeat(70));
  console.log('Block Subscription Test');
  console.log('='.repeat(70));
  console.log(`API: ${API_URL}`);
  console.log(`Connections: ${NUM_CONNECTIONS}`);
  console.log(`Press Ctrl+C to stop`);
  console.log('='.repeat(70));
  console.log('');

  const startTime = Date.now();

  // Start all connections
  const promises = [];
  for (let i = 1; i <= NUM_CONNECTIONS; i++) {
    promises.push(runSubscription(i));
    await sleep(500); // Stagger connections
  }

  // Status reporter
  const statusInterval = setInterval(() => {
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(0);
    const activeConns = connectionStats.size;
    console.log(`\n--- [${elapsed}s] Status: ${activeConns} connections, ${totalBlocks} blocks, ${totalRollbacks} rollbacks ---\n`);
  }, 30000);

  // Handle shutdown
  process.on('SIGINT', async () => {
    console.log('\n\nShutting down...');
    running = false;
    clearInterval(statusInterval);

    await sleep(2000);

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

  // Wait forever (until Ctrl+C)
  await Promise.all(promises);
}

main().catch(console.error);
