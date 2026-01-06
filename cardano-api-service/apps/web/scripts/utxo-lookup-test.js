#!/usr/bin/env node
/**
 * UTXO Lookup Test via WebSocket
 *
 * Tests querying UTXOs for a Cardano address through the Ogmios API.
 *
 * Usage: node utxo-lookup-test.js [address] [api-key]
 */

const WebSocket = require('ws');

const API_URL = 'wss://api.nacho.builders/v1/ogmios';
const API_KEY = process.argv[3] || 'napi_0kc9ckEOow7fPkxfmC4SjMHVRqpAvmkL';

// Default to a known address with UTXOs (JPEG Store hot wallet - usually has activity)
const ADDRESS = process.argv[2] || 'addr1qxck9cenw7lswcqeylwlm96l7pqgxy90e93gm5my5atqk0nj2rk986etslrlkx4v93x8fp4a06zcr9slgpyhwerhqanq3djmqp';

console.log('='.repeat(70));
console.log('UTXO Lookup Test');
console.log('='.repeat(70));
console.log(`API: ${API_URL}`);
console.log(`Address: ${ADDRESS.slice(0, 20)}...${ADDRESS.slice(-10)}`);
console.log('='.repeat(70));
console.log('');

const startTime = Date.now();

const ws = new WebSocket(API_URL, {
  headers: { 'apikey': API_KEY }
});

ws.on('open', () => {
  console.log('Connected, querying UTXOs...');
  console.log('');

  const request = {
    jsonrpc: '2.0',
    method: 'queryLedgerState/utxo',
    params: {
      addresses: [ADDRESS]
    },
    id: 'utxo-query'
  };
  console.log('Sending:', JSON.stringify(request, null, 2));
  console.log('');
  ws.send(JSON.stringify(request));
});

ws.on('message', (data) => {
  const elapsed = Date.now() - startTime;

  try {
    const response = JSON.parse(data.toString());

    if (response.error) {
      console.error('Error:', response.error);
      ws.close();
      return;
    }

    const utxos = response.result || [];
    console.log(`Response received in ${elapsed}ms`);
    console.log('');

    if (utxos.length === 0) {
      console.log('No UTXOs found for this address.');
    } else {
      console.log(`Found ${utxos.length} UTXO(s):`);
      console.log('');

      // Calculate total ADA
      let totalLovelace = BigInt(0);
      let totalTokens = 0;

      utxos.forEach((utxo, index) => {
        const txId = utxo.transaction?.id || 'unknown';
        const outputIndex = utxo.index ?? 0;
        const value = utxo.value || {};

        // Get ADA amount
        const lovelace = BigInt(value.ada?.lovelace || value.coins || 0);
        totalLovelace += lovelace;
        const ada = Number(lovelace) / 1_000_000;

        // Count native tokens
        const assets = value.assets || {};
        const tokenCount = Object.keys(assets).length;
        totalTokens += tokenCount;

        if (index < 5) {
          console.log(`  [${index + 1}] ${txId.slice(0, 16)}...#${outputIndex}`);
          console.log(`      ADA: ${ada.toLocaleString(undefined, { minimumFractionDigits: 6 })}`);
          if (tokenCount > 0) {
            console.log(`      Tokens: ${tokenCount} policy ID(s)`);
          }
          console.log('');
        }
      });

      if (utxos.length > 5) {
        console.log(`  ... and ${utxos.length - 5} more UTXOs`);
        console.log('');
      }

      const totalAda = Number(totalLovelace) / 1_000_000;
      console.log('='.repeat(70));
      console.log('SUMMARY');
      console.log('='.repeat(70));
      console.log(`Total UTXOs:  ${utxos.length}`);
      console.log(`Total ADA:    ${totalAda.toLocaleString(undefined, { minimumFractionDigits: 6 })}`);
      console.log(`Token Types:  ${totalTokens}`);
      console.log(`Query Time:   ${elapsed}ms`);
      console.log('='.repeat(70));
    }

  } catch (err) {
    console.error('Parse error:', err.message);
  }

  ws.close();
});

ws.on('error', (err) => {
  console.error('WebSocket error:', err.message);
});

ws.on('close', () => {
  process.exit(0);
});
