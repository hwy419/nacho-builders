#!/usr/bin/env node
/**
 * Mempool Subscription Load Test with Relay Monitoring
 *
 * Simulates multiple clients subscribing to the Cardano mempool.
 * Each client establishes a persistent WebSocket connection and monitors
 * pending transactions in real-time.
 *
 * Usage: node mempool-subscription-test.js [options]
 *
 * Options:
 *   --interval <seconds>    Seconds between spawning new clients (default: 1)
 *   --max-clients <number>  Maximum concurrent mempool subscribers (default: 30)
 *   --duration <minutes>    Total test duration in minutes (default: 3)
 *   --load-limit <percent>  Stop if relay load exceeds this % (default: 75)
 *   --network <name>        Network to test: mainnet or preprod (default: mainnet)
 *
 * Examples:
 *   node mempool-subscription-test.js                          # Run with defaults
 *   node mempool-subscription-test.js --max-clients 50         # More subscribers
 *   node mempool-subscription-test.js --network preprod        # Test preprod
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
    maxClients: 30,
    duration: 3,
    loadLimit: 75,
    network: 'mainnet',
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
      case '--help':
        console.log(`
Mempool Subscription Load Test

Options:
  --interval <seconds>    Seconds between spawning new clients (default: 1)
  --max-clients <number>  Maximum concurrent subscribers (default: 30)
  --duration <minutes>    Total test duration in minutes (default: 3)
  --load-limit <percent>  Stop if relay load exceeds this % (default: 75)
  --network <name>        Network: mainnet or preprod (default: mainnet)
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

// Timing constants
const TEST_DURATION_MS = CONFIG.duration * 60 * 1000;
const SPAWN_INTERVAL_MS = CONFIG.interval * 1000;
const LOAD_CHECK_INTERVAL_MS = 10000;

// Global stats
const stats = {
  activeClients: 0,
  totalClientsSpawned: 0,
  totalTransactions: 0,
  uniqueTransactions: new Set(),
  messagesSent: 0,
  messagesReceived: 0,
  startTime: null,
  loadHistory: [],
  stoppedByLoad: false,
  peakLoad: 0,
  peakClients: 0,
  connectionErrors: 0,
  latencies: [],
  clientStats: new Map(),
  mempoolAcquired: 0,
  mempoolReleased: 0,
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

// Utility functions
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function progressBar(current, max, width = 15) {
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
    const loadavg = parseFloat(lines[0].split(' ')[0]);
    const cpus = parseInt(lines[1], 10);
    return Math.round((loadavg / cpus) * 100);
  } catch (err) {
    return -1;
  }
}

async function getAllRelayLoads() {
  const loads = await Promise.all(RELAYS.map(r => getRelayLoad(r)));
  return RELAYS.map((r, i) => ({ ...r, load: loads[i] }));
}

// Run a single mempool subscription client
async function runMempoolClient(clientId) {
  stats.activeClients++;
  stats.clientStats.set(clientId, {
    transactions: 0,
    sent: 0,
    received: 0,
    latencies: [],
    startTime: Date.now(),
    connected: false,
    mempoolAcquired: false,
    mempoolSlot: null,
  });

  if (stats.activeClients > stats.peakClients) {
    stats.peakClients = stats.activeClients;
  }

  return new Promise((resolve) => {
    const ws = new WebSocket(`${API_URL}?apikey=${API_KEY}`, {
      headers: { 'apikey': API_KEY }
    });

    const clientStat = stats.clientStats.get(clientId);
    let requestId = 0;
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

    ws.on('open', () => {
      clientStat.connected = true;
      // Acquire the mempool to start receiving transactions
      send('acquireMempool');
    });

    ws.on('message', (data) => {
      stats.messagesReceived++;
      clientStat.received++;

      if (!testRunning) {
        // Release mempool before closing
        if (clientStat.mempoolAcquired) {
          send('releaseMempool');
        }
        ws.close();
        return;
      }

      try {
        const response = JSON.parse(data.toString());

        // Calculate latency
        if (response.id && requestTimestamps.has(response.id)) {
          const sentTime = requestTimestamps.get(response.id);
          const latency = Date.now() - sentTime;
          requestTimestamps.delete(response.id);
          stats.latencies.push(latency);
          clientStat.latencies.push(latency);

        }

        // Handle acquireMempool response
        if (response.result && response.result.slot !== undefined && !clientStat.mempoolAcquired) {
          clientStat.mempoolAcquired = true;
          clientStat.mempoolSlot = response.result.slot;
          stats.mempoolAcquired++;
          // Start requesting transactions
          send('nextTransaction', { fields: 'all' });
          return;
        }

        // Handle nextTransaction response
        if (response.result !== undefined) {
          if (response.result && response.result.transaction) {
            // Got a transaction
            clientStat.transactions++;
            stats.totalTransactions++;
            const txId = response.result.transaction.id;
            if (txId) {
              stats.uniqueTransactions.add(txId);
            }
            // Request next transaction immediately
            send('nextTransaction', { fields: 'all' });
          } else {
            // Mempool snapshot exhausted - re-acquire for fresh snapshot
            // Note: Ogmios will block until new transactions arrive (long-polling)
            stats.mempoolReleased++;
            clientStat.mempoolAcquired = false;
            if (testRunning && ws.readyState === WebSocket.OPEN) {
              send('acquireMempool');
            }
          }
          return;
        }

        // Handle errors
        if (response.error) {
          if (response.error.code === -32029) {
            console.log(`\x1b[31m[Client ${clientId}] Rate limited!\x1b[0m`);
          }
        }

      } catch (err) {
        // JSON parse error, ignore
      }
    });

    ws.on('error', (err) => {
      stats.connectionErrors++;
    });

    ws.on('close', () => {
      stats.activeClients--;
      clientStat.duration = Date.now() - clientStat.startTime;
      resolve();
    });

    // Timeout handler
    setTimeout(() => {
      if (ws.readyState === WebSocket.OPEN) {
        if (clientStat.mempoolAcquired) {
          send('releaseMempool');
        }
        ws.close();
      }
    }, TEST_DURATION_MS + 10000);
  });
}

// Print status update
async function printStatus() {
  const elapsed = Date.now() - stats.startTime;
  const elapsedStr = formatTime(elapsed);

  const relayLoads = await getAllRelayLoads();
  const maxLoad = Math.max(...relayLoads.map(r => r.load).filter(l => l >= 0));

  if (maxLoad > stats.peakLoad) {
    stats.peakLoad = maxLoad;
  }

  // Check load limit
  if (maxLoad > CONFIG.loadLimit) {
    console.log(`\n\x1b[31m>>> STOPPING TEST: Relay load ${maxLoad.toFixed(1)}% exceeds limit of ${CONFIG.loadLimit}%\x1b[0m\n`);
    stats.stoppedByLoad = true;
    testRunning = false;
    return;
  }

  const loadPct = maxLoad >= 0 ? maxLoad : 0;
  const loadBar = progressBar(loadPct, 100, 10);
  const loadColor = loadPct > 60 ? '\x1b[31m' : loadPct > 40 ? '\x1b[33m' : '\x1b[32m';

  const clientBar = progressBar(stats.activeClients, CONFIG.maxClients);

  const totalMessages = stats.messagesSent + stats.messagesReceived;
  const msgsPerSec = elapsed > 0 ? (totalMessages / (elapsed / 1000)).toFixed(1) : '0';
  const txPerSec = elapsed > 0 ? (stats.totalTransactions / (elapsed / 1000)).toFixed(2) : '0';

  const relayLoadStr = relayLoads.map(r => `${r.name}:${r.load >= 0 ? r.load + '%' : '?'}`).join(' ');

  const latencyStats = calculateLatencyStats(stats.latencies);
  const latencyStr = latencyStats.avg > 0 ? `${latencyStats.avg}ms` : '-';

  const statusLine =
    `\x1b[36m[${elapsedStr}]\x1b[0m ` +
    `Clients [${clientBar}] ${stats.activeClients}/${stats.totalClientsSpawned} | ` +
    `${loadColor}Load [${loadBar}] ${loadPct.toFixed(0)}%\x1b[0m (${relayLoadStr}) | ` +
    `\x1b[32m${stats.totalTransactions} txs\x1b[0m (${stats.uniqueTransactions.size} unique) | ` +
    `\x1b[33m${msgsPerSec} msg/s\x1b[0m | \x1b[34m${latencyStr} avg\x1b[0m`;

  console.log(statusLine);
}

// Main test runner
async function runTest() {
  console.log('\x1b[36m');
  console.log('================================================================================');
  console.log('            MEMPOOL SUBSCRIPTION LOAD TEST');
  console.log('================================================================================');
  console.log('\x1b[0m');

  console.log(`  Network:        ${CONFIG.network}`);
  console.log(`  API URL:        ${API_URL}`);
  console.log(`  Spawn interval: ${CONFIG.interval} seconds`);
  console.log(`  Max clients:    ${CONFIG.maxClients}`);
  console.log(`  Duration:       ${CONFIG.duration} minutes`);
  console.log(`  Load limit:     ${CONFIG.loadLimit}%`);
  console.log(`  Relays:         ${RELAYS.map(r => r.host).join(', ')}`);
  console.log('');
  console.log('\x1b[33m  Mempool subscription mode:\x1b[0m');
  console.log('    - Each client acquires the mempool snapshot');
  console.log('    - Requests transactions one at a time with nextTransaction');
  console.log('    - Re-acquires mempool when exhausted (blocks until new txs)');
  console.log('    - High latency expected on quiet networks (long-polling)');
  console.log('');
  console.log('\x1b[35m  Billing:\x1b[0m');
  console.log('    - 1 credit per message sent (requests)');
  console.log('    - 1 credit per message received (responses)');
  console.log('');
  console.log('\x1b[36m--------------------------------------------------------------------------------\x1b[0m');
  console.log('');

  // Get initial relay load
  const initialLoads = await getAllRelayLoads();
  const initialLoadStr = initialLoads.map(r => `${r.name}=${r.load >= 0 ? r.load + '%' : '?'}`).join(', ');
  console.log(`Initial relay load: ${initialLoadStr}`);
  console.log('');

  stats.startTime = Date.now();

  // Start status updates
  const statusInterval = setInterval(printStatus, LOAD_CHECK_INTERVAL_MS);

  // Spawn clients
  const clientPromises = [];
  let lastSpawn = 0;

  while (testRunning && (Date.now() - stats.startTime) < TEST_DURATION_MS) {
    const now = Date.now();

    // Spawn new client if interval has passed and under limit
    if (now - lastSpawn >= SPAWN_INTERVAL_MS && stats.activeClients < CONFIG.maxClients) {
      const clientId = ++clientIdCounter;
      stats.totalClientsSpawned++;
      clientPromises.push(runMempoolClient(clientId));
      lastSpawn = now;
    }

    await sleep(100);
  }

  // Stop test
  testRunning = false;
  clearInterval(statusInterval);

  console.log('\nWaiting for active clients to disconnect...');

  // Wait for clients with timeout
  const waitStart = Date.now();
  while (stats.activeClients > 0 && (Date.now() - waitStart) < 10000) {
    console.log(`  ${stats.activeClients} clients still active...`);
    await sleep(2000);
  }

  // Print final results
  const duration = (Date.now() - stats.startTime) / 1000;
  const totalMessages = stats.messagesSent + stats.messagesReceived;
  const msgsPerSec = totalMessages / duration;
  const txPerSec = stats.totalTransactions / duration;

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
  console.log('\x1b[36m  Mempool Stats:\x1b[0m');
  console.log(`  Total Transactions: \x1b[32m${stats.totalTransactions}\x1b[0m`);
  console.log(`  Unique Transactions:\x1b[32m${stats.uniqueTransactions.size}\x1b[0m`);
  console.log(`  Transactions/sec:   ${txPerSec.toFixed(2)}`);
  console.log(`  Mempool Acquires:   ${stats.mempoolAcquired}`);
  console.log(`  Mempool Releases:   ${stats.mempoolReleased}`);
  console.log('');
  console.log('\x1b[35m  Message Stats (Billing):\x1b[0m');
  console.log(`  Messages Sent:      ${stats.messagesSent}`);
  console.log(`  Messages Received:  ${stats.messagesReceived}`);
  console.log(`  Total Messages:     ${totalMessages}`);
  console.log(`  Messages/sec:       \x1b[33m${msgsPerSec.toFixed(1)}\x1b[0m`);
  console.log('');
  console.log('\x1b[33m  Estimated Credits Used:\x1b[0m');
  console.log(`  Total Credits:      \x1b[35m${totalMessages}\x1b[0m (1 per message, both directions)`);
  console.log(`  Credits/minute:     ${(totalMessages / (duration / 60)).toFixed(0)}`);
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

  // Per-client breakdown
  console.log('\x1b[36m  Per-Client Stats (Top 10 by transactions):\x1b[0m');
  console.log('  ' + '-'.repeat(76));
  console.log('  ' +
    'Client'.padEnd(10) +
    'Txs'.padStart(8) +
    'Sent'.padStart(8) +
    'Received'.padStart(10) +
    'Avg Lat'.padStart(10) +
    'P99 Lat'.padStart(10) +
    'Duration'.padStart(10)
  );
  console.log('  ' + '-'.repeat(76));

  const sortedClients = [...stats.clientStats.entries()]
    .sort((a, b) => b[1].transactions - a[1].transactions)
    .slice(0, 10);

  for (const [id, stat] of sortedClients) {
    const durationSec = stat.duration ? (stat.duration / 1000).toFixed(0) + 's' : 'active';
    const clientLatency = calculateLatencyStats(stat.latencies);
    const avgLatStr = clientLatency.avg > 0 ? `${clientLatency.avg}ms` : '-';
    const p99LatStr = clientLatency.p99 > 0 ? `${clientLatency.p99}ms` : '-';
    console.log('  ' +
      `#${id}`.padEnd(10) +
      stat.transactions.toString().padStart(8) +
      stat.sent.toString().padStart(8) +
      stat.received.toString().padStart(10) +
      avgLatStr.padStart(10) +
      p99LatStr.padStart(10) +
      durationSec.padStart(10)
    );
  }
  console.log('  ' + '-'.repeat(76));
  console.log('');

  console.log('\x1b[36m================================================================================\x1b[0m');
  console.log('');
  console.log('  Check proxy stats:    ssh michael@192.168.170.10 "curl -s http://localhost:3001/stats"');
  console.log('  Usage dashboard:      https://app.nacho.builders/usage');
  console.log('');

  process.exit(stats.stoppedByLoad ? 1 : 0);
}

// Handle graceful shutdown
process.on('SIGINT', () => {
  console.log('\n\nReceived SIGINT, stopping test...');
  testRunning = false;
});

// Run the test
runTest().catch(err => {
  console.error('Test failed:', err);
  process.exit(1);
});
