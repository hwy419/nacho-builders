#!/usr/bin/env node
/**
 * Analyze Prometheus metrics and correlate with load test
 */

const data = {
  "cardano-bp": [9.63,8.90,9.32,9.40,9.07,10.85,11.17,10.53,11.83,10.37,9.98,11.30,10.33,9.00,9.22,9.68,10.17,9.25,9.87,9.63,8.89,9.47,9.52,11.02,10.48,11.15,10.50,11.22,11.13,11.17,11.95,11.27,10.90,11.75,12.67,11.85,10.67,11.13,11.25,10.42,11.58,10.57,11.85,10.82,9.63,9.50,9.98,9.13,9.22,9.95,10.45,9.03,9.00,9.75,10.23,9.13,10.53,10.40,9.55,9.20,10.00],
  "cardano-gateway": [1.10,3.47,1.03,1.25,1.67,1.42,43.62,3.10,56.70,31.28,24.37,48.03,31.77,2.02,1.37,1.25,0.98,0.95,1.47,1.48,1.17,1.00,0.97,7.93,38.18,46.55,46.77,49.33,50.72,56.95,59.15,44.72,46.95,50.70,46.55,52.90,48.90,45.73,41.75,49.50,51.97,44.92,53.85,43.07,19.43,1.80,1.45,1.50,0.90,0.97,1.47,1.15,1.03,2.68,2.78,1.02,1.00,0.98,0.97,6.47,1.00],
  "cardano-relay1": [10.06,12.37,11.43,10.92,12.53,10.98,33.18,20.07,39.09,51.15,18.33,36.95,49.51,16.13,16.10,16.28,18.15,17.10,17.68,19.55,15.03,17.85,18.28,18.50,35.42,40.77,51.35,60.30,56.87,67.49,68.23,49.90,62.61,64.53,65.79,60.55,70.50,70.02,70.61,49.06,59.96,43.90,54.50,46.24,21.17,15.48,18.22,17.62,15.53,16.98,16.55,16.12,19.13,14.70,16.70,18.28,15.32,17.83,17.02,16.45,18.45],
  "cardano-relay2": [15.58,16.47,15.75,15.38,15.77,15.52,41.72,17.95,47.52,53.17,26.88,42.07,47.07,20.92,19.70,21.80,20.25,22.78,21.12,24.33,21.22,21.17,21.45,23.78,42.38,49.93,55.90,59.32,62.02,68.40,70.72,53.67,69.23,54.13,52.57,57.97,53.90,47.45,41.93,45.13,66.45,64.47,68.09,68.55,35.72,27.36,27.20,28.16,28.22,26.02,27.95,28.17,29.05,27.88,28.48,27.43,28.73,27.17,29.87,29.07,27.80],
  "monitoring": [18.23,15.47,12.37,15.40,17.77,14.60,14.07,29.60,21.77,51.10,24.80,27.67,40.23,15.30,18.97,12.83,15.80,13.80,10.43,12.47,16.20,14.33,15.27,11.07,24.23,24.70,37.13,43.80,39.07,48.07,50.13,33.33,43.77,42.28,41.15,36.10,45.00,42.07,39.43,30.30,44.30,41.87,39.23,37.13,28.00,18.97,14.27,11.67,15.27,12.83,13.80,18.00,12.70,13.17,11.36,13.70,19.50,20.37,17.37,21.63,16.63],
  "cardano-dbsync": [24.33,34.04,21.31,20.69,21.44,48.23,28.30,22.45,27.53,19.43,27.92,38.07,20.39,31.76,32.99,19.02,23.97,20.13,47.72,19.99,30.58,20.47,22.44,34.56,25.73,30.28,31.00,29.29,30.02,20.97,27.22,32.19,32.61,30.50,38.89,20.80,22.63,21.94,34.33,34.03,28.28,36.84,23.28,27.87,23.39,21.87,37.68,25.23,25.83,35.91,25.32,25.14,22.60,31.64,35.03,22.95,32.84,27.62,23.33,24.91,23.68]
};

// Start time: 1767421290000 = 2026-01-03 00:21:30 UTC
// Each point is 15 seconds apart
const startTime = new Date(1767421290000);

// Load test started around index 24 (00:27:30) and ended around index 44 (00:32:30)
const testStartIdx = 24;
const testPeakIdx = 38;  // ~4:30 into test
const testEndIdx = 44;

console.log('='.repeat(90));
console.log('CPU METRICS CORRELATED WITH LOAD TEST');
console.log('='.repeat(90));
console.log('');

// Print timeline
console.log('TIMELINE:');
console.log('-'.repeat(90));
const phases = [
  { idx: 0, label: 'Pre-test baseline', concurrency: 0 },
  { idx: 6, label: 'Earlier burst tests', concurrency: '~50-100' },
  { idx: 13, label: 'Idle period', concurrency: 0 },
  { idx: 24, label: 'Ramp test START', concurrency: 5 },
  { idx: 30, label: 'Ramp test ~1:30', concurrency: 43 },
  { idx: 36, label: 'Ramp test ~3:00', concurrency: 82 },
  { idx: 38, label: 'Ramp test PEAK', concurrency: 115 },
  { idx: 44, label: 'Ramp test END', concurrency: 0 },
  { idx: 50, label: 'Post-test recovery', concurrency: 0 },
];

