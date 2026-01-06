#!/usr/bin/env node
/**
 * Wallet Ramping Load Test with Relay Monitoring
 *
 * Simulates realistic wallet user sessions, ramping one wallet at a time.
 * Monitors relay node load and stops if load exceeds threshold.
 *
 * Usage: node wallet-ramp-test.js [options]
 *
 * Options:
 *   --interval <seconds>    Seconds between spawning new wallets (default: 10)
 *   --max-wallets <number>  Maximum concurrent wallets (default: 50)
 *   --duration <minutes>    Total test duration in minutes (default: 10)
 *   --load-limit <percent>  Stop if relay load exceeds this % (default: 50)
 *   --include-utxo          Include UTXO queries (default: false)
 *   --network <name>        Network to test: mainnet or preprod (default: mainnet)
 *
 * Examples:
 *   node wallet-ramp-test.js --interval 5 --max-wallets 30
 *   node wallet-ramp-test.js --interval 10 --duration 15 --load-limit 40
 *   node wallet-ramp-test.js --include-utxo --network preprod
 */

const WebSocket = require('ws');
const { exec } = require('child_process');
const util = require('util');
const execAsync = util.promisify(exec);

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    interval: 10,
    maxWallets: 50,
    duration: 10,
    loadLimit: 75,
    includeUtxo: false,
    network: 'mainnet',
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--interval':
        config.interval = parseInt(args[++i], 10);
        break;
      case '--max-wallets':
        config.maxWallets = parseInt(args[++i], 10);
        break;
      case '--duration':
        config.duration = parseFloat(args[++i]);
        break;
      case '--load-limit':
        config.loadLimit = parseInt(args[++i], 10);
        break;
      case '--include-utxo':
        config.includeUtxo = true;
        break;
      case '--network':
        config.network = args[++i];
        break;
      case '--help':
      case '-h':
        console.log(`
Wallet Ramping Load Test with Relay Monitoring

Usage: node wallet-ramp-test.js [options]

Options:
  --interval <seconds>    Seconds between spawning new wallets (default: 10)
  --max-wallets <number>  Maximum concurrent wallets (default: 50)
  --duration <minutes>    Total test duration in minutes (default: 10)
  --load-limit <percent>  Stop if relay load exceeds this % (default: 50)
  --include-utxo          Include UTXO queries (default: false)
  --network <name>        Network: mainnet or preprod (default: mainnet)

Examples:
  node wallet-ramp-test.js --interval 5 --max-wallets 30
  node wallet-ramp-test.js --interval 10 --duration 15 --load-limit 40
  node wallet-ramp-test.js --include-utxo --network preprod
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
const API_KEY = process.env.API_KEY || 'napi_0kc9ckEOow7fPkxfmC4SjMHVRqpAvmkL';

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
const LOAD_CHECK_INTERVAL_MS = 10000; // Check load every 10s

// Wallet session duration: 2-5 minutes
const MIN_SESSION_MS = 2 * 60 * 1000;
const MAX_SESSION_MS = 5 * 60 * 1000;

// Sample addresses for UTXO queries (if enabled)
const SAMPLE_ADDRESSES = [
  'addr1qxdvcswn0exwc2vjfr6u6f6qndfhmk94xjrt5tztpelyk4yg83zn9d4vrrtzs98lcl5u5q6mv7ngmg829xxvy3g5ydls7c76wu',
  'addr1q9r4307pqxq92fz3fhu4grpn9wvqwxhwfca6xyl5zj59f64n6p0p5dtq7n26mse0x06wnmrpqjr5k8kqk8gj5s9qgz9qnqmw7k',
];

// Realistic wallet query patterns (without UTXO by default)
function getQueryPatterns(includeUtxo) {
  const patterns = {
    // On wallet open - always run these in sequence
    startup: [
      { method: 'queryNetwork/tip', delay: 0 },
      { method: 'queryLedgerState/protocolParameters', delay: 100 },
      { method: 'queryLedgerState/eraSummaries', delay: 200 },
      { method: 'queryLedgerState/epoch', delay: 300 },
    ],

    // During session - periodic polling (realistic intervals)
    polling: [
      { method: 'queryNetwork/tip', intervalMs: 15000 },  // Every 15s
    ],

    // Occasional queries during browsing
    browsing: [
      { method: 'queryLedgerState/stakePools', probability: 0.02 },  // 2% per check
      { method: 'queryLedgerState/protocolParameters', probability: 0.01 },  // Refresh params
      { method: 'queryNetwork/genesisConfiguration', probability: 0.005, params: { era: 'shelley' } },
    ],

    // Pre-transaction queries (30% of sessions)
    preTx: [
      { method: 'queryNetwork/tip' },
      { method: 'queryLedgerState/protocolParameters' },
    ],
  };

  // Add UTXO queries if enabled
  if (includeUtxo) {
    patterns.startup.push({ method: 'queryLedgerState/utxo', delay: 400, needsAddress: true });
    patterns.browsing.push({ method: 'queryLedgerState/utxo', probability: 0.05, needsAddress: true });
    patterns.browsing.push({ method: 'queryLedgerState/rewardAccountSummaries', probability: 0.03, needsAddress: true });
    patterns.preTx.push({ method: 'queryLedgerState/utxo', needsAddress: true });
  }

  return patterns;
}

const QUERIES = getQueryPatterns(CONFIG.includeUtxo);

// Global stats
const stats = {
  activeWallets: 0,
  totalWalletsSpawned: 0,
  completedSessions: 0,
  totalRequests: 0,
  requestsByMethod: {},
  successes: 0,
  failures: 0,
  latencies: [],
  latenciesByMethod: {},  // Track latencies per method
  startTime: null,
  loadHistory: [],
  stoppedByLoad: false,
  peakLoad: 0,
  peakWallets: 0,
};

let testRunning = true;
let walletIdCounter = 0;

// Utility functions
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomBetween(min, max) {
  return min + Math.random() * (max - min);
}

function formatTime(ms) {
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.floor((ms % 60000) / 1000);
  return `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function progressBar(current, max, width = 20) {
  const pct = max > 0 ? Math.min(current / max, 1) : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  return '\u2588'.repeat(filled) + '\u2591'.repeat(empty);
}

// Track request stats
function trackRequest(method, latency, success) {
  stats.totalRequests++;
  stats.requestsByMethod[method] = (stats.requestsByMethod[method] || 0) + 1;
  if (success) {
    stats.successes++;
    stats.latencies.push(latency);
    // Track per-method latencies
    if (!stats.latenciesByMethod[method]) {
      stats.latenciesByMethod[method] = [];
    }
    stats.latenciesByMethod[method].push(latency);
  } else {
    stats.failures++;
  }
}

// Compute latency statistics for an array of latencies
function computeLatencyStats(latencies) {
  if (!latencies || latencies.length === 0) {
    return { min: 0, max: 0, avg: 0, p50: 0, p95: 0, p99: 0, count: 0 };
  }
  const sorted = [...latencies].sort((a, b) => a - b);
  const sum = sorted.reduce((a, b) => a + b, 0);
  return {
    count: sorted.length,
    min: sorted[0],
    max: sorted[sorted.length - 1],
    avg: Math.round(sum / sorted.length),
    p50: sorted[Math.floor(sorted.length * 0.5)],
    p95: sorted[Math.floor(sorted.length * 0.95)],
    p99: sorted[Math.floor(sorted.length * 0.99)],
  };
}

// Create a histogram of latencies
function createHistogram(latencies, buckets = [50, 100, 200, 500, 1000, 2000, 5000]) {
  const hist = { '<50ms': 0 };
  buckets.forEach((b, i) => {
    if (i < buckets.length - 1) {
      hist[`${b}-${buckets[i + 1]}ms`] = 0;
    } else {
      hist[`>${b}ms`] = 0;
    }
  });

  for (const lat of latencies) {
    if (lat < 50) {
      hist['<50ms']++;
    } else if (lat >= buckets[buckets.length - 1]) {
      hist[`>${buckets[buckets.length - 1]}ms`]++;
    } else {
      for (let i = 0; i < buckets.length - 1; i++) {
        if (lat >= buckets[i] && lat < buckets[i + 1]) {
          hist[`${buckets[i]}-${buckets[i + 1]}ms`]++;
          break;
        }
      }
    }
  }
  return hist;
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

// Make a single Ogmios request
function makeRequest(ws, method, params = {}) {
  return new Promise((resolve) => {
    if (ws.readyState !== WebSocket.OPEN) {
      resolve({ success: false, latency: 0, method });
      return;
    }

    const startTime = Date.now();
    const id = Date.now() + Math.random();
    const timeoutMs = method.includes('utxo') ? 60000 : 15000;
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
      resolve({ success: false, latency: timeoutMs, method, timeout: true });
    }, timeoutMs);

    const messageHandler = (data) => {
      try {
        const response = JSON.parse(data.toString());
        if (response.id === id) {
          cleanup();
          const latency = Date.now() - startTime;
          const success = response.result !== undefined;
          trackRequest(method, latency, success);
          resolve({ success, latency, method });
        }
      } catch (e) {
        // Not our message or parse error
      }
    };

    ws.on('message', messageHandler);
    ws.send(JSON.stringify({ jsonrpc: '2.0', method, params, id }));
  });
}

