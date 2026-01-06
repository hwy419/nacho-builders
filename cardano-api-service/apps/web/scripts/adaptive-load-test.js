#!/usr/bin/env node
/**
 * Adaptive Wallet Load Test
 *
 * Automatically scales wallet concurrency based on relay node health.
 * Monitors load average on both relay nodes and only adds wallets
 * when relays have capacity.
 *
 * Usage: node adaptive-load-test.js [max-wallets] [sustain-seconds]
 * Example: node adaptive-load-test.js 50 30
 *   → Ramps up to max 50 wallets, sustaining each level for 30 seconds
 *   → Only adds wallets when relay load avg < threshold
 */

const WebSocket = require('ws');
const { exec } = require('child_process');
const { promisify } = require('util');
const execAsync = promisify(exec);

const API_URL = 'wss://api.nacho.builders/v1/ogmios';
const API_KEY = process.env.API_KEY || 'napi_mgVKAufdHBk4DOvGft4tyGhQJO0RxlKb';

// Relay nodes to monitor
const RELAY_NODES = [
  { name: 'relay1', host: '192.168.160.11', user: 'michael' },
  { name: 'relay2', host: '192.168.160.12', user: 'michael' },
];

// Test configuration
const MAX_WALLETS = parseInt(process.argv[2] || '30', 10);
const SUSTAIN_SECONDS = parseInt(process.argv[3] || '30', 10);
const SUSTAIN_MS = SUSTAIN_SECONDS * 1000;

// Load thresholds (1-minute load average)
const LOAD_THRESHOLD_ADD = 2.0;      // Add wallet if both relays below this
const LOAD_THRESHOLD_PAUSE = 4.0;    // Pause adding if either relay above this
const LOAD_THRESHOLD_STOP = 6.0;     // Stop test if either relay above this

// Wallet session duration
const MIN_SESSION_MS = 2 * 60 * 1000;
const MAX_SESSION_MS = 5 * 60 * 1000;

// Sample addresses
const SAMPLE_ADDRESSES = [
  'addr1qxdvcswn0exwc2vjfr6u6f6qndfhmk94xjrt5tztpelyk4yg83zn9d4vrrtzs98lcl5u5q6mv7ngmg829xxvy3g5ydls7c76wu',
  'addr1q9r4307pqxq92fz3fhu4grpn9wvqwxhwfca6xyl5zj59f64n6p0p5dtq7n26mse0x06wnmrpqjr5k8kqk8gj5s9qgz9qnqmw7k',
];

// Query patterns
const QUERIES = {
  startup: [
    { method: 'queryNetwork/tip', delay: 0 },
    { method: 'queryLedgerState/protocolParameters', delay: 100 },
    { method: 'queryLedgerState/epoch', delay: 200 },
  ],
  polling: [
    { method: 'queryNetwork/tip', intervalMs: 5000 },
    { method: 'queryNetwork/blockHeight', intervalMs: 8000 },
  ],
  browsing: [
    { method: 'queryLedgerState/utxo', probability: 0.1, needsAddress: true },
    { method: 'queryLedgerState/stakePools', probability: 0.02 },
    { method: 'queryLedgerState/rewardAccountSummaries', probability: 0.05, needsAddress: true },
  ],
};

// Timeouts per method
const TIMEOUTS = {
  'queryLedgerState/utxo': 60000,
  'queryLedgerState/rewardAccountSummaries': 60000,
  'default': 15000,
};

// Global state
const stats = {
  activeWallets: 0,
  targetWallets: 1,
  totalSessions: 0,
  completedSessions: 0,
  totalRequests: 0,
  requestsByMethod: {},
  successes: 0,
  failures: 0,
  latencies: [],
  relayLoads: [],
  startTime: null,
};

let walletIdCounter = 0;
let testRunning = true;
let lastLevelChange = 0;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function getTimeout(method) {
  return TIMEOUTS[method] || TIMEOUTS.default;
}

// Get load average from a relay node via SSH
async function getRelayLoad(relay) {
  try {
    const { stdout } = await execAsync(
      `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${relay.user}@${relay.host} "cat /proc/loadavg"`,
      { timeout: 10000 }
    );
    // /proc/loadavg format: "0.15 0.10 0.05 1/234 12345"
    const parts = stdout.trim().split(' ');
    return {
      name: relay.name,
      load1: parseFloat(parts[0]),
      load5: parseFloat(parts[1]),
      load15: parseFloat(parts[2]),
      success: true,
    };
  } catch (err) {
    return {
      name: relay.name,
      load1: 0,
      load5: 0,
      load15: 0,
      success: false,
      error: err.message,
    };
  }
}

// Check all relay loads
async function checkRelayLoads() {
  const loads = await Promise.all(RELAY_NODES.map(getRelayLoad));
  return loads;
}

