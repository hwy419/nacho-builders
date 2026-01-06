#!/usr/bin/env node
/**
 * Load Test Script for Cardano API Service
 *
 * Sends multiple concurrent requests to test the API gateway
 * and verify usage logging works correctly.
 *
 * Usage: node scripts/load-test.js [requests] [concurrency]
 *
 * Example: node scripts/load-test.js 50 10
 */

const WebSocket = require('ws');

// Configuration
const API_URL = 'wss://api.nacho.builders/v1/ogmios';
const API_KEY = process.env.API_KEY || 'napi_0kc9ckEOow7fPkxfmC4SjMHVRqpAvmkL';
const TOTAL_REQUESTS = parseInt(process.argv[2]) || 20;
const CONCURRENCY = parseInt(process.argv[3]) || 5;

// Stats tracking
const stats = {
  started: 0,
  completed: 0,
  failed: 0,
  totalLatency: 0,
  minLatency: Infinity,
  maxLatency: 0,
  startTime: Date.now(),
};

// Make a single WebSocket request
async function makeRequest(requestId) {
  return new Promise((resolve) => {
    const startTime = Date.now();
    stats.started++;

    const ws = new WebSocket(API_URL, {
      headers: { 'apikey': API_KEY }
    });

    const timeout = setTimeout(() => {
      ws.close();
      stats.failed++;
      console.log(`[${requestId}] TIMEOUT after 10s`);
      resolve(false);
    }, 10000);

    ws.on('open', () => {
      // Query chain tip (uses queryNetwork/tip which is cached for 10s)
      ws.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'queryNetwork/tip',
        id: requestId
      }));
    });

    ws.on('message', (data) => {
      clearTimeout(timeout);
      const latency = Date.now() - startTime;

      try {
        const response = JSON.parse(data.toString());
        if (response.result) {
          stats.completed++;
          stats.totalLatency += latency;
          stats.minLatency = Math.min(stats.minLatency, latency);
          stats.maxLatency = Math.max(stats.maxLatency, latency);
          console.log(`[${requestId}] OK - ${latency}ms - slot: ${response.result.slot}`);
        } else {
          stats.failed++;
          console.log(`[${requestId}] ERROR - ${JSON.stringify(response)}`);
        }
      } catch (e) {
        stats.failed++;
        console.log(`[${requestId}] PARSE ERROR - ${e.message}`);
      }

      ws.close();
      resolve(true);
    });

    ws.on('error', (err) => {
      clearTimeout(timeout);
      stats.failed++;
      console.log(`[${requestId}] ERROR - ${err.message}`);
      resolve(false);
    });
  });
}

// Run requests with concurrency limit
async function runLoadTest() {
  console.log('='.repeat(60));
  console.log('Cardano API Load Test');
  console.log('='.repeat(60));
  console.log(`Target: ${API_URL}`);
  console.log(`API Key: ${API_KEY.substring(0, 12)}...`);
  console.log(`Total Requests: ${TOTAL_REQUESTS}`);
  console.log(`Concurrency: ${CONCURRENCY}`);
  console.log('='.repeat(60));
  console.log('');

  const queue = [];
  for (let i = 1; i <= TOTAL_REQUESTS; i++) {
    queue.push(i);
  }

  // Process queue with concurrency limit
  const workers = [];
  for (let i = 0; i < CONCURRENCY; i++) {
    workers.push((async () => {
      while (queue.length > 0) {
        const requestId = queue.shift();
        if (requestId !== undefined) {
          await makeRequest(requestId);
          // Small delay between requests from same worker
          await new Promise(r => setTimeout(r, 100));
        }
      }
    })());
  }

  await Promise.all(workers);

  // Print summary
  const duration = (Date.now() - stats.startTime) / 1000;
  const avgLatency = stats.completed > 0 ? Math.round(stats.totalLatency / stats.completed) : 0;
  const rps = stats.completed / duration;

  console.log('');
  console.log('='.repeat(60));
  console.log('Results Summary');
  console.log('='.repeat(60));
  console.log(`Duration:        ${duration.toFixed(2)}s`);
  console.log(`Completed:       ${stats.completed}/${TOTAL_REQUESTS}`);
  console.log(`Failed:          ${stats.failed}`);
  console.log(`Requests/sec:    ${rps.toFixed(2)}`);
  console.log(`Avg Latency:     ${avgLatency}ms`);
  console.log(`Min Latency:     ${stats.minLatency === Infinity ? 'N/A' : stats.minLatency + 'ms'}`);
  console.log(`Max Latency:     ${stats.maxLatency === 0 ? 'N/A' : stats.maxLatency + 'ms'}`);
  console.log('='.repeat(60));
  console.log('');
  console.log('Check usage dashboard at: https://app.nacho.builders/usage');
}

runLoadTest().catch(console.error);
