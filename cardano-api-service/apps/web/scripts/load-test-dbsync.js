#!/usr/bin/env node
/**
 * DB-Sync Load Test with CPU Monitoring
 *
 * Sends UTxO lookup requests to DB-Sync and ramps up load until target CPU is reached.
 *
 * Features:
 * - Real-time CPU monitoring via SSH
 * - Automatic load ramping until target CPU (default 70%)
 * - Detailed latency statistics (p50, p95, p99)
 * - Connection pooling stress test
 *
 * Usage:
 *   node scripts/load-test-dbsync.js [options]
 *
 * Options:
 *   --target-cpu=70      Target CPU percentage (default: 70)
 *   --max-concurrency=100 Maximum concurrent requests (default: 100)
 *   --ramp-step=5        Concurrency increment per ramp (default: 5)
 *   --ramp-interval=10   Seconds between ramps (default: 10)
 *   --duration=60        Test duration in seconds after reaching target (default: 60)
 *   --endpoint=URL       API endpoint URL
 *   --local              Test against localhost:3000 (for dev)
 *
 * Example:
 *   node scripts/load-test-dbsync.js --target-cpu=70 --max-concurrency=50
 */

const { execSync, spawn } = require('child_process');

// Configuration
const config = {
  targetCpu: 70,
  maxConcurrency: 100,
  rampStep: 5,
  rampInterval: 10,
  sustainDuration: 60,
  endpoint: 'https://api.nacho.builders/v1/utxos', // Via Kong
  apiKey: process.env.API_KEY || 'napi_0kc9ckEOow7fPkxfmC4SjMHVRqpAvmkL',
  dbsyncHost: '192.168.170.20',
  dbsyncUser: 'michael',
};

// Test addresses (varied to avoid query caching)
const TEST_ADDRESSES = [
  'addr1q93k6rgprz5fxwkpvl2vgjq4pwejth400f8aldz2m3lj7khrnd05p259l0qjrf396am6wahv5895ey35y62fexta3q5q3cc3k8',
  'addr1w8p79rpkcdz8x9d6tft0x0dx5mwuzac2sa4gm8cvkw5hcnqst2ctf',
  // Add more addresses for variety - they don't need to have UTxOs
  'addr1qxdvcswn0exwc2vjfr6u6f6qndfhmk94xjrt5tztpelyk4yg83zn9d4vrrtzs98lcl5u5q6mv7ngmg829xxvy3g5ydls7c76wu',
  'addr1q9faamq9k6557gve35amtdqph99h9q2txhz07chaxg6uwwgd6j6v0fc04n5ehg292yxvs292vesrqqmxqfnp7yuwn7yqczuqwr',
  'addr1qy8jecz3nal788cdgk4s8qf26dw3wc5rjgdz34ympddpv7arl0r4dtkh84agqkxfwdj3yc0vzal4ued2gvvvfqwxhe7qh9m8fc',
];

// Stats tracking
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  latencies: [],
  currentConcurrency: 0,
  cpuSamples: [],
  startTime: null,
  phaseStartTime: null,
  phase: 'ramping', // 'ramping' | 'sustaining' | 'cooldown'
};

