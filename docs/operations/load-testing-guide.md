# API Load Testing Guide

This guide covers how to perform load testing on the Cardano API infrastructure using AWS EC2 spot instances for cost-effective, high-performance testing.

## Quick Start

### 1. Deploy Load Test Instance

**AWS Resources (us-east-1) - All defaults are pre-configured:**
| Resource | Value | Notes |
|----------|-------|-------|
| VPC | `vpc-c1523abb` | Default VPC |
| Subnet | `subnet-aa81ddcd` | us-east-1a, public |
| Key Pair | `cardano-spo` | Matches `~/.ssh/cardano-spo` local key |
| Instance | `c5n.2xlarge` | Network-optimized (25 Gbps), **SPOT** |
| Cost | ~$0.10-0.15/hr | 70% cheaper than on-demand |

**Test API Key:** `napi_mgVKAufdHBk4DOvGft4tyGhQJO0RxlKb` (admin key for load testing)

```bash
# Deploy the CloudFormation stack (all defaults pre-configured, just run this!)
aws cloudformation create-stack \
  --stack-name loadtest \
  --template-body file://docs/operations/load-testing-cfn.yaml

# Wait for stack creation
aws cloudformation wait stack-create-complete --stack-name loadtest

# Get the instance IP
aws cloudformation describe-stacks --stack-name loadtest \
  --query 'Stacks[0].Outputs[?OutputKey==`PublicIP`].OutputValue' --output text
```

### 2. Connect to Instance

```bash
# SSH to the instance (wait ~60 seconds for initialization)
ssh -i ~/.ssh/cardano-spo ubuntu@<PUBLIC_IP>

# Verify tools are installed (should show "SPOT" instance type)
cat ~/ready.txt
k6 version
```

### 3. Run Tests

```bash
# Quick HTTP test with hey
hey -n 10000 -c 100 https://api.nacho.builders/v1/graphql

# Advanced test with k6
k6 run -e API_KEY=your-api-key ~/loadtests/http-stress.js
```

### 4. Cleanup

```bash
aws cloudformation delete-stack --stack-name loadtest
```

---

## Tools Overview

| Tool | Best For | Protocols |
|------|----------|-----------|
| **hey** | Quick HTTP benchmarks | HTTP/HTTPS |
| **k6** | Complex scenarios, scripting | HTTP, WebSocket, gRPC |
| **websocat** | WebSocket debugging | WebSocket |

---

## Hey - Quick HTTP Load Testing

### Basic Usage

```bash
# Simple GET request
hey -n 1000 -c 50 https://api.example.com/endpoint

# POST with JSON body
hey -n 10000 -c 100 -m POST \
  -H "Content-Type: application/json" \
  -d '{"query": "{ block(limit: 1) { number hash } }"}' \
  https://api.nacho.builders/v1/graphql
```

### Common Options

| Option | Description | Example |
|--------|-------------|---------|
| `-n` | Total number of requests | `-n 10000` |
| `-c` | Concurrent workers | `-c 100` |
| `-t` | Timeout per request (seconds) | `-t 30` |
| `-m` | HTTP method | `-m POST` |
| `-H` | Header | `-H "apikey: xxx"` |
| `-d` | Request body | `-d '{"key": "value"}'` |
| `-q` | Rate limit (QPS) | `-q 100` |

### Stress Test Examples

```bash
# Light load (baseline)
hey -n 1000 -c 10 -t 20 <URL>

# Medium load
hey -n 10000 -c 100 -t 30 <URL>

# Heavy load
hey -n 50000 -c 500 -t 30 <URL>

# Extreme load
hey -n 100000 -c 1000 -t 45 <URL>

# Sustained rate limit test (100 req/s for 60 seconds)
hey -q 100 -z 60s <URL>
```

### Authenticated GraphQL Test

```bash
hey -n 10000 -c 200 -t 30 \
  -m POST \
  -H "Content-Type: application/json" \
  -H "apikey: napi_YOUR_API_KEY_HERE" \
  -d '{"query": "{ block(limit: 5) { number hash epochNo slotNo } }"}' \
  https://api.nacho.builders/v1/graphql
```

