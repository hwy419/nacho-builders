#!/usr/bin/env node
/**
 * Ramping Load Test for Cardano API Service
 *
 * Tests various cacheable Ogmios methods (NO UTXOs!) with ramping concurrency
 *
 * Usage: node scripts/ramp-load-test.js [duration_seconds] [max_concurrency]
 * Example: node scripts/ramp-load-test.js 60 50
 */

const WebSocket = require('ws');

const API_URL = process.env.API_URL || 'wss://api.nacho.builders/v1/ogmios';
const API_KEY = process.env.API_KEY || 'napi_0kc9ckEOow7fPkxfmC4SjMHVRqpAvmkL';
const TEST_DURATION = (parseInt(process.argv[2]) || 120) * 1000;
const MAX_CONCURRENCY = parseInt(process.argv[3]) || 50;
const PEAK_TIME = TEST_DURATION * 0.75;   // Peak at 75%

// Cacheable methods with weights (NO UTXOs!)
const METHODS = [
  { name: 'queryNetwork/tip', weight: 40, emoji: '🎯' },
  { name: 'queryNetwork/blockHeight', weight: 20, emoji: '📏' },
  { name: 'queryLedgerState/epoch', weight: 15, emoji: '📅' },
  { name: 'queryLedgerState/protocolParameters', weight: 10, emoji: '⚙️' },
  { name: 'queryLedgerState/eraSummaries', weight: 10, emoji: '📜' },
  { name: 'queryNetwork/genesisConfiguration', weight: 5, emoji: '🌱', params: { era: 'shelley' } },
];

function pickMethod() {
  const total = METHODS.reduce((sum, m) => sum + m.weight, 0);
  let r = Math.random() * total;
  for (const m of METHODS) {
    r -= m.weight;
    if (r <= 0) return m;
  }
  return METHODS[0];
}

// Concurrency schedule: ramps from 5 to MAX at peak, then back down
function getConcurrency(elapsedMs) {
  const progress = elapsedMs / PEAK_TIME;
  if (progress <= 1) {
    return Math.floor(5 + ((MAX_CONCURRENCY - 5) * progress));
  } else {
    const afterPeak = (elapsedMs - PEAK_TIME) / (TEST_DURATION - PEAK_TIME);
    return Math.floor(MAX_CONCURRENCY - ((MAX_CONCURRENCY * 0.4) * afterPeak));
  }
}

// Stats
const stats = {
  total: 0,
  completed: 0,
  failed: 0,
  latencies: [],
  activeConnections: 0,
  startTime: Date.now(),
  intervalStats: [],
  methodStats: {},
};

// Initialize method stats
METHODS.forEach(m => {
  stats.methodStats[m.name] = { completed: 0, failed: 0, latencies: [] };
});

// Make a single request with random method
async function makeRequest() {
  return new Promise((resolve) => {
    const startTime = Date.now();
    const method = pickMethod();
    stats.total++;
    stats.activeConnections++;

    const ws = new WebSocket(API_URL, {
      headers: { 'apikey': API_KEY }
    });

    const timeout = setTimeout(() => {
      ws.close();
      stats.failed++;
      stats.methodStats[method.name].failed++;
      stats.activeConnections--;
      resolve(false);
    }, 15000);

    ws.on('open', () => {
      const msg = {
        jsonrpc: '2.0',
        method: method.name,
        id: stats.total
      };
      if (method.params) {
        msg.params = method.params;
      }
      ws.send(JSON.stringify(msg));
    });

    ws.on('message', (data) => {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      try {
        const response = JSON.parse(data.toString());
        if (response.result !== undefined) {
          stats.completed++;
          stats.latencies.push(latency);
          stats.methodStats[method.name].completed++;
          stats.methodStats[method.name].latencies.push(latency);
        } else {
          stats.failed++;
          stats.methodStats[method.name].failed++;
        }
      } catch (e) {
        stats.failed++;
        stats.methodStats[method.name].failed++;
      }

      stats.activeConnections--;
      ws.close();
      resolve(true);
    });

    ws.on('error', () => {
      clearTimeout(timeout);
      stats.failed++;
      stats.methodStats[method.name].failed++;
      stats.activeConnections--;
      resolve(false);
    });
  });
}

// Progress bar helper
function progressBar(current, max, width = 20) {
  const pct = max > 0 ? current / max : 0;
  const filled = Math.round(pct * width);
  const empty = width - filled;
  const bar = '█'.repeat(filled) + '░'.repeat(empty);
  return `[${bar}]`;
}

