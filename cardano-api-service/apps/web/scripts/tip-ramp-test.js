#!/usr/bin/env node
/**
 * Simple Tip Query Ramp Test
 *
 * Ramps concurrent connections from START to END over DURATION seconds,
 * each connection continuously querying queryNetwork/tip.
 */

const WebSocket = require('ws');

const API_URL = 'wss://api.nacho.builders/v1/ogmios';
const API_KEY = process.argv[2] || 'napi_mgVKAufdHBk4DOvGft4tyGhQJO0RxlKb';

const START_CONCURRENT = 10;
const END_CONCURRENT = 1000;
const RAMP_DURATION_MS = 60 * 1000;

const stats = {
  active: 0,
  target: START_CONCURRENT,
  requests: 0,
  successes: 0,
  failures: 0,
  latencies: [],
  startTime: null,
};

let running = true;
let connectionId = 0;

function runConnection(id) {
  if (!running) return;

  stats.active++;
  const ws = new WebSocket(API_URL, { headers: { 'apikey': API_KEY } });

  ws.on('open', () => {
    const queryLoop = async () => {
      while (running && ws.readyState === WebSocket.OPEN) {
        const start = Date.now();
        const reqId = Date.now() + Math.random();

        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'queryNetwork/tip',
          id: reqId,
        }));

        await new Promise(resolve => {
          const timeout = setTimeout(() => {
            stats.failures++;
            stats.requests++;
            resolve();
          }, 10000);

          const handler = (data) => {
            try {
              const resp = JSON.parse(data.toString());
              if (resp.id === reqId) {
                clearTimeout(timeout);
                ws.removeListener('message', handler);
                const latency = Date.now() - start;
                stats.requests++;
                if (resp.result) {
                  stats.successes++;
                  stats.latencies.push(latency);
                } else {
                  stats.failures++;
                }
                resolve();
              }
            } catch {}
          };
          ws.on('message', handler);
        });

        // Small delay between queries
        await new Promise(r => setTimeout(r, 100));
      }
    };
    queryLoop();
  });

  ws.on('close', () => {
    stats.active--;
    // Reconnect if still running and below target
    if (running && stats.active < stats.target) {
      setTimeout(() => runConnection(++connectionId), 100);
    }
  });

  ws.on('error', () => {
    stats.active--;
  });
}

function getTarget(elapsedMs) {
  const progress = Math.min(1, elapsedMs / RAMP_DURATION_MS);
  return Math.floor(START_CONCURRENT + (END_CONCURRENT - START_CONCURRENT) * progress);
}

async function main() {
  console.log('='.repeat(70));
  console.log('Tip Query Ramp Test');
  console.log('='.repeat(70));
  console.log(`API: ${API_URL}`);
  console.log(`Ramp: ${START_CONCURRENT} → ${END_CONCURRENT} over 60 seconds`);
  console.log('='.repeat(70));
  console.log('');

  stats.startTime = Date.now();

  // Start initial connections
  for (let i = 0; i < START_CONCURRENT; i++) {
    runConnection(++connectionId);
    await new Promise(r => setTimeout(r, 50));
  }

  // Ramp loop
  const rampInterval = setInterval(() => {
    const elapsed = Date.now() - stats.startTime;
    stats.target = getTarget(elapsed);

    // Add connections to reach target
    while (stats.active < stats.target && running) {
      runConnection(++connectionId);
    }
  }, 100);

  // Progress reporting
  const progressInterval = setInterval(() => {
    const elapsed = (Date.now() - stats.startTime) / 1000;
    const recent = stats.latencies.slice(-100);
    const avgLatency = recent.length > 0
      ? Math.round(recent.reduce((a, b) => a + b, 0) / recent.length)
      : 0;
    const successRate = stats.requests > 0
      ? ((stats.successes / stats.requests) * 100).toFixed(1)
      : '0';
    const rps = stats.requests / elapsed;

    console.log(
      `[${elapsed.toFixed(0)}s] ` +
      `Connections: ${stats.active}/${stats.target} | ` +
      `Requests: ${stats.requests} | ` +
      `RPS: ${rps.toFixed(1)} | ` +
      `Success: ${successRate}% | ` +
      `Avg: ${avgLatency}ms`
    );
  }, 5000);

  // Wait for ramp duration
  await new Promise(r => setTimeout(r, RAMP_DURATION_MS));

  // Stop
  running = false;
  clearInterval(rampInterval);
  clearInterval(progressInterval);

  console.log('\nStopping...');
  await new Promise(r => setTimeout(r, 3000));

  // Final stats
  const duration = (Date.now() - stats.startTime) / 1000;
  const sorted = [...stats.latencies].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
  const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
  const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
  const avg = sorted.length > 0
    ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length)
    : 0;

  console.log('');
  console.log('='.repeat(70));
  console.log('FINAL RESULTS');
  console.log('='.repeat(70));
  console.log(`Duration:        ${duration.toFixed(1)} seconds`);
  console.log(`Peak Connections: ${END_CONCURRENT}`);
  console.log(`Total Requests:  ${stats.requests}`);
  console.log(`Successes:       ${stats.successes}`);
  console.log(`Failures:        ${stats.failures}`);
  console.log(`Success Rate:    ${((stats.successes / stats.requests) * 100).toFixed(2)}%`);
  console.log(`Throughput:      ${(stats.successes / duration).toFixed(2)} req/sec`);
  console.log('');
  console.log('Latency:');
  console.log(`  P50: ${p50}ms | P95: ${p95}ms | P99: ${p99}ms | Avg: ${avg}ms`);
  console.log('='.repeat(70));

  process.exit(0);
}

main().catch(console.error);