// Simulate a single wallet user session
async function runWalletSession(walletId) {
  stats.activeWallets++;
  if (stats.activeWallets > stats.peakWallets) {
    stats.peakWallets = stats.activeWallets;
  }

  const sessionDuration = randomBetween(MIN_SESSION_MS, MAX_SESSION_MS);
  const sessionEnd = Date.now() + sessionDuration;
  const userAddress = SAMPLE_ADDRESSES[walletId % SAMPLE_ADDRESSES.length];
  const willSimulateTx = Math.random() < 0.3; // 30% simulate transaction prep

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
        if (!testRunning || ws.readyState !== WebSocket.OPEN) break;
        await sleep(query.delay);
        const params = query.needsAddress ? { addresses: [userAddress] } : (query.params || {});
        await makeRequest(ws, query.method, params);
      }

      // Phase 2: Start tip polling
      for (const poll of QUERIES.polling) {
        const jitter = randomBetween(-2000, 2000);
        const interval = setInterval(async () => {
          if (ws.readyState === WebSocket.OPEN && testRunning) {
            await makeRequest(ws, poll.method);
          }
        }, poll.intervalMs + jitter);
        pollingIntervals.push(interval);
      }

      // Phase 3: Browsing behavior (occasional queries)
      const browsingLoop = async () => {
        while (Date.now() < sessionEnd && ws.readyState === WebSocket.OPEN && testRunning) {
          for (const query of QUERIES.browsing) {
            if (Math.random() < query.probability) {
              const params = query.needsAddress
                ? { addresses: [userAddress] }
                : (query.params || {});
              await makeRequest(ws, query.method, params);
            }
          }
          await sleep(randomBetween(3000, 8000)); // Think time between actions
        }
      };

      // Run browsing in background
      browsingLoop();

      // Phase 4: Pre-transaction queries (if this wallet will "send")
      if (willSimulateTx) {
        const txTime = sessionEnd - 30000; // 30s before session end
        const delay = Math.max(0, txTime - Date.now());
        setTimeout(async () => {
          if (ws.readyState === WebSocket.OPEN && testRunning) {
            for (const query of QUERIES.preTx) {
              const params = query.needsAddress ? { addresses: [userAddress] } : {};
              await makeRequest(ws, query.method, params);
              await sleep(200);
            }
          }
        }, delay);
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

    ws.on('error', () => {
      pollingIntervals.forEach(clearInterval);
      stats.activeWallets--;
      resolve();
    });
  });
}

