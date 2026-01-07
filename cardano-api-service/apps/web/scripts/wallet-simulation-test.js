#!/usr/bin/env node
/**
 * Wallet Simulation Load Test
 *
 * Simulates realistic wallet user behavior with ramping concurrency:
 * - Ramps up to target concurrency over 1 minute
 * - Maintains that concurrency for the specified duration
 * - Each wallet session lasts 2-5 minutes with realistic query patterns
 * - When a wallet disconnects, a new one spawns to maintain concurrency
 *
 * API Endpoints Used:
 * - Ogmios WebSocket (wss://api.nacho.builders/v1/ogmios): tip, protocol params, epoch, stake pools
 * - DB-Sync REST API (https://api.nacho.builders/v1/utxos): UTXO queries (faster, ~10ms vs 27s)
 *
 * Usage: node wallet-simulation-test.js [max-concurrent-wallets] [sustain-minutes]
 * Example: node wallet-simulation-test.js 20 5
 *   → Ramps to 20 concurrent wallets, sustains for 5 minutes
 */

const WebSocket = require('ws');

const API_URL = 'wss://api.nacho.builders/v1/ogmios';
const UTXO_API_URL = 'https://api.nacho.builders/v1/utxos';
const API_KEY = process.env.API_KEY || 'napi_mgVKAufdHBk4DOvGft4tyGhQJO0RxlKb';

// Test configuration
const MAX_CONCURRENT = parseInt(process.argv[2] || '10', 10);
const SUSTAIN_MINUTES = parseInt(process.argv[3] || '3', 10);
const RAMP_DURATION_MS = 60 * 1000; // 1 minute ramp up
const SUSTAIN_DURATION_MS = SUSTAIN_MINUTES * 60 * 1000;
const TOTAL_DURATION_MS = RAMP_DURATION_MS + SUSTAIN_DURATION_MS;

// Wallet session duration: 2-5 minutes (realistic user session)
const MIN_SESSION_MS = 2 * 60 * 1000;
const MAX_SESSION_MS = 5 * 60 * 1000;

// Address for UTXO queries (known address with UTXOs for realistic testing)
const UTXO_TEST_ADDRESS = 'addr1qxtcsl3kl485ne2lt5m9dmgjszh2wjw5zpestapzatt3evxxfsg840gryl09cw66q0y20avqjj9hfwqr8s5tygzdjc3szmfauy';

// Sample addresses for other address-based queries (reward summaries, etc.)
const SAMPLE_ADDRESSES = [
  'addr1qxdvcswn0exwc2vjfr6u6f6qndfhmk94xjrt5tztpelyk4yg83zn9d4vrrtzs98lcl5u5q6mv7ngmg829xxvy3g5ydls7c76wu',
  'addr1q9r4307pqxq92fz3fhu4grpn9wvqwxhwfca6xyl5zj59f64n6p0p5dtq7n26mse0x06wnmrpqjr5k8kqk8gj5s9qgz9qnqmw7k',
  'addr1qxkj7xdvgr2uzqf2rmx0x8jz9nu2e4ga9cqz8dgj7ulv0e7sn4c4gxvg7d28n5j8nqhgdx7fvxx9kj8nqhgdx7fvxx9s7wuq3r',
];

// Realistic wallet query patterns
// useHttp: true means use DB-Sync REST API instead of Ogmios WebSocket
const QUERIES = {
  // On wallet open - always run these
  startup: [
    { method: 'queryNetwork/tip', delay: 0 },
    { method: 'queryLedgerState/protocolParameters', delay: 100 },
    { method: 'queryLedgerState/epoch', delay: 200 },
  ],

  // During session - periodic polling
  polling: [
    { method: 'queryNetwork/tip', intervalMs: 5000 },      // Poll tip every 5s
    { method: 'queryNetwork/blockHeight', intervalMs: 8000 }, // Block height every 8s
  ],

  // Occasional queries during browsing
  browsing: [
    { method: 'utxo', probability: 0.1, needsAddress: true, useHttp: true },  // DB-Sync REST API
    { method: 'queryLedgerState/stakePools', probability: 0.02 },
    { method: 'queryLedgerState/rewardAccountSummaries', probability: 0.05, needsAddress: true },
  ],

  // Before transaction (50% of sessions simulate this)
  preTx: [
    { method: 'queryNetwork/tip' },
    { method: 'queryLedgerState/protocolParameters' },
    { method: 'utxo', needsAddress: true, useHttp: true },  // DB-Sync REST API
  ],
};

// Global stats
const stats = {
  activeWallets: 0,
  totalSessions: 0,
  completedSessions: 0,
  totalRequests: 0,
  requestsByMethod: {},
  successes: 0,
  failures: 0,
  latencies: [],
  startTime: null,
};

let walletIdCounter = 0;
let testRunning = true;

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

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