// Print current stats with fun visualization
function printStats(elapsed) {
  const minutes = Math.floor(elapsed / 60000);
  const seconds = Math.floor((elapsed % 60000) / 1000);
  const timeStr = `${minutes}:${seconds.toString().padStart(2, '0')}`;

  const recentLatencies = stats.latencies.slice(-100);
  const avgLatency = recentLatencies.length > 0
    ? Math.round(recentLatencies.reduce((a, b) => a + b, 0) / recentLatencies.length)
    : 0;

  const sorted = [...recentLatencies].sort((a, b) => a - b);
  const p99 = sorted.length > 0 ? sorted[Math.floor(sorted.length * 0.99)] : 0;

  const successRate = stats.total > 0 ? ((stats.completed / stats.total) * 100).toFixed(1) : 0;
  const targetConcurrency = getConcurrency(elapsed);
  const rps = elapsed > 0 ? (stats.completed / (elapsed / 1000)).toFixed(1) : 0;

  // Cache hit estimate (responses < 100ms are likely cache hits)
  const cacheHits = stats.latencies.filter(l => l < 100).length;
  const cacheRate = stats.latencies.length > 0
    ? ((cacheHits / stats.latencies.length) * 100).toFixed(0)
    : 0;

  const loadBar = progressBar(stats.activeConnections, MAX_CONCURRENCY);

  console.log(
    `\x1b[36m[${timeStr}]\x1b[0m ` +
    `${loadBar} ${stats.activeConnections}/${targetConcurrency} conn | ` +
    `\x1b[32m${stats.completed}\x1b[0m ok \x1b[31m${stats.failed}\x1b[0m fail | ` +
    `\x1b[33m${rps} rps\x1b[0m | ` +
    `avg \x1b[37m${avgLatency}ms\x1b[0m p99 \x1b[37m${p99}ms\x1b[0m | ` +
    `cache ~\x1b[35m${cacheRate}%\x1b[0m`
  );

  stats.intervalStats.push({
    time: timeStr,
    concurrency: stats.activeConnections,
    total: stats.total,
    completed: stats.completed,
    failed: stats.failed,
    avgLatency,
    p99,
    rps: parseFloat(rps)
  });
}