// Print current status
function printStatus(loadInfo) {
  const elapsed = Date.now() - stats.startTime;
  const elapsedStr = formatTime(elapsed);
  const remaining = formatTime(Math.max(0, TEST_DURATION_MS - elapsed));

  const recentLatencies = stats.latencies.slice(-100);
  const avgLatency = recentLatencies.length > 0
    ? Math.round(recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length)
    : 0;

  const successRate = stats.totalRequests > 0
    ? ((stats.successes / stats.totalRequests) * 100).toFixed(1)
    : '0.0';

  const rps = elapsed > 0 ? (stats.successes / (elapsed / 1000)).toFixed(1) : '0.0';

  // Load bar coloring
  const loadPct = loadInfo.maxPercent;
  let loadColor = '\x1b[32m'; // Green
  if (loadPct > 30) loadColor = '\x1b[33m'; // Yellow
  if (loadPct > 50) loadColor = '\x1b[31m'; // Red

  const walletBar = progressBar(stats.activeWallets, CONFIG.maxWallets, 15);
  const loadBar = progressBar(loadPct, 100, 10);

  // Format relay loads
  const relayLoads = loadInfo.results
    .map(r => `${r.relay}:${r.percent >= 0 ? r.percent.toFixed(0) + '%' : 'ERR'}`)
    .join(' ');

  console.log(
    `\x1b[36m[${elapsedStr}]\x1b[0m ` +
    `Wallets [${walletBar}] ${stats.activeWallets}/${stats.totalWalletsSpawned} | ` +
    `${loadColor}Load [${loadBar}] ${loadPct.toFixed(0)}%\x1b[0m (${relayLoads}) | ` +
    `\x1b[32m${stats.successes}\x1b[0m/\x1b[31m${stats.failures}\x1b[0m | ` +
    `\x1b[33m${rps} rps\x1b[0m | ` +
    `${avgLatency}ms avg`
  );
}

