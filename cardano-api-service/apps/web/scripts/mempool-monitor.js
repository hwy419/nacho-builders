#!/usr/bin/env node
/**
 * Live Mempool Monitor with Transaction Lifecycle Tracking
 *
 * Real-time visualization of the Cardano mempool with transaction details.
 * Tracks the full lifecycle of transactions from mempool entry to block inclusion.
 *
 * Features:
 * - Live mempool monitoring with transaction details
 * - Chain sync to follow new blocks in real-time
 * - Tracks when transactions move from mempool to blocks
 * - Shows time spent in mempool before confirmation
 * - Recent blocks display with transaction counts
 * - Handles chain rollbacks gracefully
 * - Optional JSON logging of all events
 *
 * Usage: node mempool-monitor.js [options]
 *
 * Options:
 *   --network <name>       Network: mainnet or preprod (default: mainnet)
 *   --refresh <ms>         Refresh interval in ms (default: 1000)
 *   --max-txs <number>     Max pending transactions to display (default: 15)
 *   --max-confirmed <n>    Max confirmed transactions to display (default: 10)
 *   --max-blocks <n>       Max recent blocks to show (default: 20)
 *   --log <file>           Write events to JSON log file (default: none)
 */

const WebSocket = require('ws');
const fs = require('fs');

// Parse command line arguments
function parseArgs() {
  const args = process.argv.slice(2);
  const config = {
    network: 'mainnet',
    refresh: 1000,
    maxTxs: 15,
    maxConfirmed: 10,
    maxBlocks: 20,
    logFile: null,
  };

  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--network':
        config.network = args[++i];
        break;
      case '--refresh':
        config.refresh = parseInt(args[++i], 10);
        break;
      case '--max-txs':
        config.maxTxs = parseInt(args[++i], 10);
        break;
      case '--max-confirmed':
        config.maxConfirmed = parseInt(args[++i], 10);
        break;
      case '--max-blocks':
        config.maxBlocks = parseInt(args[++i], 10);
        break;
      case '--log':
        config.logFile = args[++i];
        break;
      case '--help':
        console.log(`
Live Mempool Monitor with Transaction Lifecycle Tracking

Options:
  --network <name>       Network: mainnet or preprod (default: mainnet)
  --refresh <ms>         Refresh interval in ms (default: 1000)
  --max-txs <number>     Max pending transactions to display (default: 15)
  --max-confirmed <n>    Max confirmed transactions to display (default: 10)
  --max-blocks <n>       Max recent blocks to show (default: 20)
  --log <file>           Write events to JSON log file (default: none)
`);
        process.exit(0);
    }
  }
  return config;
}

const CONFIG = parseArgs();

// Logging
let logStream = null;

function initLog() {
  if (CONFIG.logFile) {
    logStream = fs.createWriteStream(CONFIG.logFile, { flags: 'a' });
    logEvent('session_start', {
      network: CONFIG.network,
      startTime: new Date().toISOString(),
    });
  }
}

function logEvent(eventType, data) {
  if (!logStream) return;

  const entry = {
    timestamp: new Date().toISOString(),
    event: eventType,
    ...data,
  };

  logStream.write(JSON.stringify(entry) + '\n');
}

function closeLog() {
  if (logStream) {
    logEvent('session_end', {
      totalSeen: state.totalSeen,
      totalConfirmed: state.totalConfirmed,
      duration: Date.now() - state.sessionStart,
    });
    logStream.end();
  }
}

// API configuration
const API_URLS = {
  mainnet: 'wss://api.nacho.builders/v1/ogmios',
  preprod: 'wss://api.nacho.builders/v1/preprod/ogmios',
};
const API_URL = API_URLS[CONFIG.network] || API_URLS.mainnet;
const API_KEY = process.env.API_KEY || 'napi_mgVKAufdHBk4DOvGft4tyGhQJO0RxlKb';

// ANSI escape codes
const ESC = '\x1b';
const CLEAR_SCREEN = `${ESC}[2J`;
const CURSOR_HOME = `${ESC}[H`;
const CURSOR_HIDE = `${ESC}[?25l`;
const CURSOR_SHOW = `${ESC}[?25h`;
const BOLD = `${ESC}[1m`;
const DIM = `${ESC}[2m`;
const RESET = `${ESC}[0m`;