// Make an HTTP request to DB-Sync REST API (for UTXO queries)
async function makeHttpRequest(method, address) {
  const startTime = Date.now();
  const timeoutMs = 30000; // 30s timeout for DB-Sync queries

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const response = await fetch(`${UTXO_API_URL}?address=${address}`, {
      signal: controller.signal,
      headers: {
        'apikey': API_KEY,
        'Accept': 'application/json',
      },
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    if (response.ok) {
      await response.json(); // Consume the response
      trackRequest(method, latency, true);
      return { success: true, latency, method };
    } else {
      trackRequest(method, latency, false);
      return { success: false, latency, method };
    }
  } catch (error) {
    const latency = Date.now() - startTime;
    trackRequest(method, latency, false);
    return { success: false, latency, method };
  }
}

// Calculate target concurrency based on elapsed time (ramp function)
function getTargetConcurrency(elapsedMs) {
  if (elapsedMs < RAMP_DURATION_MS) {
    // Ramp phase: linear increase from 1 to MAX_CONCURRENT
    return Math.max(1, Math.floor((elapsedMs / RAMP_DURATION_MS) * MAX_CONCURRENT));
  }
  // Sustain phase: maintain MAX_CONCURRENT
  return MAX_CONCURRENT;
}

// Timeout configuration per method type (ms)
const TIMEOUTS = {
  'queryLedgerState/utxo': 60000,              // 60s - UTXO queries are slow
  'queryLedgerState/rewardAccountSummaries': 60000,  // 60s - also address-specific
  'default': 15000,                            // 15s for cached queries
};

function getTimeout(method) {
  return TIMEOUTS[method] || TIMEOUTS.default;
}

// Make a single Ogmios request
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
      } catch (e) {
        // Not our message
      }
    };

    ws.on('message', messageHandler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
  });
}

// Simulate a single wallet user session
async function runWalletSession(walletId) {
  stats.activeWallets++;
  stats.totalSessions++;

  const sessionDuration = randomBetween(MIN_SESSION_MS, MAX_SESSION_MS);
  const sessionEnd = Date.now() + sessionDuration;
  const userAddress = SAMPLE_ADDRESSES[walletId % SAMPLE_ADDRESSES.length];
  const willSendTx = Math.random() < 0.5; // 50% simulate transaction prep

  return new Promise((resolve) => {
    const ws = new WebSocket(API_URL, {
      headers: { 'apikey': API_KEY }
    });

    let connected = false;
    const pollingIntervals = [];

    ws.on('open', async () => {
      connected = true;

      // Phase 1: Startup queries (what wallet does on open)
      for (const query of QUERIES.startup) {
        await sleep(query.delay);
        if (ws.readyState !== WebSocket.OPEN) break;
        await makeRequest(ws, query.method);
      }

      // Phase 2: Start polling loops
      for (const poll of QUERIES.polling) {
        const interval = setInterval(async () => {
          if (ws.readyState === WebSocket.OPEN && testRunning) {
            await makeRequest(ws, poll.method);
          }
        }, poll.intervalMs + randomBetween(-1000, 1000)); // Add jitter
        pollingIntervals.push(interval);
      }

      // Phase 3: Browsing behavior (occasional queries)
      const browsingLoop = async () => {
        while (Date.now() < sessionEnd && ws.readyState === WebSocket.OPEN && testRunning) {
          for (const query of QUERIES.browsing) {
            if (Math.random() < query.probability) {
              if (query.useHttp) {
                // Use DB-Sync REST API for UTXO queries with known test address
                await makeHttpRequest(query.method, UTXO_TEST_ADDRESS);
              } else {
                const params = query.needsAddress ? { addresses: [userAddress] } : {};
                await makeRequest(ws, query.method, params);
              }
            }
          }
          await sleep(randomBetween(2000, 5000)); // Think time
        }
      };

      browsingLoop();

      // Phase 4: Pre-transaction queries (if this wallet will "send")
      if (willSendTx) {
        // Do this near end of session
        const txTime = sessionEnd - 30000;
        setTimeout(async () => {
          if (ws.readyState === WebSocket.OPEN && testRunning) {
            for (const query of QUERIES.preTx) {
              if (query.useHttp) {
                // Use DB-Sync REST API for UTXO queries with known test address
                await makeHttpRequest(query.method, UTXO_TEST_ADDRESS);
              } else {
                const params = query.needsAddress ? { addresses: [userAddress] } : {};
                await makeRequest(ws, query.method, params);
              }
              await sleep(200);
            }
          }
        }, Math.max(0, txTime - Date.now()));
      }

      // End session after duration
      setTimeout(() => {
        pollingIntervals.forEach(clearInterval);
        if (ws.readyState === WebSocket.OPEN) {
          ws.close();
        }
      }, sessionDuration);
    });

    ws.on('close', () => {
      pollingIntervals.forEach(clearInterval);
      stats.activeWallets--;
      if (connected) {
        stats.completedSessions++;
      }
      resolve();
    });

    ws.on('error', (err) => {
      pollingIntervals.forEach(clearInterval);
      stats.activeWallets--;
      resolve();
    });
  });
}