// Main test runner
async function runTest() {
  console.log('\x1b[36m');
  console.log('================================================================================');
  console.log('              WALLET RAMPING LOAD TEST WITH RELAY MONITORING');
  console.log('================================================================================');
  console.log('\x1b[0m');
  console.log(`  Network:        ${CONFIG.network}`);
  console.log(`  API URL:        ${API_URL}`);
  console.log(`  Spawn interval: ${CONFIG.interval} seconds`);
  console.log(`  Max wallets:    ${CONFIG.maxWallets}`);
  console.log(`  Duration:       ${CONFIG.duration} minutes`);
  console.log(`  Load limit:     ${CONFIG.loadLimit}%`);
  console.log(`  Include UTXO:   ${CONFIG.includeUtxo ? 'YES' : 'NO'}`);
  console.log(`  Relays:         ${RELAYS.map(r => r.host).join(', ')}`);
  console.log('');
  console.log('\x1b[33m  Wallet behavior:\x1b[0m');
  console.log('    - Session length: 2-5 minutes');
  console.log('    - Startup: tip, params, era summaries, epoch' + (CONFIG.includeUtxo ? ', UTXOs' : ''));
  console.log('    - Polling: tip every ~15s');
  console.log('    - 30% simulate transaction preparation');
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

  // Wallet spawning loop
  const spawnLoop = async () => {
    let nextSpawnTime = stats.startTime;

    while (testRunning && (Date.now() - stats.startTime) < TEST_DURATION_MS) {
      const now = Date.now();

      // Spawn new wallet if it's time and we're under max
      if (now >= nextSpawnTime && stats.activeWallets < CONFIG.maxWallets) {
        walletIdCounter++;
        stats.totalWalletsSpawned++;
        runWalletSession(walletIdCounter); // Fire and forget
        nextSpawnTime = now + SPAWN_INTERVAL_MS;
      }

      await sleep(100); // Check frequently
    }
  };

  await spawnLoop();

  // Stop the test
  testRunning = false;
  clearInterval(loadMonitor);

  // Wait for active sessions to wind down (max 30s)
  console.log('');
  console.log('Waiting for active sessions to complete...');
  const windDownStart = Date.now();
  while (stats.activeWallets > 0 && Date.now() - windDownStart < 30000) {
    console.log(`  ${stats.activeWallets} wallets still active...`);
    await sleep(2000);
  }

  // Final summary
  printFinalSummary();
}

