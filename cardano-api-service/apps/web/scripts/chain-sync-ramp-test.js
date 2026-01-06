#!/usr/bin/env node
/**
 * Chain Sync Ramping Load Test with Relay Monitoring
 *
 * Simulates multiple chain sync clients following the blockchain.
 * Each client establishes a persistent WebSocket connection and syncs the chain.
 * Can start from the current tip (real-time following) or from a historical point
 * (catch-up mode) for more aggressive load testing.
 *
 * Usage: node chain-sync-ramp-test.js [options]
 *
 * Options:
 *   --interval <seconds>    Seconds between spawning new clients (default: 1)
 *   --max-clients <number>  Maximum concurrent chain sync clients (default: 50)
 *   --duration <minutes>    Total test duration in minutes (default: 5)
 *   --load-limit <percent>  Stop if relay load exceeds this % (default: 75)
 *   --network <name>        Network to test: mainnet or preprod (default: mainnet)
 *   --pipeline <depth>      Pipeline depth for nextBlock requests (default: 15)
 *   --blocks-back <number>  Blocks each client syncs from origin (default: 8000)
 *
 * Examples:
 *   node chain-sync-ramp-test.js                                    # Run with defaults
 *   node chain-sync-ramp-test.js --blocks-back 0                    # Follow tip (real-time)
 *   node chain-sync-ramp-test.js --max-clients 100 --load-limit 90  # More aggressive
 *   node chain-sync-ramp-test.js --network preprod                  # Test preprod
 */

const WebSocket = require('ws');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    interval: 1,
    maxClients: 50,
    duration: 5,
    loadLimit: 75,
    network: 'mainnet',
    pipeline: 15,
    blocksBack: 8000,  // 0 = start from tip, >0 = sync N blocks total
    startHeight: 0, // Specific block height to start from (0 = use tip or origin)
    startSlot: 0,   // Specific slot to start from
    startId: '',    // Block hash/id at startSlot
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--interval':
        config.interval = parseInt(args[++i], 10);
        break;
      case '--max-clients':
        config.maxClients = parseInt(args[++i], 10);
        break;
      case '--duration':
        config.duration = parseFloat(args[++i]);
        break;
      case '--load-limit':
        config.loadLimit = parseInt(args[++i], 10);
        break;
      case '--network':
        config.network = args[++i];
        break;
      case '--pipeline':
        config.pipeline = parseInt(args[++i], 10);
        break;
      case '--blocks-back':
        config.blocksBack = parseInt(args[++i], 10);
        break;
      case '--start-height':
        config.startHeight = parseInt(args[++i], 10);
        break;
      case '--start-slot':
        config.startSlot = parseInt(args[++i], 10);
        break;
      case '--start-id':
        config.startId = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Chain Sync Ramping Load Test with Relay Monitoring

Simulates multiple chain sync clients syncing the blockchain.
Can follow the tip (real-time) or catch up from a historical point.

Usage: node chain-sync-ramp-test.js [options]

Options:
  --interval <seconds>    Seconds between spawning new clients (default: 5)
  --max-clients <number>  Maximum concurrent chain sync clients (default: 20)
  --duration <minutes>    Total test duration in minutes (default: 5)
  --load-limit <percent>  Stop if relay load exceeds this % (default: 75)
  --network <name>        Network: mainnet or preprod (default: mainnet)
  --pipeline <depth>      Pipeline depth for nextBlock requests (default: 1)
  --blocks-back <number>  Number of blocks each client should sync (default: 0 = unlimited)
  --start-slot <number>   Slot number to start from (requires --start-id)
  --start-id <hash>       Block hash at start-slot

Examples:
  node chain-sync-ramp-test.js --interval 10 --max-clients 10
  node chain-sync-ramp-test.js --duration 10 --load-limit 50
  node chain-sync-ramp-test.js --network preprod --pipeline 5
  node chain-sync-ramp-test.js --start-slot 140000000 --start-id abc123... --blocks-back 500