for (const phase of phases) {
  const time = new Date(startTime.getTime() + phase.idx * 15000);
  const timeStr = time.toISOString().substring(11, 19);
  console.log(`  ${timeStr} | ${phase.label.padEnd(25)} | Concurrency: ${String(phase.concurrency).padStart(3)}`);
}

console.log('');
console.log('CPU USAGE BY NODE AT KEY POINTS:');
console.log('-'.repeat(90));
console.log('Time      | Phase                    | Gateway | Relay1 | Relay2 | BP     | Combined Relays');
console.log('-'.repeat(90));

const keyPoints = [
  { idx: 0, label: 'Pre-test' },
  { idx: 6, label: 'Earlier burst' },
  { idx: 24, label: 'Ramp START' },
  { idx: 30, label: 'Ramp ~1:30 (43 conn)' },
  { idx: 36, label: 'Ramp ~3:00 (82 conn)' },
  { idx: 38, label: 'Ramp PEAK (115 conn)' },
  { idx: 40, label: 'Ramp ~4:00 (108 conn)' },
  { idx: 44, label: 'Ramp END' },
  { idx: 50, label: 'Recovery' },
];

for (const point of keyPoints) {
  const time = new Date(startTime.getTime() + point.idx * 15000);
  const timeStr = time.toISOString().substring(11, 19);
  const gw = data["cardano-gateway"][point.idx].toFixed(1);
  const r1 = data["cardano-relay1"][point.idx].toFixed(1);
  const r2 = data["cardano-relay2"][point.idx].toFixed(1);
  const bp = data["cardano-bp"][point.idx].toFixed(1);
  const combined = ((data["cardano-relay1"][point.idx] + data["cardano-relay2"][point.idx]) / 2).toFixed(1);

  console.log(`${timeStr} | ${point.label.padEnd(24)} | ${gw.padStart(6)}% | ${r1.padStart(5)}% | ${r2.padStart(5)}% | ${bp.padStart(5)}% | ${combined.padStart(6)}%`);
}

console.log('');
console.log('PEAK VALUES DURING 5-MIN RAMP TEST (indices 24-44):');
console.log('-'.repeat(90));

const testRange = (arr) => arr.slice(testStartIdx, testEndIdx + 1);
const max = (arr) => Math.max(...arr).toFixed(1);
const avg = (arr) => (arr.reduce((a,b) => a+b, 0) / arr.length).toFixed(1);

const nodes = ['cardano-gateway', 'cardano-relay1', 'cardano-relay2', 'cardano-bp', 'monitoring'];
console.log('Node             | Peak CPU | Avg CPU | Baseline (pre-test)');
console.log('-'.repeat(90));
for (const node of nodes) {
  const testData = testRange(data[node]);
  const baseline = data[node].slice(0, 6);
  console.log(`${node.padEnd(17)}| ${max(testData).padStart(6)}%  | ${avg(testData).padStart(5)}%   | ${avg(baseline).padStart(5)}%`);
}

console.log('');
console.log('LOAD BALANCING VERIFICATION:');
console.log('-'.repeat(90));

// Check how evenly load was distributed during test
const r1Test = testRange(data["cardano-relay1"]);
const r2Test = testRange(data["cardano-relay2"]);

let totalDiff = 0;
let maxDiff = 0;
for (let i = 0; i < r1Test.length; i++) {
  const diff = Math.abs(r1Test[i] - r2Test[i]);
  totalDiff += diff;
  maxDiff = Math.max(maxDiff, diff);
}
const avgDiff = totalDiff / r1Test.length;

console.log(`Average CPU difference between relay1 and relay2: ${avgDiff.toFixed(1)}%`);
console.log(`Maximum CPU difference: ${maxDiff.toFixed(1)}%`);
console.log(`Relay1 peak: ${max(r1Test)}%, Relay2 peak: ${max(r2Test)}%`);
console.log(`Verdict: ${avgDiff < 10 ? '✓ EXCELLENT' : avgDiff < 20 ? '✓ GOOD' : '⚠ UNEVEN'} load distribution`);

console.log('');
console.log('BLOCK PRODUCER ISOLATION:');
console.log('-'.repeat(90));
const bpTest = testRange(data["cardano-bp"]);
const bpBaseline = data["cardano-bp"].slice(0, 6);
const bpBaselineAvg = avg(bpBaseline);
const bpTestAvg = avg(bpTest);
const bpIncrease = (parseFloat(bpTestAvg) - parseFloat(bpBaselineAvg)).toFixed(1);

console.log(`BP baseline CPU: ${bpBaselineAvg}%`);
console.log(`BP during test: ${bpTestAvg}%`);
console.log(`BP CPU increase: ${bpIncrease}%`);
console.log(`Verdict: ${Math.abs(parseFloat(bpIncrease)) < 3 ? '✓ EXCELLENT' : '⚠ INVESTIGATE'} - Block producer fully isolated from API load`);

console.log('');
console.log('='.repeat(90));