function printFinalSummary() {
  const duration = (Date.now() - stats.startTime) / 1000;
  const avgLatency = stats.latencies.length > 0
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0;

  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
  const minLatency = sortedLatencies[0] || 0;
  const maxLatency = sortedLatencies[sortedLatencies.length - 1] || 0;

  // Cache analysis (responses < 100ms likely cache hits)
  const fastResponses = stats.latencies.filter(l => l < 100).length;
  const cacheHitRate = stats.latencies.length > 0
    ? ((fastResponses / stats.latencies.length) * 100).toFixed(1)
    : '0.0';

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
  console.log(`  Wallets Spawned:    ${stats.totalWalletsSpawned}`);
  console.log(`  Peak Concurrent:    ${stats.peakWallets}`);
  console.log(`  Completed Sessions: ${stats.completedSessions}`);
  console.log('');
  console.log(`  Total Requests:     ${stats.totalRequests}`);
  console.log(`  Successes:          \x1b[32m${stats.successes}\x1b[0m`);
  console.log(`  Failures:           \x1b[31m${stats.failures}\x1b[0m`);
  console.log(`  Success Rate:       ${((stats.successes / stats.totalRequests) * 100).toFixed(2)}%`);
  console.log(`  Throughput:         \x1b[33m${(stats.successes / duration).toFixed(2)} req/sec\x1b[0m`);
  console.log(`  Cache Hit Rate:     ~${cacheHitRate}% (responses < 100ms)`);
  console.log('');
  console.log('\x1b[36m  Latency Distribution:\x1b[0m');
  console.log(`    Min:              ${minLatency}ms`);
  console.log(`    P50 (median):     ${p50}ms`);
  console.log(`    P95:              ${p95}ms`);
  console.log(`    P99:              ${p99}ms`);
  console.log(`    Max:              ${maxLatency}ms`);
  console.log(`    Average:          ${avgLatency}ms`);
  console.log('');
  console.log('\x1b[35m  Relay Load:\x1b[0m');
  console.log(`    Peak Load:        ${stats.peakLoad.toFixed(1)}%`);
  console.log(`    Load Limit:       ${CONFIG.loadLimit}%`);
  console.log(`    Stopped by Load:  ${stats.stoppedByLoad ? 'YES' : 'NO'}`);
  console.log('');
  console.log('\x1b[33m  Requests by Method:\x1b[0m');
  const sortedMethods = Object.entries(stats.requestsByMethod)
    .sort((a, b) => b[1] - a[1]);
  for (const [method, count] of sortedMethods) {
    const pct = ((count / stats.totalRequests) * 100).toFixed(1);
    const bar = progressBar(count, stats.totalRequests, 20);
    console.log(`    ${method.padEnd(42)} [${bar}] ${count.toString().padStart(5)} (${pct}%)`);
  }
  console.log('');

  // Detailed per-method latency analysis
  console.log('\x1b[36m  Per-Method Latency Analysis:\x1b[0m');
  console.log('  ' + '-'.repeat(90));
  console.log('  ' +
    'Method'.padEnd(40) +
    'Count'.padStart(7) +
    'Min'.padStart(8) +
    'Avg'.padStart(8) +
    'P50'.padStart(8) +
    'P95'.padStart(8) +
    'P99'.padStart(8) +
    'Max'.padStart(8)
  );
  console.log('  ' + '-'.repeat(90));

  for (const [method] of sortedMethods) {
    const methodLatencies = stats.latenciesByMethod[method] || [];
    const s = computeLatencyStats(methodLatencies);
    if (s.count > 0) {
      console.log('  ' +
        method.padEnd(40) +
        s.count.toString().padStart(7) +
        (s.min + 'ms').padStart(8) +
        (s.avg + 'ms').padStart(8) +
        (s.p50 + 'ms').padStart(8) +
        (s.p95 + 'ms').padStart(8) +
        (s.p99 + 'ms').padStart(8) +
        (s.max + 'ms').padStart(8)
      );
    }
  }
  console.log('  ' + '-'.repeat(90));
  console.log('');

  // Latency histogram
  console.log('\x1b[35m  Latency Histogram (all requests):\x1b[0m');
  const histogram = createHistogram(stats.latencies);
  const maxHistCount = Math.max(...Object.values(histogram));
  for (const [bucket, count] of Object.entries(histogram)) {
    const pct = stats.latencies.length > 0 ? ((count / stats.latencies.length) * 100).toFixed(1) : '0.0';
    const bar = progressBar(count, maxHistCount, 30);
    const color = bucket.includes('<50') || bucket.includes('50-100') ? '\x1b[32m' :
                  bucket.includes('100-200') || bucket.includes('200-500') ? '\x1b[33m' : '\x1b[31m';
    console.log(`    ${bucket.padEnd(12)} ${color}[${bar}]\x1b[0m ${count.toString().padStart(5)} (${pct}%)`);
  }
  console.log('');
  console.log('\x1b[36m================================================================================\x1b[0m');
  console.log('');
  console.log('  Check cache stats:    ssh michael@192.168.170.10 "curl -s http://localhost:3001/stats"');
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