// Colors
const C = {
  black: `${ESC}[30m`,
  red: `${ESC}[31m`,
  green: `${ESC}[32m`,
  yellow: `${ESC}[33m`,
  blue: `${ESC}[34m`,
  magenta: `${ESC}[35m`,
  cyan: `${ESC}[36m`,
  white: `${ESC}[37m`,
  gray: `${ESC}[90m`,
  brightRed: `${ESC}[91m`,
  brightGreen: `${ESC}[92m`,
  brightYellow: `${ESC}[93m`,
  brightBlue: `${ESC}[94m`,
  brightMagenta: `${ESC}[95m`,
  brightCyan: `${ESC}[96m`,
  brightWhite: `${ESC}[97m`,
  bgBlue: `${ESC}[44m`,
  bgCyan: `${ESC}[46m`,
  bgGray: `${ESC}[100m`,
};

// Box drawing characters
const BOX = {
  topLeft: '╭',
  topRight: '╮',
  bottomLeft: '╰',
  bottomRight: '╯',
  horizontal: '─',
  vertical: '│',
  teeRight: '├',
  teeLeft: '┤',
  teeDown: '┬',
  teeUp: '┴',
  cross: '┼',
  doubleTeeRight: '╟',
  doubleTeeLeft: '╢',
  doubleHorizontal: '═',
  doubleTopLeft: '╔',
  doubleTopRight: '╗',
  doubleBottomLeft: '╚',
  doubleBottomRight: '╝',
  doubleVertical: '║',
};

// State
const state = {
  connected: false,
  mempoolSlot: null,
  transactions: [],
  lastUpdate: null,
  totalSeen: 0,
  sessionStart: Date.now(),
  error: null,
  stats: {
    totalAda: 0,
    totalFees: 0,
    avgFee: 0,
    minFee: Infinity,
    maxFee: 0,
    totalInputs: 0,
    totalOutputs: 0,
  },
  // Transaction lifecycle tracking
  trackedTxs: new Map(),       // txId → { firstSeen, tx }
  confirmedTxs: [],            // Recently confirmed transactions
  latestBlocks: [],            // Last few blocks with their transactions
  chainSyncConnected: false,
  chainTip: null,              // { slot, id }
  totalConfirmed: 0,           // Session total confirmed
};

// Utility functions
function formatAda(lovelace) {
  if (lovelace === undefined || lovelace === null) return '?';
  const ada = Number(lovelace) / 1_000_000;
  if (ada >= 1_000_000) return `${(ada / 1_000_000).toFixed(2)}M`;
  if (ada >= 1_000) return `${(ada / 1_000).toFixed(2)}K`;
  return ada.toFixed(2);
}

function formatLovelace(lovelace) {
  if (lovelace === undefined || lovelace === null) return '?';
  return Number(lovelace).toLocaleString();
}

function truncateHash(hash, len = 8) {
  if (!hash) return '?';
  if (hash.length <= len * 2 + 3) return hash;
  return `${hash.slice(0, len)}...${hash.slice(-len)}`;
}

function truncateAddress(addr, len = 12) {
  if (!addr) return '?';
  if (addr.length <= len * 2 + 3) return addr;
  return `${addr.slice(0, len)}...${addr.slice(-8)}`;
}

