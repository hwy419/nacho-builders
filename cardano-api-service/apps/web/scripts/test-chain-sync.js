#!/usr/bin/env node
/**
 * Simple Chain Sync test - connects to Ogmios and fetches a few blocks
 */

const WebSocket = require('ws');

const OGMIOS_URL = process.env.OGMIOS_URL || 'ws://localhost:3001';
const API_KEY = process.env.API_KEY || '';
let requestId = 0;

async function sendRequest(ws, method, params = {}) {
  const id = ++requestId;
  const start = Date.now();

  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      reject(new Error(`Timeout waiting for ${method}`));
    }, 30000);

    const handler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          clearTimeout(timeout);
          ws.off('message', handler);
          const elapsed = Date.now() - start;

          if (response.error) {
            console.log(`  ❌ ${method} failed in ${elapsed}ms: ${response.error.message}`);
            reject(new Error(response.error.message));
          } else {
            console.log(`  ✓ ${method} completed in ${elapsed}ms`);
            resolve(response.result);
          }
        }
      } catch (e) {
        // ignore parse errors for other messages
      }
    };

    ws.on('message', handler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
  });
}

async function main() {
  console.log(`\n🔗 Connecting to ${OGMIOS_URL}...\n`);

  const wsOptions = API_KEY ? { headers: { apikey: API_KEY } } : {};
  const ws = new WebSocket(OGMIOS_URL, wsOptions);

  await new Promise((resolve, reject) => {
    ws.on('open', resolve);
    ws.on('error', reject);
    setTimeout(() => reject(new Error('Connection timeout')), 10000);
  });

  console.log('✓ Connected!\n');
  console.log('--- Testing Ogmios queries ---\n');

  // Test 1: Query tip
  console.log('1. Querying chain tip...');
  const tip = await sendRequest(ws, 'queryNetwork/tip');
  console.log(`   Tip: slot ${tip.slot}, height ${tip.height}\n`);

  // Test 2: Find intersection at tip
  console.log('2. Finding intersection at tip...');
  const intersection = await sendRequest(ws, 'findIntersection', {
    points: [{ slot: tip.slot, id: tip.id }]
  });
  console.log(`   Intersection: slot ${intersection.intersection?.slot || 'origin'}\n`);

  // Test 3: Get next blocks
  console.log('3. Fetching next blocks (waiting for new blocks)...\n');

  for (let i = 0; i < 5; i++) {
    const start = Date.now();
    console.log(`   Block ${i + 1}: waiting...`);

    try {
      const result = await sendRequest(ws, 'nextBlock');
      const elapsed = Date.now() - start;

      if (result.direction === 'forward') {
        const block = result.block;
        console.log(`   Block ${i + 1}: height=${block.height}, slot=${block.slot}, txs=${block.transactions?.length || 0}, wait=${elapsed}ms\n`);
      } else {
        console.log(`   Block ${i + 1}: ROLLBACK to slot ${result.point?.slot}, wait=${elapsed}ms\n`);
      }
    } catch (error) {
      console.log(`   Block ${i + 1}: ERROR - ${error.message}\n`);
      break;
    }
  }

  ws.close();
  console.log('✓ Test complete!\n');
}

main().catch(err => {
  console.error('Test failed:', err.message);
  process.exit(1);
});