---

## K6 - Advanced Load Testing

### Running Built-in Scripts

```bash
# HTTP stress test
k6 run -e TARGET_URL=https://api.nacho.builders/v1/graphql \
       -e API_KEY=your-key \
       ~/loadtests/http-stress.js

# WebSocket stress test
k6 run -e WS_URL=wss://api.nacho.builders/v1/ogmios \
       -e API_KEY=your-key \
       ~/loadtests/websocket-stress.js
```

### Custom K6 Script

Create a file `custom-test.js`:

```javascript
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');

// Test configuration
export const options = {
  // Ramp-up pattern
  stages: [
    { duration: '30s', target: 50 },   // Warm up
    { duration: '1m', target: 100 },   // Ramp to 100 users
    { duration: '2m', target: 100 },   // Stay at 100
    { duration: '1m', target: 200 },   // Ramp to 200 users
    { duration: '2m', target: 200 },   // Stay at 200
    { duration: '30s', target: 0 },    // Ramp down
  ],

  // Performance thresholds
  thresholds: {
    http_req_duration: ['p(95)<500', 'p(99)<1000'],
    errors: ['rate<0.01'],  // Less than 1% errors
  },
};

export default function () {
  const url = 'https://api.nacho.builders/v1/graphql';

  const payload = JSON.stringify({
    query: `{
      block(limit: 10, order_by: {number: desc}) {
        number
        hash
        epochNo
        slotNo
        time
      }
    }`
  });

  const params = {
    headers: {
      'Content-Type': 'application/json',
      'apikey': __ENV.API_KEY,
    },
  };

  const res = http.post(url, payload, params);

  // Track metrics
  responseTime.add(res.timings.duration);
  errorRate.add(res.status !== 200);

  // Assertions
  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time OK': (r) => r.timings.duration < 500,
    'has data': (r) => r.json('data') !== null,
  });

  sleep(0.5);  // Think time between requests
}
```

Run with:
```bash
k6 run -e API_KEY=your-key custom-test.js
```

### K6 WebSocket Test

```javascript
import ws from 'k6/ws';
import { check } from 'k6';
import { Counter, Trend } from 'k6/metrics';

const messages = new Counter('ws_messages');
const latency = new Trend('ws_latency');

export const options = {
  stages: [
    { duration: '10s', target: 100 },
    { duration: '1m', target: 100 },
    { duration: '10s', target: 0 },
  ],
};

export default function () {
  const url = 'wss://api.nacho.builders/v1/ogmios';

  const res = ws.connect(url, { headers: { apikey: __ENV.API_KEY } }, (socket) => {
    socket.on('open', () => {
      const start = Date.now();

      // Query chain tip
      socket.send(JSON.stringify({
        jsonrpc: '2.0',
        method: 'queryNetwork/tip',
        id: 1
      }));

      socket.on('message', (data) => {
        messages.add(1);
        latency.add(Date.now() - start);
      });
    });

    socket.setTimeout(() => socket.close(), 5000);
  });

  check(res, { 'Connected': (r) => r && r.status === 101 });
}
```

---

## WebSocket Testing with Websocat

### Basic Connection Test

```bash
# Test Ogmios WebSocket
echo '{"jsonrpc":"2.0","method":"queryNetwork/tip","id":1}' | \
  websocat --header "apikey: YOUR_KEY" -n1 \
  wss://api.nacho.builders/v1/ogmios
```

### Interactive Session

```bash
websocat --header "apikey: YOUR_KEY" wss://api.nacho.builders/v1/ogmios
# Then type JSON-RPC commands interactively
```

---

## System Tuning (Pre-configured in CloudFormation)

If setting up manually, apply these optimizations:

```bash
# Increase file descriptor limits
echo "* soft nofile 65535" >> /etc/security/limits.conf
echo "* hard nofile 65535" >> /etc/security/limits.conf

# Network tuning
cat >> /etc/sysctl.conf << EOF
net.core.somaxconn = 65535
net.ipv4.ip_local_port_range = 1024 65535
net.ipv4.tcp_tw_reuse = 1
net.core.netdev_max_backlog = 65535
EOF
sysctl -p

# Apply for current session
ulimit -n 65535
```