// Spawn new wallet sessions to maintain target concurrency
async function maintainConcurrency() {
  while (testRunning) {
    const elapsed = Date.now() - stats.startTime;
    const target = getTargetConcurrency(elapsed);

    // Spawn wallets if below target
    while (stats.activeWallets < target && testRunning) {
      walletIdCounter++;
      runWalletSession(walletIdCounter); // Fire and forget
      await sleep(100); // Small delay between spawns
    }

    await sleep(500); // Check every 500ms
  }
}

// Print progress
function printProgress() {
  const elapsed = (Date.now() - stats.startTime) / 1000;
  const phase = elapsed < 60 ? 'RAMPING' : 'SUSTAIN';
  const target = getTargetConcurrency(Date.now() - stats.startTime);

  const recentLatencies = stats.latencies.slice(-100);
  const avgLatency = recentLatencies.length > 0
    ? Math.round(recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length)
    : 0;

  const successRate = stats.totalRequests > 0
    ? ((stats.successes / stats.totalRequests) * 100).toFixed(1)
    : 0;

  const minutes = Math.floor(elapsed / 60);
  const seconds = Math.floor(elapsed % 60);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  console.log(
    `[${timeStr}] ${phase} | ` +
    `Wallets: ${stats.activeWallets}/${target} | ` +
    `Requests: ${stats.totalRequests} | ` +
    `Success: ${successRate}% | ` +
    `Avg: ${avgLatency}ms`
  );
}

// Main test runner
async function runTest() {
  console.log('='.repeat(70));
  console.log('Wallet Simulation Load Test');
  console.log('='.repeat(70));
  console.log(`Ogmios API:    ${API_URL}`);
  console.log(`UTXO API:      ${UTXO_API_URL}`);
  console.log(`API Key:       ${API_KEY.substring(0, 12)}...`);
  console.log(`UTXO Address:  ${UTXO_TEST_ADDRESS.substring(0, 30)}...`);
  console.log('');
  console.log(`Target concurrency: ${MAX_CONCURRENT} wallets`);
  console.log(`Ramp duration: 1 minute`);
  console.log(`Sustain duration: ${SUSTAIN_MINUTES} minutes`);
  console.log(`Total test time: ${1 + SUSTAIN_MINUTES} minutes`);
  console.log(`Session length: 2-5 minutes per wallet`);
  console.log('='.repeat(70));
  console.log('');

  stats.startTime = Date.now();

  // Start progress reporting
  const progressInterval = setInterval(printProgress, 10000);

  // Start concurrency maintenance
  const concurrencyPromise = maintainConcurrency();

  // Run for total duration
  await sleep(TOTAL_DURATION_MS);

  // Stop test
  testRunning = false;
  clearInterval(progressInterval);

  // Wait for active sessions to wind down (max 30s)
  console.log('\nWinding down active sessions...');
  const windDownStart = Date.now();
  while (stats.activeWallets > 0 && Date.now() - windDownStart < 30000) {
    await sleep(1000);
  }

  // Final summary
  const duration = (Date.now() - stats.startTime) / 1000;
  const avgLatency = stats.latencies.length > 0
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0;

  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;

  console.log('');
  console.log('='.repeat(70));
  console.log('FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`Duration:           ${(duration / 60).toFixed(1)} minutes`);
  console.log(`Peak Concurrency:   ${MAX_CONCURRENT} wallets`);
  console.log(`Total Sessions:     ${stats.totalSessions}`);
  console.log(`Completed Sessions: ${stats.completedSessions}`);
  console.log('');
  console.log(`Total Requests:     ${stats.totalRequests}`);
  console.log(`Successes:          ${stats.successes}`);
  console.log(`Failures:           ${stats.failures}`);
  console.log(`Success Rate:       ${((stats.successes / stats.totalRequests) * 100).toFixed(2)}%`);
  console.log(`Throughput:         ${(stats.successes / duration).toFixed(2)} req/sec`);
  console.log('');
  console.log('Latency Distribution:');
  console.log(`  P50 (median):     ${p50}ms`);
  console.log(`  P95:              ${p95}ms`);
  console.log(`  P99:              ${p99}ms`);
  console.log(`  Average:          ${avgLatency}ms`);
  console.log('');
  console.log('Requests by Method:');
  const sortedMethods = Object.entries(stats.requestsByMethod)
    .sort((a, b) => b[1] - a[1]);
  for (const [method, count] of sortedMethods) {
    const pct = ((count / stats.totalRequests) * 100).toFixed(1);
    console.log(`  ${method.padEnd(45)} ${count.toString().padStart(6)} (${pct}%)`);
  }
  console.log('='.repeat(70));

  process.exit(0);
}

runTest().catch(console.error);