function formatBytes(bytes) {
  if (bytes === undefined || bytes === null) return '?';
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

function formatDuration(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m ${seconds % 60}s`;
  return `${seconds}s`;
}

function formatMempoolTime(ms) {
  if (ms === undefined || ms === null) return '?';
  const seconds = ms / 1000;
  if (seconds >= 60) {
    const minutes = Math.floor(seconds / 60);
    const secs = (seconds % 60).toFixed(1);
    return `${minutes}m ${secs}s`;
  }
  return `${seconds.toFixed(1)}s`;
}

function padCenter(str, width) {
  const padding = width - str.length;
  const left = Math.floor(padding / 2);
  const right = padding - left;
  return ' '.repeat(Math.max(0, left)) + str + ' '.repeat(Math.max(0, right));
}

function padRight(str, width) {
  return str + ' '.repeat(Math.max(0, width - str.length));
}

function padLeft(str, width) {
  return ' '.repeat(Math.max(0, width - str.length)) + str;
}

// Get terminal width
function getTerminalWidth() {
  return process.stdout.columns || 120;
}

// Draw horizontal line
function drawLine(width, left = BOX.teeRight, right = BOX.teeLeft, fill = BOX.horizontal) {
  return `${C.cyan}${left}${fill.repeat(width - 2)}${right}${RESET}`;
}

// Draw box top
function drawBoxTop(width, title = '') {
  if (title) {
    const titlePart = ` ${title} `;
    const remaining = width - 2 - titlePart.length;
    const left = Math.floor(remaining / 2);
    const right = remaining - left;
    return `${C.cyan}${BOX.topLeft}${BOX.horizontal.repeat(left)}${C.brightCyan}${BOLD}${titlePart}${RESET}${C.cyan}${BOX.horizontal.repeat(right)}${BOX.topRight}${RESET}`;
  }
  return `${C.cyan}${BOX.topLeft}${BOX.horizontal.repeat(width - 2)}${BOX.topRight}${RESET}`;
}

// Draw box bottom
function drawBoxBottom(width) {
  return `${C.cyan}${BOX.bottomLeft}${BOX.horizontal.repeat(width - 2)}${BOX.bottomRight}${RESET}`;
}

// Calculate transaction value
function getTxValue(tx) {
  if (!tx.outputs) return 0;
  return tx.outputs.reduce((sum, out) => {
    const ada = out.value?.ada?.lovelace || out.value?.coins || 0;
    return sum + Number(ada);
  }, 0);
}

// Calculate transaction fee
function getTxFee(tx) {
  return Number(tx.fee?.lovelace || tx.fee || 0);
}

// Check if tx has tokens
function hasTokens(tx) {
  if (!tx.outputs) return false;
  return tx.outputs.some(out => {
    const assets = out.value?.assets || out.value?.ada?.assets;
    return assets && Object.keys(assets).length > 0;
  });
}

// Check if tx has scripts
function hasScripts(tx) {
  return tx.scripts && Object.keys(tx.scripts).length > 0;
}

// Check if tx has metadata
function hasMetadata(tx) {
  return tx.metadata && Object.keys(tx.metadata).length > 0;
}

// Render the UI
function render() {
  const width = Math.min(getTerminalWidth(), 140);
  const lines = [];

  // Header
  lines.push('');
  lines.push(drawBoxTop(width, '🔮 CARDANO MEMPOOL MONITOR'));

  // Status bar
  const networkLabel = CONFIG.network.toUpperCase();
  const networkColor = CONFIG.network === 'mainnet' ? C.brightGreen : C.brightYellow;
  const mempoolIcon = state.connected ? `${C.brightGreen}●${RESET}` : `${C.brightRed}●${RESET}`;
  const chainIcon = state.chainSyncConnected ? `${C.brightGreen}●${RESET}` : `${C.brightRed}●${RESET}`;
  const uptime = formatDuration(Date.now() - state.sessionStart);
  const chainTipSlot = state.chainTip?.slot?.toLocaleString() || '?';

  lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${mempoolIcon} Mempool  ${chainIcon} Chain  ${C.gray}│${RESET}  ${networkColor}${BOLD}${networkLabel}${RESET}  ${C.gray}│${RESET}  ${C.gray}Tip:${RESET} ${C.brightWhite}${chainTipSlot}${RESET}  ${C.gray}│${RESET}  ${C.gray}Uptime:${RESET} ${uptime}  ${C.gray}│${RESET}  ${C.gray}Tracking:${RESET} ${state.trackedTxs.size}${' '.repeat(Math.max(0, width - 90))}${C.cyan}${BOX.vertical}${RESET}`);

  lines.push(drawLine(width));

  // Stats section
  const txCount = state.transactions.length;
  const totalAda = formatAda(state.stats.totalAda);
  const totalFees = formatAda(state.stats.totalFees);
  const avgFee = state.transactions.length > 0 ? formatAda(state.stats.totalFees / state.transactions.length) : '0';

  lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.brightCyan}${BOLD}MEMPOOL STATS${RESET}${' '.repeat(width - 17)}${C.cyan}${BOX.vertical}${RESET}`);
  lines.push(`${C.cyan}${BOX.vertical}${RESET}${RESET}`);

  // Stats in columns
  const col1 = `  ${C.gray}Transactions:${RESET} ${C.brightWhite}${BOLD}${txCount}${RESET}`;
  const col2 = `${C.gray}Total Value:${RESET} ${C.brightGreen}${totalAda} ADA${RESET}`;
  const col3 = `${C.gray}Total Fees:${RESET} ${C.brightYellow}${totalFees} ADA${RESET}`;
  const col4 = `${C.gray}Avg Fee:${RESET} ${C.yellow}${avgFee} ADA${RESET}`;
  const col5 = `${C.gray}Session Total:${RESET} ${C.brightMagenta}${state.totalSeen}${RESET}`;

  const statsLine = `${col1}    ${col2}    ${col3}    ${col4}    ${col5}`;
  lines.push(`${C.cyan}${BOX.vertical}${RESET}${statsLine}${' '.repeat(Math.max(0, width - 115))}${C.cyan}${BOX.vertical}${RESET}`);
  lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);

  lines.push(drawLine(width));

  // Transaction table header
  lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.brightCyan}${BOLD}PENDING TRANSACTIONS${RESET}${' '.repeat(width - 24)}${C.cyan}${BOX.vertical}${RESET}`);
  lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);

  // Table header
  const colWidths = {
    hash: 20,
    value: 14,
    fee: 12,
    size: 8,
    inputs: 6,
    outputs: 7,
    flags: 12,
  };

  const headerLine =
    `  ${C.gray}${padRight('TX HASH', colWidths.hash)}${RESET}` +
    `${C.gray}${padLeft('VALUE (ADA)', colWidths.value)}${RESET}  ` +
    `${C.gray}${padLeft('FEE', colWidths.fee)}${RESET}  ` +
    `${C.gray}${padLeft('SIZE', colWidths.size)}${RESET}  ` +
    `${C.gray}${padLeft('IN', colWidths.inputs)}${RESET}  ` +
    `${C.gray}${padLeft('OUT', colWidths.outputs)}${RESET}  ` +
    `${C.gray}${padRight('FLAGS', colWidths.flags)}${RESET}`;

  lines.push(`${C.cyan}${BOX.vertical}${RESET}${headerLine}${' '.repeat(Math.max(0, width - 90))}${C.cyan}${BOX.vertical}${RESET}`);
  lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${'─'.repeat(86)}${RESET}${' '.repeat(Math.max(0, width - 92))}${C.cyan}${BOX.vertical}${RESET}`);

  // Transaction rows
  const displayTxs = state.transactions.slice(0, CONFIG.maxTxs);

  if (displayTxs.length === 0) {
    lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${DIM}No transactions in mempool...${RESET}${' '.repeat(width - 35)}${C.cyan}${BOX.vertical}${RESET}`);
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${DIM}Waiting for new transactions to arrive${RESET}${' '.repeat(width - 44)}${C.cyan}${BOX.vertical}${RESET}`);
    lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);
  } else {
    for (const tx of displayTxs) {
      const hash = truncateHash(tx.id, 8);
      const value = formatAda(getTxValue(tx));
      const fee = formatAda(getTxFee(tx));
      const size = formatBytes(tx.cbor ? tx.cbor.length / 2 : 0);
      const inputs = tx.inputs?.length || 0;
      const outputs = tx.outputs?.length || 0;

      // Build flags
      const flags = [];
      if (hasTokens(tx)) flags.push(`${C.brightMagenta}◆${RESET}`);
      if (hasScripts(tx)) flags.push(`${C.brightYellow}⚡${RESET}`);
      if (hasMetadata(tx)) flags.push(`${C.brightBlue}📎${RESET}`);
      const flagStr = flags.join(' ') || `${C.gray}─${RESET}`;

      // Color code by value
      let valueColor = C.white;
      const adaValue = getTxValue(tx) / 1_000_000;
      if (adaValue >= 10000) valueColor = C.brightGreen;
      else if (adaValue >= 1000) valueColor = C.green;
      else if (adaValue >= 100) valueColor = C.brightWhite;

      // Color code by fee
      let feeColor = C.gray;
      const feeAda = getTxFee(tx) / 1_000_000;
      if (feeAda >= 1) feeColor = C.brightYellow;
      else if (feeAda >= 0.5) feeColor = C.yellow;

      const txLine =
        `  ${C.cyan}${padRight(hash, colWidths.hash)}${RESET}` +
        `${valueColor}${padLeft(value, colWidths.value)}${RESET}  ` +
        `${feeColor}${padLeft(fee, colWidths.fee)}${RESET}  ` +
        `${C.gray}${padLeft(size, colWidths.size)}${RESET}  ` +
        `${C.white}${padLeft(String(inputs), colWidths.inputs)}${RESET}  ` +
        `${C.white}${padLeft(String(outputs), colWidths.outputs)}${RESET}  ` +
        `${flagStr}`;

      lines.push(`${C.cyan}${BOX.vertical}${RESET}${txLine}${' '.repeat(Math.max(0, width - 90))}${C.cyan}${BOX.vertical}${RESET}`);
    }
  }

  // Show if more transactions exist
  if (state.transactions.length > CONFIG.maxTxs) {
    const more = state.transactions.length - CONFIG.maxTxs;
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${DIM}... and ${more} more transaction${more > 1 ? 's' : ''}${RESET}${' '.repeat(width - 32 - String(more).length)}${C.cyan}${BOX.vertical}${RESET}`);
  }

  lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);

  // Legend
  lines.push(drawLine(width));
  lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}Legend:${RESET} ${C.brightMagenta}◆${RESET}${C.gray}=Tokens${RESET}  ${C.brightYellow}⚡${RESET}${C.gray}=Smart Contract${RESET}  ${C.brightBlue}📎${RESET}${C.gray}=Metadata${RESET}${' '.repeat(width - 58)}${C.cyan}${BOX.vertical}${RESET}`);

  // Recently Confirmed section
  lines.push(drawLine(width));
  lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.brightGreen}${BOLD}RECENTLY CONFIRMED${RESET}  ${C.gray}(${state.totalConfirmed} this session)${RESET}${' '.repeat(Math.max(0, width - 45))}${C.cyan}${BOX.vertical}${RESET}`);
  lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);

  const displayConfirmed = state.confirmedTxs.slice(0, CONFIG.maxConfirmed);

  if (displayConfirmed.length === 0) {
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${DIM}No transactions confirmed yet...${RESET}${' '.repeat(width - 38)}${C.cyan}${BOX.vertical}${RESET}`);
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${DIM}Transactions will appear here when included in blocks${RESET}${' '.repeat(width - 58)}${C.cyan}${BOX.vertical}${RESET}`);
  } else {
    // Confirmed transactions header
    const confHeaderLine =
      `  ${C.gray}${padRight('TX HASH', 20)}${RESET}` +
      `${C.gray}${padLeft('BLOCK SLOT', 14)}${RESET}  ` +
      `${C.gray}${padLeft('MEMPOOL TIME', 14)}${RESET}  ` +
      `${C.gray}${padLeft('VALUE', 12)}${RESET}`;
    lines.push(`${C.cyan}${BOX.vertical}${RESET}${confHeaderLine}${' '.repeat(Math.max(0, width - 68))}${C.cyan}${BOX.vertical}${RESET}`);
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${'─'.repeat(64)}${RESET}${' '.repeat(Math.max(0, width - 70))}${C.cyan}${BOX.vertical}${RESET}`);

    for (const confirmed of displayConfirmed) {
      const hash = truncateHash(confirmed.txId, 8);
      const slot = confirmed.slot?.toLocaleString() || '?';
      const mempoolTime = formatMempoolTime(confirmed.timeInMempool);
      const value = formatAda(getTxValue(confirmed.tx));

      // Color by mempool time
      let timeColor = C.brightGreen;
      if (confirmed.timeInMempool > 60000) timeColor = C.yellow;
      if (confirmed.timeInMempool > 120000) timeColor = C.brightRed;

      const confLine =
        `  ${C.green}${padRight(hash, 20)}${RESET}` +
        `${C.brightWhite}${padLeft(slot, 14)}${RESET}  ` +
        `${timeColor}${padLeft(mempoolTime, 14)}${RESET}  ` +
        `${C.brightGreen}${padLeft(value, 12)}${RESET}`;

      lines.push(`${C.cyan}${BOX.vertical}${RESET}${confLine}${' '.repeat(Math.max(0, width - 68))}${C.cyan}${BOX.vertical}${RESET}`);
    }

    if (state.confirmedTxs.length > CONFIG.maxConfirmed) {
      const moreConf = state.confirmedTxs.length - CONFIG.maxConfirmed;
      lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${DIM}... and ${moreConf} more${RESET}${' '.repeat(width - 18 - String(moreConf).length)}${C.cyan}${BOX.vertical}${RESET}`);
    }
  }

  lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);

  // Recent Blocks section
  lines.push(drawLine(width));
  lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.brightBlue}${BOLD}RECENT BLOCKS${RESET}${' '.repeat(width - 18)}${C.cyan}${BOX.vertical}${RESET}`);
  lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);

  const displayBlocks = state.latestBlocks.slice(0, CONFIG.maxBlocks);

  if (displayBlocks.length === 0) {
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${DIM}Syncing to chain tip...${RESET}${' '.repeat(width - 29)}${C.cyan}${BOX.vertical}${RESET}`);
  } else {
    // Blocks header
    const blockHeaderLine =
      `  ${C.gray}${padRight('SLOT', 14)}${RESET}` +
      `${C.gray}${padLeft('TXS', 6)}${RESET}  ` +
      `${C.gray}${padLeft('TRACKED', 9)}${RESET}  ` +
      `${C.gray}${padLeft('VALUE', 12)}${RESET}  ` +
      `${C.gray}${padLeft('AGE', 10)}${RESET}`;
    lines.push(`${C.cyan}${BOX.vertical}${RESET}${blockHeaderLine}${' '.repeat(Math.max(0, width - 59))}${C.cyan}${BOX.vertical}${RESET}`);
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.gray}${'─'.repeat(55)}${RESET}${' '.repeat(Math.max(0, width - 61))}${C.cyan}${BOX.vertical}${RESET}`);

    for (const block of displayBlocks) {
      const slot = block.slot?.toLocaleString() || '?';
      const txCount = block.txCount || 0;
      const tracked = block.confirmedFromMempool || 0;
      const value = formatAda(block.totalValue);
      const age = formatDuration(Date.now() - block.receivedAt);

      // Highlight if we confirmed transactions from this block
      const trackedColor = tracked > 0 ? C.brightGreen : C.gray;
      const trackedStr = tracked > 0 ? `+${tracked}` : '0';

      const blockLine =
        `  ${C.brightBlue}${padRight(slot, 14)}${RESET}` +
        `${C.white}${padLeft(String(txCount), 6)}${RESET}  ` +
        `${trackedColor}${padLeft(trackedStr, 9)}${RESET}  ` +
        `${C.brightGreen}${padLeft(value, 12)}${RESET}  ` +
        `${C.gray}${padLeft(age, 10)}${RESET}`;

      lines.push(`${C.cyan}${BOX.vertical}${RESET}${blockLine}${' '.repeat(Math.max(0, width - 59))}${C.cyan}${BOX.vertical}${RESET}`);
    }
  }

  lines.push(`${C.cyan}${BOX.vertical}${RESET}${' '.repeat(width - 2)}${C.cyan}${BOX.vertical}${RESET}`);

  // Error display
  if (state.error) {
    lines.push(drawLine(width));
    lines.push(`${C.cyan}${BOX.vertical}${RESET}  ${C.brightRed}${BOLD}ERROR:${RESET} ${C.red}${state.error}${RESET}${' '.repeat(Math.max(0, width - 12 - state.error.length))}${C.cyan}${BOX.vertical}${RESET}`);
  }

  // Footer
  lines.push(drawBoxBottom(width));
  lines.push(`  ${C.gray}${DIM}Press Ctrl+C to exit${RESET}`);
  lines.push('');

  // Output
  process.stdout.write(CURSOR_HOME + CLEAR_SCREEN);
  console.log(lines.join('\n'));
}

// Update stats from transactions
function updateStats() {
  state.stats = {
    totalAda: 0,
    totalFees: 0,
    avgFee: 0,
    minFee: Infinity,
    maxFee: 0,
    totalInputs: 0,
    totalOutputs: 0,
  };

  for (const tx of state.transactions) {
    const value = getTxValue(tx);
    const fee = getTxFee(tx);

    state.stats.totalAda += value;
    state.stats.totalFees += fee;
    state.stats.totalInputs += tx.inputs?.length || 0;
    state.stats.totalOutputs += tx.outputs?.length || 0;

    if (fee < state.stats.minFee) state.stats.minFee = fee;
    if (fee > state.stats.maxFee) state.stats.maxFee = fee;
  }

  if (state.transactions.length > 0) {
    state.stats.avgFee = state.stats.totalFees / state.transactions.length;
  }
}

// WebSocket connection
let ws = null;
let requestId = 0;

function connect() {
  state.error = null;

  ws = new WebSocket(`${API_URL}?apikey=${API_KEY}`, {
    headers: { 'apikey': API_KEY }
  });

  ws.on('open', () => {
    state.connected = true;
    state.error = null;
    // Acquire mempool
    ws.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'acquireMempool',
      id: ++requestId,
    }));
  });

  ws.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());

      // Handle acquireMempool response
      if (response.result && response.result.slot !== undefined) {
        state.mempoolSlot = response.result.slot;
        state.transactions = [];
        state.lastUpdate = Date.now();
        // Start fetching transactions
        ws.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'nextTransaction',
          params: { fields: 'all' },
          id: ++requestId,
        }));
        return;
      }

      // Handle nextTransaction response
      if (response.result !== undefined) {
        if (response.result && response.result.transaction) {
          const tx = response.result.transaction;
          state.transactions.push(tx);
          state.totalSeen++;
          state.lastUpdate = Date.now();
          updateStats();

          // Track this transaction for lifecycle monitoring
          if (tx.id && !state.trackedTxs.has(tx.id)) {
            const firstSeen = Date.now();
            state.trackedTxs.set(tx.id, {
              firstSeen,
              tx: tx,
            });

            // Log transaction entering mempool
            logEvent('tx_mempool_enter', {
              txId: tx.id,
              value: getTxValue(tx),
              fee: getTxFee(tx),
              inputs: tx.inputs?.length || 0,
              outputs: tx.outputs?.length || 0,
              hasTokens: hasTokens(tx),
              hasScripts: hasScripts(tx),
              hasMetadata: hasMetadata(tx),
            });

            // Limit tracked transactions to prevent memory issues
            if (state.trackedTxs.size > 10000) {
              // Remove oldest entries
              const entries = Array.from(state.trackedTxs.entries());
              entries.sort((a, b) => a[1].firstSeen - b[1].firstSeen);
              for (let i = 0; i < 1000; i++) {
                state.trackedTxs.delete(entries[i][0]);
              }
            }
          }

          // Get next transaction
          ws.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'nextTransaction',
            params: { fields: 'all' },
            id: ++requestId,
          }));
        } else {
          // Mempool exhausted, re-acquire after delay
          updateStats();
          setTimeout(() => {
            if (ws && ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({
                jsonrpc: '2.0',
                method: 'acquireMempool',
                id: ++requestId,
              }));
            }
          }, CONFIG.refresh);
        }
        return;
      }

      // Handle errors
      if (response.error) {
        state.error = response.error.message || 'Unknown error';
      }

    } catch (err) {
      state.error = `Parse error: ${err.message}`;
    }
  });

  ws.on('error', (err) => {
    state.error = err.message;
    state.connected = false;
  });

  ws.on('close', () => {
    state.connected = false;
    // Reconnect after delay
    setTimeout(connect, 3000);
  });
}

// Chain sync WebSocket connection for following blocks
let chainWs = null;
let chainRequestId = 1000; // Separate ID range from mempool
const PIPELINE_DEPTH = 5;  // Number of nextBlock requests to keep in flight
let pendingNextBlocks = 0;

function connectChainSync() {
  chainWs = new WebSocket(`${API_URL}?apikey=${API_KEY}`, {
    headers: { 'apikey': API_KEY }
  });

  chainWs.on('open', () => {
    state.chainSyncConnected = true;
    // First query the network tip to know where we are
    chainWs.send(JSON.stringify({
      jsonrpc: '2.0',
      method: 'queryNetwork/tip',
      id: 'get-tip',
    }));
  });

  chainWs.on('message', (data) => {
    try {
      const response = JSON.parse(data.toString());

      // Handle queryNetwork/tip response
      if (response.id === 'get-tip' && response.result) {
        const tip = response.result;
        state.chainTip = { slot: tip.slot, id: tip.id };
        // Now find intersection at the tip so we follow from here
        chainWs.send(JSON.stringify({
          jsonrpc: '2.0',
          method: 'findIntersection',
          params: { points: [{ slot: tip.slot, id: tip.id }] },
          id: ++chainRequestId,
        }));
        return;
      }

      // Handle findIntersection response
      if (response.result && response.result.intersection !== undefined) {
        // Intersection found, start requesting blocks
        // Start requesting blocks with pipelining
        for (let i = 0; i < PIPELINE_DEPTH; i++) {
          chainWs.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'nextBlock',
            id: ++chainRequestId,
          }));
          pendingNextBlocks++;
        }
        return;
      }

      // Handle nextBlock response - RollForward
      if (response.result && response.result.direction === 'forward') {
        pendingNextBlocks--;
        const block = response.result.block;

        // Handle different era formats (babbage, conway, etc.)
        const blockData = block.babbage || block.conway || block.alonzo || block.shelley || block;
        const slot = blockData.slot || block.slot;
        const blockId = blockData.id || block.id;
        const height = blockData.height || block.height;
        const transactions = blockData.transactions || block.transactions || [];

        // Update chain tip
        state.chainTip = { slot, id: blockId };

        // Calculate block value
        let blockValue = 0;
        transactions.forEach(tx => {
          blockValue += getTxValue(tx);
        });

        // Check for confirmed transactions from our tracked set
        const confirmedInBlock = [];
        transactions.forEach(tx => {
          const txId = tx.id;
          if (txId && state.trackedTxs.has(txId)) {
            const tracked = state.trackedTxs.get(txId);
            const timeInMempool = Date.now() - tracked.firstSeen;

            confirmedInBlock.push({
              txId,
              slot,
              blockId,
              height,
              timeInMempool,
              tx: tracked.tx,
              confirmedAt: Date.now(),
            });

            // Log transaction confirmed
            logEvent('tx_confirmed', {
              txId,
              slot,
              blockId,
              height,
              timeInMempoolMs: timeInMempool,
              value: getTxValue(tracked.tx),
              fee: getTxFee(tracked.tx),
            });

            state.trackedTxs.delete(txId);
            state.totalConfirmed++;
          }
        });

        // Add confirmed transactions to the list
        if (confirmedInBlock.length > 0) {
          state.confirmedTxs.unshift(...confirmedInBlock);
          // Limit confirmed list size
          if (state.confirmedTxs.length > 100) {
            state.confirmedTxs = state.confirmedTxs.slice(0, 100);
          }
        }

        // Log new block
        logEvent('block_received', {
          slot,
          blockId,
          height,
          txCount: transactions.length,
          totalValue: blockValue,
          confirmedFromMempool: confirmedInBlock.length,
        });

        // Add block to recent blocks list
        state.latestBlocks.unshift({
          slot,
          id: blockId,
          height,
          txCount: transactions.length,
          totalValue: blockValue,
          confirmedFromMempool: confirmedInBlock.length,
          receivedAt: Date.now(),
        });
        // Keep only recent blocks
        if (state.latestBlocks.length > 20) {
          state.latestBlocks = state.latestBlocks.slice(0, 20);
        }

        // Maintain pipeline depth
        if (pendingNextBlocks < PIPELINE_DEPTH) {
          chainWs.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'nextBlock',
            id: ++chainRequestId,
          }));
          pendingNextBlocks++;
        }
        return;
      }

      // Handle nextBlock response - RollBackward (chain reorg)
      if (response.result && response.result.direction === 'backward') {
        pendingNextBlocks--;
        const point = response.result.point;

        // Move confirmed txs back to tracked if they were in rolled-back blocks
        const rolledBackSlot = point.slot || 0;
        const rolledBackTxs = [];

        state.confirmedTxs = state.confirmedTxs.filter(confirmed => {
          if (confirmed.slot > rolledBackSlot) {
            // This tx was in a rolled-back block, put it back in tracking
            state.trackedTxs.set(confirmed.txId, {
              firstSeen: confirmed.confirmedAt - confirmed.timeInMempool,
              tx: confirmed.tx,
            });
            rolledBackTxs.push(confirmed.txId);
            return false;
          }
          return true;
        });

        // Log rollback event
        if (rolledBackTxs.length > 0 || state.latestBlocks.some(b => b.slot > rolledBackSlot)) {
          logEvent('chain_rollback', {
            rollbackToSlot: rolledBackSlot,
            rollbackToId: point.id,
            txsRolledBack: rolledBackTxs.length,
            txIds: rolledBackTxs,
          });
        }

        // Remove rolled-back blocks from latestBlocks
        state.latestBlocks = state.latestBlocks.filter(b => b.slot <= rolledBackSlot);

        // Continue following the chain
        if (pendingNextBlocks < PIPELINE_DEPTH) {
          chainWs.send(JSON.stringify({
            jsonrpc: '2.0',
            method: 'nextBlock',
            id: ++chainRequestId,
          }));
          pendingNextBlocks++;
        }
        return;
      }

      // Handle errors
      if (response.error) {
        // Chain sync errors are usually recoverable
        state.error = `Chain sync: ${response.error.message || 'Unknown error'}`;
      }

    } catch (err) {
      state.error = `Chain sync parse error: ${err.message}`;
    }
  });

  chainWs.on('error', (err) => {
    state.chainSyncConnected = false;
  });

  chainWs.on('close', () => {
    state.chainSyncConnected = false;
    pendingNextBlocks = 0;
    // Reconnect after delay
    setTimeout(connectChainSync, 5000);
  });
}

// Prune old tracked transactions (older than 10 minutes)
function pruneOldTrackedTxs() {
  const now = Date.now();
  const maxAge = 10 * 60 * 1000; // 10 minutes

  for (const [txId, data] of state.trackedTxs.entries()) {
    if (now - data.firstSeen > maxAge) {
      state.trackedTxs.delete(txId);
    }
  }
}

// Main
function main() {
  // Initialize logging
  initLog();

  // Hide cursor
  process.stdout.write(CURSOR_HIDE);

  // Handle exit
  process.on('SIGINT', () => {
    closeLog();
    process.stdout.write(CURSOR_SHOW);
    process.stdout.write(CLEAR_SCREEN + CURSOR_HOME);
    console.log('\nMempool monitor stopped.\n');
    console.log(`Session stats: ${state.totalSeen} transactions seen, ${state.totalConfirmed} confirmed`);
    if (CONFIG.logFile) {
      console.log(`Log written to: ${CONFIG.logFile}`);
    }
    process.exit(0);
  });

  process.on('exit', () => {
    process.stdout.write(CURSOR_SHOW);
  });

  // Start render loop
  setInterval(render, 250);

  // Periodic cleanup of old tracked transactions
  setInterval(pruneOldTrackedTxs, 60000);

  // Connect mempool monitor
  connect();

  // Connect chain sync (with small delay to let mempool connect first)
  setTimeout(connectChainSync, 1000);

  // Initial render
  render();
}

main();