// Active request tracking
let activeRequests = 0;
let requestQueue = [];
let isRunning = false;

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  for (const arg of args) {
    if (arg.startsWith('--target-cpu=')) {
      config.targetCpu = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--max-concurrency=')) {
      config.maxConcurrency = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--ramp-step=')) {
      config.rampStep = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--ramp-interval=')) {
      config.rampInterval = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--duration=')) {
      config.sustainDuration = parseInt(arg.split('=')[1]);
    } else if (arg.startsWith('--endpoint=')) {
      config.endpoint = arg.split('=')[1];
    } else if (arg === '--local') {
      config.endpoint = 'http://localhost:3000/api/dbsync/utxos';
    } else if (arg === '--direct') {
      config.endpoint = 'https://app.nacho.builders/api/dbsync/utxos';
    } else if (arg.startsWith('--api-key=')) {
      config.apiKey = arg.split('=')[1];
    } else if (arg === '--help' || arg === '-h') {
      console.log(`
DB-Sync Load Test with CPU Monitoring

Usage: node scripts/load-test-dbsync.js [options]

Options:
  --target-cpu=N       Target CPU percentage (default: 70)
  --max-concurrency=N  Maximum concurrent requests (default: 100)
  --ramp-step=N        Concurrency increment per ramp (default: 5)
  --ramp-interval=N    Seconds between ramps (default: 10)
  --duration=N         Sustain duration in seconds (default: 60)
  --endpoint=URL       API endpoint URL (default: Kong at api.nacho.builders)
  --api-key=KEY        API key for Kong authentication (default: from API_KEY env)
  --local              Use localhost:3000 for testing (bypasses Kong)
  --direct             Use app.nacho.builders directly (bypasses Kong)
  --help, -h           Show this help

Environment:
  API_KEY              API key for authentication

Example:
  node scripts/load-test-dbsync.js --target-cpu=70 --max-concurrency=50
  API_KEY=napi_xxx node scripts/load-test-dbsync.js
`);
      process.exit(0);
    }
  }
}

// Get CPU usage from DB-Sync server via SSH
async function getCpuUsage() {
  return new Promise((resolve) => {
    try {
      // Use mpstat for accurate CPU usage (if available) or fallback to top
      const result = execSync(
        `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${config.dbsyncUser}@${config.dbsyncHost} "top -bn1 | grep 'Cpu(s)' | awk '{print 100 - \\$8}'"`,
        { encoding: 'utf-8', timeout: 10000 }
      ).trim();
      const cpu = parseFloat(result);
      resolve(isNaN(cpu) ? 0 : cpu);
    } catch (error) {
      console.error('Failed to get CPU usage:', error.message);
      resolve(0);
    }
  });
}

// Get detailed system stats from DB-Sync server
async function getSystemStats() {
  return new Promise((resolve) => {
    try {
      const result = execSync(
        `ssh -o ConnectTimeout=5 -o StrictHostKeyChecking=no ${config.dbsyncUser}@${config.dbsyncHost} "echo 'cpu:' && top -bn1 | grep 'Cpu(s)' && echo 'mem:' && free -m | grep Mem && echo 'postgres:' && ps aux | grep postgres | grep -v grep | wc -l && echo 'load:' && cat /proc/loadavg"`,
        { encoding: 'utf-8', timeout: 10000 }
      );
      resolve(result);
    } catch (error) {
      resolve('Unable to fetch system stats');
    }
  });
}

// Make a single HTTP request
async function makeRequest() {
  const address = TEST_ADDRESSES[Math.floor(Math.random() * TEST_ADDRESSES.length)];
  const url = `${config.endpoint}?address=${address}`;
  const startTime = Date.now();

  try {
    activeRequests++;
    stats.totalRequests++;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30000);

    const headers = {
      'Accept': 'application/json',
    };
    // Add API key for Kong authentication
    if (config.apiKey && config.endpoint.includes('api.nacho.builders')) {
      headers['apikey'] = config.apiKey;
    }

    const response = await fetch(url, {
      signal: controller.signal,
      headers,
    });

    clearTimeout(timeout);
    const latency = Date.now() - startTime;

    if (response.ok) {
      const data = await response.json();
      stats.successfulRequests++;
      stats.latencies.push(latency);

      // Keep latencies array manageable (last 1000)
      if (stats.latencies.length > 1000) {
        stats.latencies = stats.latencies.slice(-1000);
      }
    } else {
      stats.failedRequests++;
      console.error(`Request failed: ${response.status} ${response.statusText}`);
    }
  } catch (error) {
    stats.failedRequests++;
    if (error.name !== 'AbortError') {
      console.error(`Request error: ${error.message}`);
    }
  } finally {
    activeRequests--;
  }
}

// Calculate percentile
function percentile(arr, p) {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, index)];
}

// Format duration
function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return minutes > 0 ? `${minutes}m ${secs}s` : `${secs}s`;
}