---

## Interpreting Results

### Hey Output Explained

```
Summary:
  Total:        10.5 secs           # Total test duration
  Slowest:      0.85 secs           # Slowest request
  Fastest:      0.02 secs           # Fastest request
  Average:      0.10 secs           # Average response time
  Requests/sec: 952.38              # Throughput

Latency distribution:
  10% in 0.05 secs                  # 10th percentile
  50% in 0.08 secs                  # Median (p50)
  90% in 0.15 secs                  # p90 - important!
  95% in 0.20 secs                  # p95 - SLA target
  99% in 0.45 secs                  # p99 - tail latency

Status code distribution:
  [200] 10000 responses             # Success count
```

### Key Metrics to Watch

| Metric | Good | Warning | Critical |
|--------|------|---------|----------|
| p95 Latency | <500ms | 500-1000ms | >1000ms |
| p99 Latency | <1000ms | 1-2s | >2s |
| Error Rate | <0.1% | 0.1-1% | >1% |
| Throughput | Stable | Declining | Erratic |

---

## Benchmark Results (Reference)

Results from January 2025 testing after Kong migration:

### HTTPS Performance

| Concurrency | Requests/sec | p50 | p99 | Errors |
|-------------|--------------|-----|-----|--------|
| 100 | 3,309 | 24ms | 293ms | 0% |
| 500 | 6,676 | 65ms | 314ms | 0% |
| 1,000 | 7,485 | 92ms | 426ms | 0% |
| 2,000 | 8,381 | 209ms | 708ms | 0% |
| 5,000 | 8,363 | 524ms | 1.4s | 0% |

### WebSocket Performance

| Connections | Messages/sec | Avg Connect Time |
|-------------|--------------|------------------|
| 200 | 220 | 80ms |

### Authenticated Queries (with DB)

| Query Type | Concurrency | Requests/sec | p99 |
|------------|-------------|--------------|-----|
| Simple (1 block) | 500 | 873 | 1.2s |
| Heavy (20 blocks + txs) | 200 | 740 | 562ms |

---

## Troubleshooting

### "Too many open files" Error

```bash
# Check current limit
ulimit -n

# Increase for session
ulimit -n 65535

# If still failing, reduce concurrency or fix /etc/security/limits.conf
```

### Connection Timeouts

```bash
# Increase timeout
hey -t 60 ...

# Or reduce concurrency
hey -c 50 ...
```

### DNS Resolution Errors

```bash
# Use IP directly to bypass DNS
hey -n 1000 -c 100 https://108.248.110.80/v1/graphql \
  -H "Host: api.nacho.builders"
```

### SSL Certificate Errors

```bash
# Skip SSL verification (testing only!)
# hey doesn't support this, use curl for debugging:
curl -k https://api.nacho.builders/v1/graphql
```

---

## Cost Optimization

### Spot Instance Pricing (us-east-1)

| Instance | On-Demand | Spot (~70% off) |
|----------|-----------|-----------------|
| t3.medium | $0.042/hr | ~$0.013/hr |
| c5.xlarge | $0.170/hr | ~$0.051/hr |
| c5n.2xlarge | $0.432/hr | ~$0.130/hr |

### Tips

1. Use spot instances (default in CloudFormation template)
2. Terminate immediately after testing
3. Use smaller instances for light tests
4. Use c5n instances for network-heavy tests (higher bandwidth)

---

## Cleanup Checklist

After testing, ensure you clean up:

```bash
# Delete CloudFormation stack (removes all resources)
aws cloudformation delete-stack --stack-name loadtest

# Verify deletion
aws cloudformation describe-stacks --stack-name loadtest
# Should return "Stack with id loadtest does not exist"
```

Manual cleanup if needed:
- [ ] EC2 instances terminated
- [ ] Security groups deleted
- [ ] Key pairs removed (if temporary)
- [ ] Any EBS volumes deleted