// Track request
function trackRequest(method, latency, success) {
  stats.totalRequests++;
  stats.requestsByMethod[method] = (stats.requestsByMethod[method] || 0) + 1;
  if (success) {
    stats.successes++;
    stats.latencies.push(latency);
  } else {
    stats.failures++;
  }
}

// Make Ogmios request
function makeRequest(ws, method, params = {}) {
  return new Promise((resolve) => {
    if (ws.readyState !== WebSocket.OPEN) {
      resolve({ success: false, latency: 0, method });
      return;
    }

    const startTime = Date.now();
    const id = Date.now() + Math.random();
    const timeoutMs = getTimeout(method);
    let resolved = false;

    const cleanup = () => {
      if (!resolved) {
        resolved = true;
        clearTimeout(timeout);
        ws.removeListener('message', messageHandler);
      }
    };

    const timeout = setTimeout(() => {
      cleanup();
      trackRequest(method, timeoutMs, false);
      resolve({ success: false, latency: timeoutMs, method });
    }, timeoutMs);

    const messageHandler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          cleanup();
          const latency = Date.now() - startTime;
          const success = !!response.result;
          trackRequest(method, latency, success);
          resolve({ success, latency, method });
        }
      } catch (e) {}
    };

    ws.on('message', messageHandler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
  });
}

// Run a wallet session
async function runWalletSession(walletId) {
  stats.activeWallets++;
  stats.totalSessions++;

  const sessionDuration = randomBetween(MIN_SESSION_MS, MAX_SESSION_MS);
  const sessionEnd = Date.now() + sessionDuration;
  const userAddress = SAMPLE_ADDRESSES[walletId % SAMPLE_ADDRESSES.length];

  return new Promise((resolve) => {
    const ws = new WebSocket(API_URL, { headers: { 'apikey': API_KEY } });
    let connected = false;
    const pollingIntervals = [];

    ws.on('open', async () => {
      connected = true;

      // Startup queries
      for (const query of QUERIES.startup) {
        await sleep(query.delay);
        if (ws.readyState !== WebSocket.OPEN) break;
        await makeRequest(ws, query.method);
      }

      // Polling loops
      for (const poll of QUERIES.polling) {
        const interval = setInterval(async () => {
          if (ws.readyState === WebSocket.OPEN && testRunning) {
            await makeRequest(ws, poll.method);
          }
        }, poll.intervalMs + randomBetween(-1000, 1000));
        pollingIntervals.push(interval);
      }

      // Browsing loop
      const browsingLoop = async () => {
        while (Date.now() < sessionEnd && ws.readyState === WebSocket.OPEN && testRunning) {
          for (const query of QUERIES.browsing) {
            if (Math.random() < query.probability) {
              const params = query.needsAddress ? { addresses: [userAddress] } : {};
              await makeRequest(ws, query.method, params);
            }
          }
          await sleep(randomBetween(2000, 5000));
        }
      };
      browsingLoop();

      // End session
      setTimeout(() => {
        pollingIntervals.forEach(clearInterval);
        if (ws.readyState === WebSocket.OPEN) ws.close();
      }, sessionDuration);
    });

    ws.on('close', () => {
      pollingIntervals.forEach(clearInterval);
      stats.activeWallets--;
      if (connected) stats.completedSessions++;
      resolve();
    });

    ws.on('error', () => {
      pollingIntervals.forEach(clearInterval);
      stats.activeWallets--;
      resolve();
    });
  });
}

// Maintain target concurrency
async function maintainConcurrency() {
  while (testRunning) {
    while (stats.activeWallets < stats.targetWallets && testRunning) {
      walletIdCounter++;
      runWalletSession(walletIdCounter);
      await sleep(200);
    }
    await sleep(500);
  }
}

// Print status with relay loads
function printStatus(loads) {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const recentLatencies = stats.latencies.slice(-100);
  const avgLatency = recentLatencies.length > 0
    ? Math.round(recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length)
    : 0;

  const successRate = stats.totalRequests > 0
    ? ((stats.successes / stats.totalRequests) * 100).toFixed(1)
    : '0';

  const loadStr = loads.map(l =>
    l.success ? `${l.name}:${l.load1.toFixed(2)}` : `${l.name}:ERR`
  ).join(' ');

  console.log(
    `[${timeStr}] Wallets: ${stats.activeWallets}/${stats.targetWallets} | ` +
    `Requests: ${stats.totalRequests} | ` +
    `Success: ${successRate}% | ` +
    `Avg: ${avgLatency}ms | ` +
    `Relays: ${loadStr}`
  );

  // Store for final report
  stats.relayLoads.push({
    time: timeStr,
    wallets: stats.targetWallets,
    loads: loads.map(l => ({ name: l.name, load1: l.load1 })),
  });
}