// Print current status
function printStatus(cpu) {
  const elapsed = Date.now() - stats.startTime;
  const avgLatency = stats.latencies.length > 0
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0;
  const p50 = percentile(stats.latencies, 50);
  const p95 = percentile(stats.latencies, 95);
  const p99 = percentile(stats.latencies, 99);
  const rps = stats.totalRequests / (elapsed / 1000);

  process.stdout.write('\r\x1b[K'); // Clear line
  process.stdout.write(
    `[${formatDuration(elapsed)}] ` +
    `Phase: ${stats.phase.toUpperCase()} | ` +
    `Concurrency: ${stats.currentConcurrency} | ` +
    `CPU: ${cpu.toFixed(1)}% | ` +
    `RPS: ${rps.toFixed(1)} | ` +
    `Latency: avg=${avgLatency}ms p95=${p95}ms | ` +
    `Success: ${stats.successfulRequests}/${stats.totalRequests}`
  );
}

// Worker that continuously makes requests
async function worker() {
  while (isRunning) {
    if (activeRequests < stats.currentConcurrency) {
      makeRequest(); // Fire and forget, don't await
    }
    // Small delay to prevent tight loop
    await new Promise(r => setTimeout(r, 10));
  }
}

// Main load test
async function runLoadTest() {
  parseArgs();

  console.log('='.repeat(70));
  console.log('DB-Sync Load Test with CPU Monitoring');
  console.log('='.repeat(70));
  console.log(`Target CPU:      ${config.targetCpu}%`);
  console.log(`Max Concurrency: ${config.maxConcurrency}`);
  console.log(`Ramp Step:       ${config.rampStep}`);
  console.log(`Ramp Interval:   ${config.rampInterval}s`);
  console.log(`Sustain Duration:${config.sustainDuration}s`);
  console.log(`Endpoint:        ${config.endpoint}`);
  if (config.apiKey && config.endpoint.includes('api.nacho.builders')) {
    console.log(`API Key:         ${config.apiKey.substring(0, 12)}...`);
  }
  console.log(`DB-Sync Host:    ${config.dbsyncHost}`);
  console.log('='.repeat(70));

  // Initial system check
  console.log('\nChecking DB-Sync server connectivity...');
  const initialStats = await getSystemStats();
  console.log(initialStats);

  const initialCpu = await getCpuUsage();
  console.log(`\nInitial CPU: ${initialCpu.toFixed(1)}%`);
  console.log('\nStarting load test...\n');

  stats.startTime = Date.now();
  stats.phaseStartTime = Date.now();
  stats.currentConcurrency = config.rampStep;
  isRunning = true;

  // Start worker pool
  const workers = [];
  for (let i = 0; i < config.maxConcurrency; i++) {
    workers.push(worker());
  }

  // CPU monitoring and ramping loop
  let lastRampTime = Date.now();
  let sustainStartTime = null;

  const monitorInterval = setInterval(async () => {
    const cpu = await getCpuUsage();
    stats.cpuSamples.push({ time: Date.now(), cpu });

    printStatus(cpu);

    if (stats.phase === 'ramping') {
      // Check if we've reached target CPU
      if (cpu >= config.targetCpu) {
        console.log(`\n\n>>> Target CPU reached! CPU: ${cpu.toFixed(1)}% at concurrency ${stats.currentConcurrency}`);
        stats.phase = 'sustaining';
        sustainStartTime = Date.now();
        stats.phaseStartTime = Date.now();
      }
      // Check if we've hit max concurrency
      else if (stats.currentConcurrency >= config.maxConcurrency) {
        console.log(`\n\n>>> Max concurrency reached (${config.maxConcurrency}). CPU: ${cpu.toFixed(1)}%`);
        stats.phase = 'sustaining';
        sustainStartTime = Date.now();
        stats.phaseStartTime = Date.now();
      }
      // Ramp up if interval passed
      else if (Date.now() - lastRampTime > config.rampInterval * 1000) {
        stats.currentConcurrency = Math.min(
          stats.currentConcurrency + config.rampStep,
          config.maxConcurrency
        );
        lastRampTime = Date.now();
        console.log(`\n>>> Ramping up to concurrency: ${stats.currentConcurrency}`);
      }
    }
    else if (stats.phase === 'sustaining') {
      // Check if sustain duration has passed
      if (Date.now() - sustainStartTime > config.sustainDuration * 1000) {
        console.log('\n\n>>> Sustain phase complete. Cooling down...');
        stats.phase = 'cooldown';
        stats.currentConcurrency = 0;
        stats.phaseStartTime = Date.now();
      }
    }
    else if (stats.phase === 'cooldown') {
      // Wait for requests to complete then exit
      if (activeRequests === 0) {
        clearInterval(monitorInterval);
        isRunning = false;
        printFinalReport();
      }
    }
  }, 2000);

  // Wait for all workers to complete
  await Promise.all(workers);
}