// Main loop
async function runTest() {
  const durationSec = TEST_DURATION / 1000;
  const peakSec = PEAK_TIME / 1000;

  console.log('\x1b[36m');
  console.log('╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                    CARDANO API RAMP LOAD TEST                                ║');
  console.log('║                       (NO UTXOs - Cache Friendly!)                           ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝');
  console.log('\x1b[0m');
  console.log(`  Target:     ${API_URL}`);
  console.log(`  Duration:   ${durationSec}s (peak at ${peakSec.toFixed(0)}s)`);
  console.log(`  Schedule:   5 → ${MAX_CONCURRENCY} concurrent connections`);
  console.log('');
  console.log('\x1b[33m  Methods being tested:\x1b[0m');
  METHODS.forEach(m => {
    console.log(`    ${m.emoji} ${m.name.padEnd(42)} weight: ${m.weight}%`);
  });
  console.log('');
  console.log('\x1b[36m──────────────────────────────────────────────────────────────────────────────\x1b[0m');
  console.log('');

  const startTime = Date.now();
  let lastStatsTime = 0;
  let requestsPerSecond = [];

  // Spawn requests continuously - more aggressive!
  const spawnLoop = async () => {
    let lastSecond = 0;
    let requestsThisSecond = 0;

    while (Date.now() - startTime < TEST_DURATION) {
      const elapsed = Date.now() - startTime;
      const targetConcurrency = getConcurrency(elapsed);
      const currentSecond = Math.floor(elapsed / 1000);

      // Track RPS
      if (currentSecond > lastSecond) {
        requestsPerSecond.push(requestsThisSecond);
        requestsThisSecond = 0;
        lastSecond = currentSecond;
      }

      // Spawn new requests aggressively if below target
      const toSpawn = Math.min(5, targetConcurrency - stats.activeConnections);
      for (let i = 0; i < toSpawn; i++) {
        makeRequest(); // Fire and forget
        requestsThisSecond++;
      }

      // Print stats every 5 seconds
      if (elapsed - lastStatsTime >= 5000) {
        printStats(elapsed);
        lastStatsTime = elapsed;
      }

      await new Promise(r => setTimeout(r, 20)); // Faster loop
    }
  };

  await spawnLoop();

  // Wait for remaining connections
  console.log('\nWaiting for remaining connections...');
  while (stats.activeConnections > 0) {
    await new Promise(r => setTimeout(r, 500));
  }

  // Final summary
  const duration = (Date.now() - startTime) / 1000;
  const avgLatency = stats.latencies.length > 0
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0;

  const sortedLatencies = [...stats.latencies].sort((a, b) => a - b);
  const p50 = sortedLatencies[Math.floor(sortedLatencies.length * 0.5)] || 0;
  const p95 = sortedLatencies[Math.floor(sortedLatencies.length * 0.95)] || 0;
  const p99 = sortedLatencies[Math.floor(sortedLatencies.length * 0.99)] || 0;
  const minLatency = sortedLatencies[0] || 0;
  const maxLatency = sortedLatencies[sortedLatencies.length - 1] || 0;

  // Cache analysis
  const fastResponses = stats.latencies.filter(l => l < 100).length;
  const mediumResponses = stats.latencies.filter(l => l >= 100 && l < 300).length;
  const slowResponses = stats.latencies.filter(l => l >= 300).length;

  console.log('');
  console.log('\x1b[32m╔══════════════════════════════════════════════════════════════════════════════╗');
  console.log('║                           FINAL RESULTS                                      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════════════╝\x1b[0m');
  console.log('');
  console.log(`  Duration:        \x1b[37m${duration.toFixed(1)}s\x1b[0m`);
  console.log(`  Total Requests:  \x1b[37m${stats.total}\x1b[0m`);
  console.log(`  Completed:       \x1b[32m${stats.completed}\x1b[0m`);
  console.log(`  Failed:          \x1b[31m${stats.failed}\x1b[0m`);
  console.log(`  Success Rate:    \x1b[36m${((stats.completed / stats.total) * 100).toFixed(2)}%\x1b[0m`);
  console.log(`  Throughput:      \x1b[33m${(stats.completed / duration).toFixed(2)} req/sec\x1b[0m`);
  console.log('');
  console.log('\x1b[36m  Latency Distribution:\x1b[0m');
  console.log(`    Min:           ${minLatency}ms`);
  console.log(`    P50 (median):  ${p50}ms`);
  console.log(`    P95:           ${p95}ms`);
  console.log(`    P99:           ${p99}ms`);
  console.log(`    Max:           ${maxLatency}ms`);
  console.log(`    Average:       ${avgLatency}ms`);
  console.log('');

  console.log('\x1b[35m  Cache Effectiveness (estimated):\x1b[0m');
  console.log(`    Fast (<100ms):     ${fastResponses} (${((fastResponses/stats.latencies.length)*100).toFixed(1)}%) - likely cache hits`);
  console.log(`    Medium (100-300ms): ${mediumResponses} (${((mediumResponses/stats.latencies.length)*100).toFixed(1)}%)`);
  console.log(`    Slow (>300ms):     ${slowResponses} (${((slowResponses/stats.latencies.length)*100).toFixed(1)}%) - cache misses`);
  console.log('');

  console.log('\x1b[33m  Per-Method Breakdown:\x1b[0m');
  for (const m of METHODS) {
    const s = stats.methodStats[m.name];
    const total = s.completed + s.failed;
    if (total > 0) {
      const avg = s.completed > 0
        ? Math.round(s.latencies.reduce((a, b) => a + b, 0) / s.latencies.length)
        : 0;
      const pct = ((total / stats.total) * 100).toFixed(1);
      const bar = progressBar(s.completed, total, 15);
      console.log(`    ${m.emoji} ${m.name.padEnd(40)} ${bar} ${s.completed}/${total} (${pct}%) avg ${avg}ms`);
    }
  }
  console.log('');

  // Peak RPS from intervals
  const peakRps = stats.intervalStats.length > 0
    ? Math.max(...stats.intervalStats.map(s => s.rps))
    : (stats.completed / duration);
  console.log(`  \x1b[33mPeak RPS:          ${peakRps.toFixed(1)} req/sec\x1b[0m`);
  console.log('');

  console.log('\x1b[36m──────────────────────────────────────────────────────────────────────────────\x1b[0m');
  console.log('');
  console.log('  Check cache stats:    ssh michael@192.168.170.10 "curl -s http://localhost:3001/stats"');
  console.log('  Usage dashboard:      https://app.nacho.builders/usage');
  console.log('');
}

runTest().catch(console.error);