`);
        process.exit(0);
    }
  }

  return config;
}

const CONFIG = parseArgs();

// API configuration
const API_URLS = {
  mainnet: 'wss://api.nacho.builders/v1/ogmios',
  preprod: 'wss://api.nacho.builders/v1/preprod/ogmios',
};
const API_URL = API_URLS[CONFIG.network] || API_URLS.mainnet;
const API_KEY = process.env.API_KEY || 'napi_mgVKAufdHBk4DOvGft4tyGhQJO0RxlKb';

// Relay nodes to monitor
const RELAY_NODES = {
  mainnet: [
    { host: '192.168.160.11', name: 'Relay1' },
    { host: '192.168.160.12', name: 'Relay2' },
  ],
  preprod: [
    { host: '192.168.161.11', name: 'Preprod' },
  ],
};
const RELAYS = RELAY_NODES[CONFIG.network] || RELAY_NODES.mainnet;

// Test timing
const TEST_DURATION_MS = CONFIG.duration * 60 * 1000;
const SPAWN_INTERVAL_MS = CONFIG.interval * 1000;
const LOAD_CHECK_INTERVAL_MS = 10000;

// Global stats
const stats = {
  activeClients: 0,
  totalClientsSpawned: 0,
  totalBlocks: 0,
  totalRollbacks: 0,
  messagesSent: 0,
  messagesReceived: 0,
  startTime: null,
  loadHistory: [],
  stoppedByLoad: false,
  peakLoad: 0,
  peakClients: 0,
  connectionErrors: 0,
  latencies: [],  // All response latencies in ms
  blocksByClient: {},
  // Per-client tracking for billing verification
  clientStats: new Map(),
  // Track clients that have caught up to the tip
  clientsCaughtUp: 0,
};

// Calculate latency percentiles
function calculateLatencyStats(latencies) {
  if (latencies.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  const percentile = (p) => sorted[Math.floor(sorted.length * p / 100)] || 0;
  return {
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p50: percentile(50),
    p95: percentile(95),
    p99: percentile(99),
  };
}

let testRunning = true;
let clientIdCounter = 0;

// Global tip info (fetched once at start)
let globalTip = null;
let historicalSlot = null;
let startPoint = null;  // { slot, id } for historical sync starting point

// Utility functions
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function formatSlot(slot) {
  return slot.toLocaleString();
}

function progressBar(current, max, width = 20) {
  const pct = max > 0 ? Math.min(current / max, 1) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

// Get relay load via SSH
async function getRelayLoad(relay) {
  try {
    const { stdout } = await execAsync(
      `ssh -o ConnectTimeout=3 -o StrictHostKeyChecking=no michael@${relay.host} "cat /proc/loadavg && nproc"`,
      { timeout: 5000 }
    );
    const lines = stdout.trim().split('\n');
    const loadParts = lines[0].split(' ');
    const load1min = parseFloat(loadParts[0]);
    const cpuCount = parseInt(lines[1], 10);
    const loadPercent = (load1min / cpuCount) * 100;
    return { relay: relay.name, load: load1min, cpus: cpuCount, percent: loadPercent };
  } catch (err) {
    return { relay: relay.name, load: -1, cpus: 0, percent: -1, error: err.message };
  }
}

// Check all relay loads
async function checkRelayLoads() {
  const results = await Promise.all(RELAYS.map(r => getRelayLoad(r)));
  const maxLoad = Math.max(...results.filter(r => r.percent >= 0).map(r => r.percent));

  stats.loadHistory.push({
    time: Date.now() - stats.startTime,
    loads: results,
    maxPercent: maxLoad,
  });

  if (maxLoad > stats.peakLoad) {
    stats.peakLoad = maxLoad;
  }

  return { results, maxPercent: maxLoad };
}

// Fetch current tip from the network (one-time at start)
async function fetchCurrentTip() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(API_URL, {
      headers: { 'apikey': API_KEY }
    });

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error('Timeout fetching tip'));
    }, 10000);

    ws.on('open', () => {
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'queryNetwork/tip',
        id: 'get-tip'
      }));
    });

    ws.on('message', (data) => {
      clearTimeout(timeout);
      try {
        const response = JSON.parse(data.toString());
        if (response.result && response.result.slot) {
          ws.close();
          resolve(response.result);
        } else {
          ws.close();
          reject(new Error('Invalid tip response'));
        }
      } catch (err) {
        ws.close();
        reject(err);
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });
  });
}

// Find a block at a specific height by syncing from origin
// Returns { slot, id } that can be used for findIntersection
async function findBlockAtHeight(targetHeight) {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(API_URL, {
      headers: { 'apikey': API_KEY }
    });

    let foundBlock = null;
    let blocksReceived = 0;
    const pipelineDepth = 100;  // Aggressive pipelining for quick sync
    let pendingRequests = 0;

    const timeout = setTimeout(() => {
      ws.close();
      reject(new Error(`Timeout finding block at height ${targetHeight}`));
    }, 120000);  // 2 minute timeout

    const requestNextBlocks = (count) => {
      for (let i = 0; i < count && pendingRequests < pipelineDepth; i++) {
        ws.send(JSON.stringify({ jsonrpc: '2.0', method: 'nextBlock', id: `nb-${pendingRequests}` }));
        pendingRequests++;
      }
    };

    ws.on('open', () => {
      // Start from origin
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'findIntersection',
        params: { points: ['origin'] },
        id: 'find-origin'
      }));
    });

    ws.on('message', (data) => {
      try {
        const response = JSON.parse(data.toString());

        // Handle findIntersection response
        if (response.id === 'find-origin' && response.result) {
          // Start syncing
          requestNextBlocks(pipelineDepth);
          return;
        }

        // Handle block response
        if (response.result && response.result.direction === 'forward') {
          pendingRequests--;
          const block = response.result.block;

          if (block && block.height !== undefined) {
            blocksReceived++;

            // Progress indicator every 10000 blocks
            if (blocksReceived % 10000 === 0) {
              process.stdout.write(`\r  Scanning... height ${block.height.toLocaleString()} (target: ${targetHeight.toLocaleString()})`);
            }

            if (block.height >= targetHeight) {
              foundBlock = { slot: block.slot, id: block.id, height: block.height };
              clearTimeout(timeout);
              ws.close();
              console.log('');  // New line after progress
              resolve(foundBlock);
              return;
            }
          }

          // Keep requesting more blocks
          requestNextBlocks(pipelineDepth - pendingRequests);
        }

        // Handle rollback (shouldn't happen from origin but handle gracefully)
        if (response.result && response.result.direction === 'backward') {
          pendingRequests--;
          requestNextBlocks(1);
        }

      } catch (err) {
        // Ignore parse errors
      }
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      reject(err);
    });

    ws.on('close', () => {
      if (!foundBlock) {
        clearTimeout(timeout);
        reject(new Error('Connection closed before finding block'));
      }
    });
  });
}

// Run a single chain sync client
async function runChainSyncClient(clientId) {
  stats.activeClients++;
  stats.clientStats.set(clientId, {
    blocks: 0,
    rollbacks: 0,
    sent: 0,
    received: 0,
    latencies: [],  // Per-request latencies in ms
    startTime: Date.now(),
    connected: false,
    caughtUp: false,
    startSlot: CONFIG.blocksBack > 0 ? historicalSlot : globalTip.slot,
    currentSlot: CONFIG.blocksBack > 0 ? historicalSlot : globalTip.slot,
  });

  if (stats.activeClients > stats.peakClients) {
    stats.peakClients = stats.activeClients;
  }

  return new Promise((resolve) => {
    const ws = new WebSocket(API_URL, {
      headers: { 'apikey': API_KEY }
    });

    const clientStat = stats.clientStats.get(clientId);
    let requestId = 0;
    let pendingNextBlocks = 0;

    // Track request timestamps for latency calculation
    const requestTimestamps = new Map();

    const send = (method, params = {}) => {
      if (ws.readyState !== WebSocket.OPEN) return;
      const id = ++requestId;
      requestTimestamps.set(id, Date.now());
      ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
      stats.messagesSent++;
      clientStat.sent++;
      return id;
    };

    const requestNextBlocks = (count = 1) => {
      for (let i = 0; i < count; i++) {
        send('nextBlock');
        pendingNextBlocks++;
      }
    };

    ws.on('open', () => {
      clientStat.connected = true;

      // Determine where to start syncing from
      if (startPoint) {
        // Use the pre-calculated start point (from --start-height)
        send('findIntersection', {
          points: [{ slot: startPoint.slot, id: startPoint.id }]
        });
        clientStat.startSlot = startPoint.slot;
        clientStat.currentSlot = startPoint.slot;
      } else if (CONFIG.blocksBack > 0) {
        // Start from origin - will sync blocksBack blocks total
        send('findIntersection', {
          points: ['origin']
        });
      } else {
        // Start from current tip (real-time following)
        send('findIntersection', {
          points: [{ slot: globalTip.slot, id: globalTip.id }]
        });
      }
    });

    ws.on('message', (data) => {
      stats.messagesReceived++;
      clientStat.received++;

      if (!testRunning) {
        ws.close();
        return;
      }

      try {
        const response = JSON.parse(data.toString());

        // Calculate latency if we have a request timestamp for this response
        if (response.id && requestTimestamps.has(response.id)) {
          const latency = Date.now() - requestTimestamps.get(response.id);
          requestTimestamps.delete(response.id);
          stats.latencies.push(latency);
          clientStat.latencies.push(latency);
        }

        // Handle findIntersection response
        // Note: 'origin' returns intersection: "origin", not an object
        // Must check for intersection specifically - nextBlock responses also have 'tip'
        if (response.result && response.result.intersection !== undefined) {
          clientStat.intersectionFound = true;
          const intersection = response.result.intersection;
          if (intersection && typeof intersection === 'object' && intersection.slot) {
            clientStat.startSlot = intersection.slot;
            clientStat.currentSlot = intersection.slot;
          } else if (intersection === 'origin') {
            clientStat.startSlot = 0;
            clientStat.currentSlot = 0;
          }
          // Start requesting next blocks (with pipeline depth)
          requestNextBlocks(CONFIG.pipeline);
          return;
        }

        // Handle nextBlock response - RollForward
        if (response.result && response.result.direction === 'forward') {
          pendingNextBlocks--;
          clientStat.blocks++;
          stats.totalBlocks++;

          // Track current slot to detect catch-up
          const block = response.result.block;
          if (block && block.slot) {
            clientStat.currentSlot = block.slot;

            // Check if we've caught up to the tip (or reached target blocks)
            if (!clientStat.caughtUp) {
              if (CONFIG.blocksBack > 0 && clientStat.blocks >= CONFIG.blocksBack) {
                // Historical mode: reached target block count
                clientStat.caughtUp = true;
                stats.clientsCaughtUp++;
                // Disconnect after reaching target
                ws.close();
                return;
              } else if (CONFIG.blocksBack === 0 && block.slot >= globalTip.slot) {
                // Real-time mode: caught up to tip
                clientStat.caughtUp = true;
                stats.clientsCaughtUp++;
              }
            }
          }

          // Request more blocks to maintain pipeline (unless we're done)
          if (pendingNextBlocks < CONFIG.pipeline && testRunning && !clientStat.caughtUp) {
            requestNextBlocks(CONFIG.pipeline - pendingNextBlocks);
          }
          return;
        }

        // Handle nextBlock response - RollBackward
        if (response.result && response.result.direction === 'backward') {
          pendingNextBlocks--;
          clientStat.rollbacks++;
          stats.totalRollbacks++;

          // Update current slot on rollback
          const point = response.result.point;
          if (point && point.slot) {
            clientStat.currentSlot = point.slot;
          }

          // Continue following the chain
          if (pendingNextBlocks < CONFIG.pipeline && testRunning) {
            requestNextBlocks(CONFIG.pipeline - pendingNextBlocks);
          }
          return;
        }

        // Handle errors
        if (response.error) {
          if (response.error.code === -32029) {
            // Rate limited - log it
            console.log(`\x1b[31m[Client ${clientId}] Rate limited!\x1b[0m`);
          }
        }

      } catch (err) {
        // Parse error, ignore
      }
    });

    ws.on('close', () => {
      stats.activeClients--;
      const finalStat = stats.clientStats.get(clientId);
      if (finalStat) {
        finalStat.endTime = Date.now();
        finalStat.duration = finalStat.endTime - finalStat.startTime;
      }
      resolve();
    });

    ws.on('error', (err) => {
      stats.connectionErrors++;
      // Will trigger close
    });

    // Close connection when test ends
    const checkInterval = setInterval(() => {
      if (!testRunning && ws.readyState === WebSocket.OPEN) {
        clearInterval(checkInterval);
        ws.close();
      }
    }, 1000);
  });
}

// Print current status
function printStatus(loadInfo) {
  const elapsed = Date.now() - stats.startTime;
  const elapsedStr = formatTime(elapsed);
  const remaining = formatTime(Math.max(0, TEST_DURATION_MS - elapsed));

  const blocksPerSec = elapsed > 0 ? (stats.totalBlocks / (elapsed / 1000)).toFixed(2) : '0.00';
  const msgsPerSec = elapsed > 0 ? ((stats.messagesSent + stats.messagesReceived) / (elapsed / 1000)).toFixed(1) : '0.0';

  // Load bar coloring
  const loadPct = loadInfo.maxPercent;
  let loadColor = '\x1b[32m'; // Green
  if (loadPct > 30) loadColor = '\x1b[33m'; // Yellow
  if (loadPct > 50) loadColor = '\x1b[31m'; // Red

  const clientBar = progressBar(stats.activeClients, CONFIG.maxClients, 15);
  const loadBar = progressBar(loadPct, 100, 10);

  // Format relay loads
  const relayLoads = loadInfo.results
    .map(r => `${r.relay}:${r.percent >= 0 ? r.percent.toFixed(0) + '%' : 'ERR'}`)
    .join(' ');

  // Estimated credits (both directions)
  const estimatedCredits = stats.messagesSent + stats.messagesReceived;

  // Build status line
  let statusLine =
    `\x1b[36m[${elapsedStr}]\x1b[0m ` +
    `Clients [${clientBar}] ${stats.activeClients}/${stats.totalClientsSpawned} | ` +
    `${loadColor}Load [${loadBar}] ${loadPct.toFixed(0)}%\x1b[0m (${relayLoads}) | ` +
    `\x1b[32m${stats.totalBlocks} blks\x1b[0m`;

  // Show catch-up progress if syncing from history
  if (CONFIG.blocksBack > 0) {
    statusLine += ` | \x1b[36m${stats.clientsCaughtUp} caught up\x1b[0m`;
  }

  // Add latency stats
  const latencyStats = calculateLatencyStats(stats.latencies);
  const latencyStr = latencyStats.avg > 0 ? `${latencyStats.avg}ms` : '-';

  statusLine += ` | \x1b[33m${msgsPerSec} msg/s\x1b[0m | \x1b[34m${latencyStr} avg\x1b[0m | \x1b[35m~${estimatedCredits} credits\x1b[0m`;

  console.log(statusLine);
}

// Main test runner
async function runTest() {
  console.log('\x1b[36m');
  console.log('================================================================================');
  console.log('            CHAIN SYNC RAMPING LOAD TEST (STATEFUL CONNECTIONS)');
  console.log('================================================================================');
  console.log('\x1b[0m');

  // Fetch current tip first
  console.log('  Fetching current network tip...');
  try {
    globalTip = await fetchCurrentTip();
    console.log(`  Current tip: slot ${formatSlot(globalTip.slot)}, height ${globalTip.height || 'N/A'}`);
  } catch (err) {
    console.error(`\x1b[31m  Failed to fetch tip: ${err.message}\x1b[0m`);
    process.exit(1);
  }

  // Set up start point based on options
  if (CONFIG.startSlot > 0 && CONFIG.startId) {
    // Use directly provided slot and id
    startPoint = { slot: CONFIG.startSlot, id: CONFIG.startId };
    console.log(`  Using provided start point: slot ${formatSlot(startPoint.slot)}`);
  } else if (CONFIG.startHeight > 0) {
    console.log(`  Finding block at height ${CONFIG.startHeight.toLocaleString()}...`);
    console.log('  (This may take a while - syncing from origin to find the block...)');
    try {
      startPoint = await findBlockAtHeight(CONFIG.startHeight);
      console.log(`  Found start point: slot ${formatSlot(startPoint.slot)}, height ${startPoint.height.toLocaleString()}`);
    } catch (err) {
      console.error(`\x1b[31m  Failed to find block at height ${CONFIG.startHeight}: ${err.message}\x1b[0m`);
      process.exit(1);
    }
  } else if (CONFIG.blocksBack > 0) {
    // Will use 'origin' for sync if no start point provided
    console.log(`  Historical sync: will sync ${CONFIG.blocksBack} blocks from origin`);
  }

  console.log('');
  console.log(`  Network:        ${CONFIG.network}`);
  console.log(`  API URL:        ${API_URL}`);
  console.log(`  Spawn interval: ${CONFIG.interval} seconds`);
  console.log(`  Max clients:    ${CONFIG.maxClients}`);
  console.log(`  Duration:       ${CONFIG.duration} minutes`);
  console.log(`  Load limit:     ${CONFIG.loadLimit}%`);
  console.log(`  Pipeline depth: ${CONFIG.pipeline}`);
  if (CONFIG.startHeight > 0) {
    console.log(`  Start height:   \x1b[33m${CONFIG.startHeight.toLocaleString()}\x1b[0m (historical sync)`);
  }
  if (CONFIG.blocksBack > 0) {
    console.log(`  Blocks to sync: \x1b[33m${CONFIG.blocksBack}\x1b[0m per client`);
  } else {
    console.log(`  Blocks to sync: unlimited (following tip)`);
  }
  console.log(`  Relays:         ${RELAYS.map(r => r.host).join(', ')}`);
  console.log('');

  if (CONFIG.startHeight > 0 || CONFIG.blocksBack > 0) {
    console.log('\x1b[33m  Historical sync mode:\x1b[0m');
    if (CONFIG.startHeight > 0) {
      console.log(`    - All clients start from block height ${CONFIG.startHeight.toLocaleString()}`);
    } else {
      console.log('    - All clients start from genesis (origin)');
    }
    if (CONFIG.blocksBack > 0) {
      console.log(`    - Each client syncs ${CONFIG.blocksBack} blocks then disconnects`);
    } else {
      console.log('    - Clients sync until they reach the tip');
    }
    console.log('    - Pipeline depth determines how many blocks are requested in parallel');
    console.log('    - This creates sustained load on relays (aggressive testing!)');
  } else {
    console.log('\x1b[33m  Real-time following mode:\x1b[0m');
    console.log('    - Each client starts from the current tip');
    console.log('    - Clients wait for new blocks (~20 seconds between blocks)');
    console.log('    - Low load on relays (normal operation)');
  }
  console.log('');
  console.log('\x1b[35m  Billing:\x1b[0m');
  console.log('    - 1 credit per message sent (requests)');
  console.log('    - 1 credit per message received (responses/blocks)');
  console.log('');
  console.log('\x1b[36m--------------------------------------------------------------------------------\x1b[0m');
  console.log('');

  stats.startTime = Date.now();

  // Initial load check
  const initialLoad = await checkRelayLoads();
  console.log(`Initial relay load: ${initialLoad.results.map(r => `${r.relay}=${r.percent.toFixed(0)}%`).join(', ')}`);
  console.log('');

  // Load monitoring loop
  const loadMonitor = setInterval(async () => {
    const loadInfo = await checkRelayLoads();
    printStatus(loadInfo);

    // Check if we should stop due to load
    if (loadInfo.maxPercent > CONFIG.loadLimit) {
      console.log('');
      console.log(`\x1b[31m>>> STOPPING TEST: Relay load ${loadInfo.maxPercent.toFixed(1)}% exceeds limit of ${CONFIG.loadLimit}%\x1b[0m`);
      stats.stoppedByLoad = true;
      testRunning = false;
    }
  }, LOAD_CHECK_INTERVAL_MS);

  // Client spawning loop
  const activeClients = [];
  const spawnLoop = async () => {
    let nextSpawnTime = stats.startTime;

    while (testRunning && (Date.now() - stats.startTime) < TEST_DURATION_MS) {
      const now = Date.now();

      // Spawn new client if it's time and we're under max
      if (now >= nextSpawnTime && stats.activeClients < CONFIG.maxClients) {
        clientIdCounter++;
        stats.totalClientsSpawned++;
        const clientPromise = runChainSyncClient(clientIdCounter);
        activeClients.push(clientPromise);
        nextSpawnTime = now + SPAWN_INTERVAL_MS;
      }

      await sleep(100);
    }
  };

  await spawnLoop();

  // Stop the test
  testRunning = false;
  clearInterval(loadMonitor);

  // Wait for active clients to close (max 10s)
  console.log('');
  console.log('Waiting for active clients to disconnect...');
  const windDownStart = Date.now();
  while (stats.activeClients > 0 && Date.now() - windDownStart < 10000) {
    console.log(`  ${stats.activeClients} clients still active...`);
    await sleep(2000);
  }

  // Final summary
  printFinalSummary();
}

function printFinalSummary() {
  const duration = (Date.now() - stats.startTime) / 1000;
  const totalMessages = stats.messagesSent + stats.messagesReceived;
  const msgsPerSec = totalMessages / duration;
  const blocksPerSec = stats.totalBlocks / duration;

  // Calculate per-client stats
  let totalClientBlocks = 0;
  let totalClientMsgs = 0;
  let avgBlocksPerClient = 0;
  let avgMsgsPerClient = 0;

  for (const [id, clientStat] of stats.clientStats) {
    totalClientBlocks += clientStat.blocks;
    totalClientMsgs += clientStat.sent + clientStat.received;
  }

  if (stats.clientStats.size > 0) {
    avgBlocksPerClient = totalClientBlocks / stats.clientStats.size;
    avgMsgsPerClient = totalClientMsgs / stats.clientStats.size;
  }

  console.log('');
  console.log('\x1b[32m================================================================================');
  console.log('                              FINAL RESULTS');
  console.log('================================================================================\x1b[0m');
  console.log('');

  if (stats.stoppedByLoad) {
    console.log('\x1b[31m  >>> TEST STOPPED EARLY DUE TO RELAY LOAD <<<\x1b[0m');
    console.log('');
  }

  console.log(`  Duration:           ${(duration / 60).toFixed(1)} minutes`);
  console.log(`  Clients Spawned:    ${stats.totalClientsSpawned}`);
  console.log(`  Peak Concurrent:    ${stats.peakClients}`);
  console.log(`  Connection Errors:  ${stats.connectionErrors}`);
  console.log('');
  console.log('\x1b[36m  Chain Sync Stats:\x1b[0m');
  console.log(`  Total Blocks:       \x1b[32m${stats.totalBlocks}\x1b[0m`);
  console.log(`  Total Rollbacks:    \x1b[33m${stats.totalRollbacks}\x1b[0m`);
  console.log(`  Blocks/sec:         ${blocksPerSec.toFixed(2)}`);
  console.log(`  Avg Blocks/Client:  ${avgBlocksPerClient.toFixed(1)}`);

  // Show catch-up stats if running in historical mode
  if (CONFIG.startHeight > 0 || CONFIG.blocksBack > 0) {
    console.log('');
    console.log('\x1b[36m  Historical Sync Stats:\x1b[0m');
    if (CONFIG.startHeight > 0) {
      console.log(`  Start Height:       ${CONFIG.startHeight.toLocaleString()}`);
      console.log(`  Start Slot:         ${formatSlot(startPoint ? startPoint.slot : 0)}`);
    }
    if (CONFIG.blocksBack > 0) {
      console.log(`  Target Blocks:      ${CONFIG.blocksBack} per client`);
    }
    console.log(`  Current Tip Slot:   ${formatSlot(globalTip.slot)}`);
    console.log(`  Clients Completed:  \x1b[32m${stats.clientsCaughtUp}\x1b[0m / ${stats.totalClientsSpawned}`);
    const completionRate = stats.totalClientsSpawned > 0 ? ((stats.clientsCaughtUp / stats.totalClientsSpawned) * 100).toFixed(1) : '0';
    console.log(`  Completion Rate:    ${completionRate}%`);
  }
  console.log('');
  console.log('\x1b[35m  Message Stats (Billing):\x1b[0m');
  console.log(`  Messages Sent:      ${stats.messagesSent}`);
  console.log(`  Messages Received:  ${stats.messagesReceived}`);
  console.log(`  Total Messages:     ${totalMessages}`);
  console.log(`  Messages/sec:       \x1b[33m${msgsPerSec.toFixed(1)}\x1b[0m`);
  console.log(`  Avg Msgs/Client:    ${avgMsgsPerClient.toFixed(1)}`);
  console.log('');
  console.log('\x1b[33m  Estimated Credits Used:\x1b[0m');
  console.log(`  Total Credits:      \x1b[35m${totalMessages}\x1b[0m (1 per message, both directions)`);
  console.log(`  Credits/minute:     ${(totalMessages / (duration / 60)).toFixed(0)}`);
  console.log(`  Credits/client/min: ${(avgMsgsPerClient / (duration / 60)).toFixed(1)}`);
  console.log('');

  // Latency stats
  const finalLatencyStats = calculateLatencyStats(stats.latencies);
  console.log('\x1b[34m  Latency Stats:\x1b[0m');
  console.log(`  Samples:            ${stats.latencies.length.toLocaleString()}`);
  console.log(`  Min:                ${finalLatencyStats.min}ms`);
  console.log(`  Max:                ${finalLatencyStats.max}ms`);
  console.log(`  Average:            \x1b[34m${finalLatencyStats.avg}ms\x1b[0m`);
  console.log(`  P50 (Median):       ${finalLatencyStats.p50}ms`);
  console.log(`  P95:                ${finalLatencyStats.p95}ms`);
  console.log(`  P99:                \x1b[33m${finalLatencyStats.p99}ms\x1b[0m`);
  console.log('');
  console.log('\x1b[35m  Relay Load:\x1b[0m');
  console.log(`  Peak Load:          ${stats.peakLoad.toFixed(1)}%`);
  console.log(`  Load Limit:         ${CONFIG.loadLimit}%`);
  console.log(`  Stopped by Load:    ${stats.stoppedByLoad ? 'YES' : 'NO'}`);
  console.log('');

  // Per-client breakdown (top 10 by blocks)
  console.log('\x1b[36m  Per-Client Stats (Top 10 by blocks):\x1b[0m');
  console.log('  ' + '-'.repeat(82));
  console.log('  ' +
    'Client'.padEnd(10) +
    'Blocks'.padStart(8) +
    'Rollbacks'.padStart(10) +
    'Sent'.padStart(8) +
    'Received'.padStart(10) +
    'Avg Lat'.padStart(10) +
    'P99 Lat'.padStart(10) +
    'Duration'.padStart(10)
  );
  console.log('  ' + '-'.repeat(82));

  const sortedClients = [...stats.clientStats.entries()]
    .sort((a, b) => b[1].blocks - a[1].blocks)
    .slice(0, 10);

  for (const [id, stat] of sortedClients) {
    const durationSec = stat.duration ? (stat.duration / 1000).toFixed(0) + 's' : 'active';
    const clientLatency = calculateLatencyStats(stat.latencies);
    const avgLatStr = clientLatency.avg > 0 ? `${clientLatency.avg}ms` : '-';
    const p99LatStr = clientLatency.p99 > 0 ? `${clientLatency.p99}ms` : '-';
    console.log('  ' +
      `#${id}`.padEnd(10) +
      stat.blocks.toString().padStart(8) +
      stat.rollbacks.toString().padStart(10) +
      stat.sent.toString().padStart(8) +
      stat.received.toString().padStart(10) +
      avgLatStr.padStart(10) +
      p99LatStr.padStart(10) +
      durationSec.padStart(10)
    );
  }
  console.log('  ' + '-'.repeat(82));
  console.log('');

  console.log('\x1b[36m================================================================================\x1b[0m');
  console.log('');
  console.log('  Check proxy stats:    ssh michael@192.168.170.10 "curl -s http://localhost:3001/stats"');
  console.log('  Check billing logs:   ssh michael@192.168.170.10 "sudo journalctl -u cardano-api-web -n 20 | grep WS"');
  console.log('  Usage dashboard:      https://app.nacho.builders/usage');
  console.log('');

  process.exit(stats.stoppedByLoad ? 1 : 0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, stopping test...');
  testRunning = false;
});

process.on('SIGTERM', () => {
  console.log('\n\nReceived SIGTERM, stopping test...');
  testRunning = false;
});

runTest().catch((err) => {
  console.error('Test failed:', err);
  process.exit(1);
});