// Print final report
function printFinalReport() {
  const elapsed = Date.now() - stats.startTime;
  const avgLatency = stats.latencies.length > 0
    ? Math.round(stats.latencies.reduce((a, b) => a + b, 0) / stats.latencies.length)
    : 0;
  const p50 = percentile(stats.latencies, 50);
  const p95 = percentile(stats.latencies, 95);
  const p99 = percentile(stats.latencies, 99);
  const minLatency = stats.latencies.length > 0 ? Math.min(...stats.latencies) : 0;
  const maxLatency = stats.latencies.length > 0 ? Math.max(...stats.latencies) : 0;
  const avgCpu = stats.cpuSamples.length > 0
    ? stats.cpuSamples.reduce((a, b) => a + b.cpu, 0) / stats.cpuSamples.length
    : 0;
  const maxCpu = stats.cpuSamples.length > 0
    ? Math.max(...stats.cpuSamples.map(s => s.cpu))
    : 0;
  const rps = stats.totalRequests / (elapsed / 1000);
  const successRate = stats.totalRequests > 0
    ? (stats.successfulRequests / stats.totalRequests * 100).toFixed(2)
    : 0;

  console.log('\n\n' + '='.repeat(70));
  console.log('LOAD TEST RESULTS');
  console.log('='.repeat(70));
  console.log(`\nDuration:          ${formatDuration(elapsed)}`);
  console.log(`Total Requests:    ${stats.totalRequests}`);
  console.log(`Successful:        ${stats.successfulRequests}`);
  console.log(`Failed:            ${stats.failedRequests}`);
  console.log(`Success Rate:      ${successRate}%`);
  console.log(`Requests/sec:      ${rps.toFixed(2)}`);
  console.log(`\nLatency Statistics:`);
  console.log(`  Min:             ${minLatency}ms`);
  console.log(`  Avg:             ${avgLatency}ms`);
  console.log(`  P50:             ${p50}ms`);
  console.log(`  P95:             ${p95}ms`);
  console.log(`  P99:             ${p99}ms`);
  console.log(`  Max:             ${maxLatency}ms`);
  console.log(`\nCPU Statistics (DB-Sync Server):`);
  console.log(`  Average:         ${avgCpu.toFixed(1)}%`);
  console.log(`  Max:             ${maxCpu.toFixed(1)}%`);
  console.log(`  Samples:         ${stats.cpuSamples.length}`);
  console.log(`\nConcurrency at Target:`);
  console.log(`  Final:           ${stats.currentConcurrency || 'N/A'}`);
  console.log('='.repeat(70));

  // CSV export of CPU samples
  console.log('\nCPU Samples (timestamp_ms,cpu_percent):');
  stats.cpuSamples.slice(-20).forEach(s => {
    console.log(`  ${s.time - stats.startTime},${s.cpu.toFixed(1)}`);
  });

  process.exit(0);
}

// Handle Ctrl+C
process.on('SIGINT', () => {
  console.log('\n\nInterrupted by user. Generating report...');
  isRunning = false;
  stats.phase = 'cooldown';
  stats.currentConcurrency = 0;
  setTimeout(() => {
    printFinalReport();
  }, 1000);
});

// Run the test
runLoadTest().catch((error) => {
  console.error('Load test error:', error);
  process.exit(1);
});