// Main adaptive control loop
async function runAdaptiveTest() {
  console.log('='.repeat(80));
  console.log('Adaptive Wallet Load Test');
  console.log('='.repeat(80));
  console.log(`API: ${API_URL}`);
  console.log(`Max wallets: ${MAX_WALLETS}`);
  console.log(`Sustain per level: ${SUSTAIN_SECONDS} seconds`);
  console.log(`Load thresholds: add<${LOAD_THRESHOLD_ADD}, pause<${LOAD_THRESHOLD_PAUSE}, stop<${LOAD_THRESHOLD_STOP}`);
  console.log(`Relays: ${RELAY_NODES.map(r => r.host).join(', ')}`);
  console.log('='.repeat(80));
  console.log('');

  stats.startTime = Date.now();
  lastLevelChange = Date.now();

  // Start concurrency maintenance
  maintainConcurrency();

  // Main control loop - check every 10 seconds
  while (testRunning) {
    await sleep(10000);

    const loads = await checkRelayLoads();
    printStatus(loads);

    const maxLoad = Math.max(...loads.filter(l => l.success).map(l => l.load1));
    const timeSinceChange = Date.now() - lastLevelChange;

    // Check if we should stop
    if (maxLoad >= LOAD_THRESHOLD_STOP) {
      console.log(`\n⚠️  STOPPING: Relay load (${maxLoad.toFixed(2)}) exceeded stop threshold (${LOAD_THRESHOLD_STOP})`);
      break;
    }

    // Check if we've sustained long enough to consider adding
    if (timeSinceChange >= SUSTAIN_MS) {
      if (maxLoad < LOAD_THRESHOLD_ADD && stats.targetWallets < MAX_WALLETS) {
        stats.targetWallets++;
        lastLevelChange = Date.now();
        console.log(`\n✅ RAMPING: Adding wallet (now ${stats.targetWallets}) - relay load OK (${maxLoad.toFixed(2)})`);
      } else if (maxLoad >= LOAD_THRESHOLD_PAUSE) {
        console.log(`\n⏸️  HOLDING: Relay load (${maxLoad.toFixed(2)}) above pause threshold`);
        lastLevelChange = Date.now(); // Reset timer
      } else if (stats.targetWallets >= MAX_WALLETS) {
        console.log(`\n🏁 MAX REACHED: ${MAX_WALLETS} wallets - sustaining for final period`);
        await sleep(SUSTAIN_MS);
        break;
      }
    }
  }

  // Stop test
  testRunning = false;
  console.log('\nWinding down...');

  const windDownStart = Date.now();
  while (stats.activeWallets > 0 && Date.now() - windDownStart < 30000) {
    await sleep(1000);
  }

  // Final report
  const duration = (Date.now() - stats.startTime) / 1000;
  const avgLatency = stats.latencies.length > 0
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0;

  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  console.log('');
  console.log('='.repeat(80));
  console.log('FINAL RESULTS');
  console.log('='.repeat(80));
  console.log(`Duration:           ${(duration / 60).toFixed(1)} minutes`);
  console.log(`Peak Wallets:       ${stats.targetWallets}`);
  console.log(`Total Sessions:     ${stats.totalSessions}`);
  console.log(`Completed Sessions: ${stats.completedSessions}`);
  console.log('');
  console.log(`Total Requests:     ${stats.totalRequests}`);
  console.log(`Successes:          ${stats.successes}`);
  console.log(`Failures:           ${stats.failures}`);
  console.log(`Success Rate:       ${((stats.successes / stats.totalRequests) * 100).toFixed(2)}%`);
  console.log(`Throughput:         ${(stats.successes / duration).toFixed(2)} req/sec`);
  console.log('');
  console.log('Latency:');
  console.log(`  P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms | Avg: ${avgLatency}ms`);
  console.log('');
  console.log('Requests by Method:');
  Object.entries(stats.requestsByMethod)
    .sort((a, b) => b[1] - a[1])
    .forEach(([method, count]) => {
      const pct = ((count / stats.totalRequests) * 100).toFixed(1);
      console.log(`  ${method.padEnd(45)} ${count.toString().padStart(6)} (${pct}%)`);
    });
  console.log('');
  console.log('Relay Load Progression:');
  const samples = stats.relayLoads.filter((_, i) => i % 6 === 0 || i === stats.relayLoads.length - 1);
  samples.forEach(s => {
    const loadStr = s.loads.map(l => `${l.name}:${l.load1.toFixed(2)}`).join(' ');
    console.log(`  [${s.time}] ${s.wallets} wallets | ${loadStr}`);
  });
  console.log('='.repeat(80));

  process.exit(0);
}

runAdaptiveTest().catch(console.error);
