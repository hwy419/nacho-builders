# NACHO Explorer - Implementation Plan

## Overview

Build an innovative, user-friendly Cardano blockchain explorer at `explorer.nacho.builders` that transforms complex blockchain data into intuitive visualizations. The explorer will feature a **green color scheme** (complementing STAKE's blue and API's purple), dashboard-style analytics, visual transaction flows, and human-readable context throughout.

**Design Philosophy:** Make blockchain data accessible to everyone, not just developers.

---

## Brand Identity

| Product | Accent Color | Purpose |
|---------|--------------|---------|
| NACHO STAKE | Cyan (#00d4ff) | Pool delegation |
| NACHO API | Purple (#8b5cf6) | Developer platform |
| NACHO Explorer | **Lime (#84cc16)** | Blockchain exploration |

The lime green creates a vibrant triad with cyan and purple, maintaining energy while being distinct.

---

## Design Principles

### 1. No Walls of Hex Data
- **Truncated hashes** with copy buttons (e.g., `abc123...xyz789`)
- **Address identicons** - unique visual patterns for instant recognition
- **Visual hierarchy** - important info prominent, technical details secondary

### 2. Human-Readable Context
Every transaction shows what actually happened:
- "Sent 500 ADA to addr1..."
- "Delegated to NACHO pool"
- "Minted 3 NFTs (SpaceBudz)"
- "Executed Plutus contract (DEX swap)"

### 3. Visual Transaction Flows
Sankey-style diagrams showing:
- Inputs on the left (where ADA came from)
- Outputs on the right (where ADA went)
- Color-coded by type (ADA, tokens, change)
- Hover for details

### 4. Dashboard-Style Analytics
Charts and visualizations throughout:
- Block production timeline
- Transaction volume graphs
- Stake distribution charts
- Pool performance metrics
- Address activity heatmaps

### 5. Clear Navigation Flow
Breadcrumb trails and contextual links:
- Block → Transactions → Addresses → Related Transactions
- Always know where you are and how to go back

---

## Navigating the Web of Blockchain Data

Blockchain data is inherently a web of interconnected entities - but this web is invisible in most explorers. NACHO Explorer will illuminate these connections and help users navigate intuitively.

### The Problem with Traditional Explorers
- **Dead ends everywhere**: View a transaction, then what? No clear next steps
- **Lost context**: How did I get here? What's the bigger picture?
- **Hidden relationships**: Addresses, contracts, and tokens are all connected but you can't see how
- **No story**: Raw data without narrative - what actually happened?
- **One-way streets**: Hard to trace value backwards or forwards through time

### Our Navigation Philosophy
> **Every page should answer: "What can I explore next?"**

---

### 1. Contextual Relationship Panels

Every detail page includes a "Related" sidebar showing connected entities:

**On Transaction Page:**
```
┌─────────────────────────────┐
│ 🔗 Related                  │
├─────────────────────────────┤
│ Addresses Involved (3)      │
│ • addr1abc... (sender)      │
│ • addr1xyz... (recipient)   │
│ • addr1def... (change)      │
│                             │
│ Same Block (45 txs)         │
│ • View all transactions     │
│                             │
│ Contract Interactions       │
│ • SundaeSwap DEX            │
│ • Script: abc123...         │
│                             │
│ Tokens Moved (2)            │
│ • HOSKY (1,000,000)         │
│ • SUNDAE (500)              │
└─────────────────────────────┘
```

**On Address Page:**
```
┌─────────────────────────────┐
│ 🔗 Related                  │
├─────────────────────────────┤
│ Frequently Interacts With   │
│ • addr1xyz... (23 txs)      │
│ • addr1def... (15 txs)      │
│ • Minswap DEX (12 txs)      │
│                             │
│ Part of Same Wallet?        │
│ • 3 addresses share stake   │
│   key stake1abc...          │
│                             │
│ Delegated To                │
│ • NACHO Pool (since E445)   │
│                             │
│ Top Token Holdings          │
│ • 5M HOSKY, 1K SUNDAE...    │
└─────────────────────────────┘
```

---

### 2. Value Flow Tracing

**"Where did this ADA come from?"** and **"Where did it go?"**

Allow users to trace value through multiple hops:

```
Trace Backwards (Source of Funds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
                                          ┌─────────────┐
┌─────────────┐    ┌─────────────┐    ┌──│ THIS TX     │
│ Coinbase    │───▶│ Exchange    │───▶│  │ 500 ADA     │
│ (Binance)   │    │ Withdrawal  │    │  └─────────────┘
└─────────────┘    └─────────────┘    │
     Epoch 440         2 days ago     │
                                      │
┌─────────────┐    ┌─────────────┐    │
│ Staking     │───▶│ Rewards     │───▶┘
│ Rewards     │    │ Withdrawal  │
└─────────────┘    └─────────────┘
     Epoch 448         1 day ago

Trace Forward (Destination of Funds)
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
┌─────────────┐
│ THIS TX     │──┬──▶ addr1xyz... (450 ADA) ──▶ Still unspent
│ 500 ADA     │  │
└─────────────┘  └──▶ addr1abc... (49.8 ADA) ──▶ Spent in TX def456...
                        (change)                     ├──▶ NFT Purchase
                                                     └──▶ Remaining: 5 ADA
```

**Implementation:**
- "Trace Source" button on any input
- "Trace Destination" button on any output
- Configurable depth (1-5 hops)
- Visual tree/graph view
- Highlight known entities (exchanges, DEXes)

---

### 3. ADA Handle Integration

Integrate with ADA Handle ($handle) registry to show human-readable names:

**How It Works:**
- ADA Handles are NFTs under policy `f0ff48bbb7bbe9d59a40f1ce90e9e9d0ff5002ec48f232b49ca0fb9a`
- Each handle resolves to a Cardano address
- We query the registry to show handles wherever addresses appear

**Display Examples:**

On Address Page:
```
┌─────────────────────────────────────────────────────────────┐
│ ┌────┐                                                      │
│ │ ▣▣ │  $michael                                           │
│ │ ▣▣ │  addr1qxy...abc789                         [Copy]   │
│ └────┘  Balance: 12,456.78 ADA                             │
└─────────────────────────────────────────────────────────────┘
```

In Transaction Lists:
```
│ Hash        │ From          │ To            │ Amount    │
├─────────────┼───────────────┼───────────────┼───────────┤
│ abc123...   │ $michael      │ $alice        │ 500 ADA   │
│ def456...   │ addr1xyz...   │ $nacho_pool   │ 1000 ADA  │
```

**Search by Handle:**
```
Search: "$michael"

Found: Address for $michael
addr1qxy...abc789
Balance: 12,456.78 ADA • 5 tokens • Delegated to NACHO

[View Address]
```

**Handle Registry Features:**
- Reverse lookup: Show handle for any address that has one
- Multiple handles: Some addresses have multiple handles (show all)
- Handle metadata: Show handle rarity, minting date
- Handle history: Show if handle was transferred

**Implementation:**
```typescript
// Query handle for address
async function getHandleForAddress(address: string): Promise<string | null> {
  // Query UTxOs at address for handle policy
  // Decode asset name to get handle
}

// Resolve handle to address
async function resolveHandle(handle: string): Promise<string | null> {
  // Query handle registry API or on-chain data
}
```

---

### 3b. CNS Domain Integration (.ada)

Cardano Name Service provides .ada domains that resolve to addresses:

**How It Works:**
- CNS domains are NFTs that map names to addresses
- Example: `michael.ada` → `addr1qxy...abc789`
- Similar to ENS on Ethereum

**Display:**
```
┌─────────────────────────────────────────────────────────────┐
│ ┌────┐  michael.ada                                        │
│ │ ▣▣ │  $michael (ADA Handle)                              │
│ │ ▣▣ │  addr1qxy...abc789                         [Copy]   │
│ └────┘  Balance: 12,456.78 ADA                             │
└─────────────────────────────────────────────────────────────┘
```

**Priority Display Order:**
1. CNS domain (if exists) - `michael.ada`
2. ADA Handle (if exists) - `$michael`
3. Known entity label (if known) - `Binance Hot Wallet`
4. Truncated address - `addr1qxy...abc789`

---

### 3c. Pool Friendly Names

Always show pool ticker and name instead of raw pool IDs:

**Instead of:**
```
pool1pu5jlj4q9w9jlxeu370a3c9myx47md5j5m2str0naunn2q3lkdy
```

**Show:**
```
┌────────────────────────────────────────┐
│ [LOGO] NACHO                           │
│ Nacho Stake Pool                       │
│ pool1pu5jlj...q3lkdy          [Copy]   │
└────────────────────────────────────────┘
```

**Pool Display Components:**
| Element | Source | Display |
|---------|--------|---------|
| Logo | `pool_offline_data.json->extended->logo` | 32x32 image |
| Ticker | `pool_offline_data.ticker_name` | Bold, uppercase |
| Name | `pool_offline_data.json->name` | Full name |
| Pool ID | `pool_hash.view` | Truncated bech32, expandable |

**In Transaction Lists:**
```
│ Action              │ Pool              │ Amount      │
├─────────────────────┼───────────────────┼─────────────┤
│ Delegated           │ [🌮] NACHO        │ 5,000 ADA   │
│ Re-delegated        │ [🌸] BLOOM        │ 2,500 ADA   │
│ Pool retired        │ [❌] OLDPOOL      │ -           │
```

**Pool Search:**
- Search by ticker: `NACHO`
- Search by name: `Nacho Stake Pool`
- Search by pool ID: `pool1pu5j...`

---

### 3d. Token Friendly Names

Display tokens with human-readable names, tickers, and icons:

**Token Name Resolution:**

| Source | Priority | Example |
|--------|----------|---------|
| CIP-26 Token Registry | 1st | Official registered metadata |
| CIP-25 On-chain Metadata | 2nd | NFT/token metadata |
| CIP-68 Reference Token | 3rd | Modern token standard |
| Decoded Asset Name | 4th | Hex → ASCII if valid |
| Raw Asset Name | Last | Hex string |

**Instead of:**
```
Policy: 8f52f6a88acf6127bc4758a16b6047afc4da7887feae121ec217df8a
Asset: 484f534b59 (hex)
```

**Show:**
```
┌─────────────────────────────────────────────┐
│ [🐕] HOSKY                                  │
│ Hosky Token                                 │
│ Policy: 8f52f6a8...7df8a         [Copy]     │
│                                             │
│ Supply: 1,000,000,000,000                   │
│ Decimals: 0                                 │
│ Holders: 45,678                             │
└─────────────────────────────────────────────┘
```

**Token Display in Transactions:**
```
Tokens Transferred:
┌──────┬────────────────┬─────────────────┐
│ Icon │ Token          │ Amount          │
├──────┼────────────────┼─────────────────┤
│ 🐕   │ HOSKY          │ 1,000,000       │
│ 🍨   │ SUNDAE         │ 500             │
│ 🖼️   │ SpaceBud #1234 │ 1 (NFT)         │
│ ??   │ abc123... (unknown) │ 100        │
└──────┴────────────────┴─────────────────┘
```

**Token Registry Integration:**
```typescript
interface TokenMetadata {
  ticker: string        // "HOSKY"
  name: string          // "Hosky Token"
  description?: string  // "The people's coin"
  logo?: string         // IPFS or URL
  decimals: number      // 0-18
  url?: string          // Project website
}

// Resolution chain
async function resolveTokenName(policyId: string, assetName: string): Promise<TokenMetadata> {
  // 1. Check CIP-26 registry (cached)
  // 2. Check on-chain CIP-25 metadata
  // 3. Check CIP-68 reference token
  // 4. Try to decode hex as ASCII
  // 5. Return raw hex as fallback
}
```

**Token Icons:**
- Use logo from registry if available
- Generate identicon from policy ID if not
- Special icons for known categories:
  - 🖼️ NFTs (quantity = 1)
  - 🪙 Fungible tokens
  - ❓ Unknown/unverified tokens

---

### 3e. Unified Identity Display

Combine all identity systems into a consistent display:

**Address Card Component:**
```
┌─────────────────────────────────────────────────────────────┐
│ ┌────────┐                                                  │
│ │        │  michael.ada                        [CNS]        │
│ │ [IDEN- │  $michael                           [Handle]     │
│ │ TICON] │  addr1qxy...abc789                  [Copy]       │
│ │        │                                                  │
│ └────────┘  Delegated to NACHO • 12,456.78 ADA             │
│                                                             │
│  Tokens: 🐕 1M HOSKY • 🍨 500 SUNDAE • +3 more             │
└─────────────────────────────────────────────────────────────┘
```

**Hover/Tooltip Shows Full Details:**
```
┌─────────────────────────────────────────────┐
│ Identity                                    │
├─────────────────────────────────────────────┤
│ CNS:     michael.ada                        │
│ Handle:  $michael                           │
│ Address: addr1qxy4k7...abc789def            │
│                                             │
│ First seen: Jan 1, 2024                     │
│ Total TXs: 234                              │
│                                             │
│ [Copy Address] [View Full Page]             │
└─────────────────────────────────────────────┘
```

**Search Supports All Formats:**
```
Search examples:
• "michael.ada"     → Resolves CNS domain
• "$michael"        → Resolves ADA Handle
• "NACHO"           → Finds stake pool
• "HOSKY"           → Finds token
• "addr1qxy..."     → Direct address lookup
• "pool1abc..."     → Direct pool lookup
```

---

### 4. Known Entity Labeling

Automatically label known addresses and contracts:

| Category | Examples | How We Know |
|----------|----------|-------------|
| Exchanges | Binance, Coinbase, Kraken | Known deposit/withdrawal addresses |
| DEXes | Minswap, SundaeSwap, WingRiders | Script hashes |
| Lending | Liqwid, Lenfi | Script hashes |
| NFT Markets | JPG Store, CNFT.io | Script hashes |
| Stake Pools | NACHO, BLOOM, etc. | Pool registration |
| Project Treasuries | Known multi-sigs | Community maintained |
| Bridges | Milkomeda, Wanchain | Contract addresses |

**Display:**
```
┌─────────────────────────────────────────────┐
│ addr1qxy...abc789                           │
│ 🏦 Binance Hot Wallet                       │
│ Known exchange deposit address              │
└─────────────────────────────────────────────┘
```

**Data Source:**
- Curated list of known entities (open source, community-maintained)
- Script hash → Protocol mapping
- Pool metadata

---

### 4. Address Clustering

Group addresses that likely belong to the same wallet:

**Cluster Indicators:**
1. **Same stake key** - Addresses sharing a stake key are from same wallet
2. **Change address patterns** - Change outputs often return to same wallet
3. **Transaction timing** - Addresses frequently used together

**Display on Address Page:**
```
┌─────────────────────────────────────────────┐
│ 👛 Wallet Cluster                           │
├─────────────────────────────────────────────┤
│ This address appears to be part of a wallet │
│ with 5 other addresses (same stake key)     │
│                                             │
│ Combined Balance: 45,678.90 ADA             │
│ Total Tokens: 23 different assets           │
│                                             │
│ [View All Addresses in Wallet]              │
└─────────────────────────────────────────────┘
```

---

### 5. Transaction Story Mode

Transform raw transaction data into a narrative:

**Standard View:**
```
TX: abc123...
Inputs: 2
Outputs: 3
Fee: 0.18 ADA
Certificates: 1
```

**Story Mode:**
```
┌─────────────────────────────────────────────────────────────┐
│ 📖 What Happened                                            │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 1. addr1abc... sent 500 ADA to addr1xyz...                 │
│                                                             │
│ 2. Along with the ADA, 1,000,000 HOSKY tokens were         │
│    also transferred                                         │
│                                                             │
│ 3. The sender changed their stake delegation from          │
│    BLOOM pool to NACHO pool                                │
│                                                             │
│ 4. Transaction fee of 0.176789 ADA was paid                │
│                                                             │
│ 5. Change of 99.82 ADA returned to sender                  │
│                                                             │
│ ⏱️ Confirmed in 23 seconds (block #10,523,456)             │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

### 6. Interactive Relationship Graph

Visual network graph showing entity connections:

```
                    ┌─────────┐
                    │ Minswap │
                    │   DEX   │
                    └────┬────┘
                         │ 12 swaps
                         ▼
┌─────────┐         ┌─────────┐         ┌─────────┐
│ Binance │◀───────▶│  YOUR   │◀───────▶│ NACHO   │
│ (CEX)   │ 5 txs   │ ADDRESS │ delegated│ Pool    │
└─────────┘         └────┬────┘         └─────────┘
                         │ 8 txs
                         ▼
                    ┌─────────┐
                    │ Friend  │
                    │addr1xyz │
                    └─────────┘
```

**Features:**
- Zoom in/out on network
- Click nodes to navigate
- Filter by transaction type
- Time-based animation (show activity over time)
- Highlight paths between two addresses

---

### 7. Journey Breadcrumbs

Remember and display the user's exploration path:

```
Your Journey: Home ▶ Block #10.5M ▶ TX abc123 ▶ addr1xyz ▶ NACHO Pool
                                                              ↑ You are here

[← Back to addr1xyz]  [↺ Start New Journey]  [📌 Bookmark]
```

**Features:**
- Persistent across page navigations
- "Bookmark" interesting findings
- "Share journey" - create shareable link of exploration path
- Session history sidebar

---

### 8. "Explore More" Suggestions

Contextual suggestions based on what user is viewing:

**On a DEX swap transaction:**
```
┌─────────────────────────────────────────────┐
│ 🔍 Explore More                             │
├─────────────────────────────────────────────┤
│ • View all swaps in this pool today         │
│ • See HOSKY price history                   │
│ • Compare with other DEXes                  │
│ • This trader's other swaps (15)            │
│ • Similar transactions in last hour         │
└─────────────────────────────────────────────┘
```

**On a new wallet address:**
```
┌─────────────────────────────────────────────┐
│ 🔍 Explore More                             │
├─────────────────────────────────────────────┤
│ • Where did the initial funds come from?    │
│ • View the funding transaction              │
│ • Check if address is on any watchlists     │
│ • See similar new wallets this epoch        │
└─────────────────────────────────────────────┘
```

---

### 9. Quick Preview Hovers

Hover over any link to see a preview without navigating away:

```
Transaction abc123...
                    ┌──────────────────────────────┐
                    │ Quick Preview                │
                    ├──────────────────────────────┤
                    │ Sent 500 ADA                 │
                    │ Block: #10,523,456           │
                    │ Time: 2 hours ago            │
                    │ Fee: 0.18 ADA                │
                    │                              │
                    │ [Open] [Open in New Tab]     │
                    └──────────────────────────────┘
```

---

### 10. Address Activity Timeline

Chronological view of everything that happened at an address:

```
Timeline for addr1abc...
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Jan 28, 2025
├─ 14:32 ─ Received 500 ADA from addr1xyz...
├─ 14:35 ─ Swapped 100 ADA for 50,000 HOSKY on Minswap
└─ 15:00 ─ Delegated to NACHO pool

Jan 27, 2025
├─ 09:15 ─ Withdrew staking rewards (12.5 ADA)
└─ 10:30 ─ Sent 200 ADA to addr1def...

Jan 25, 2025
├─ 12:00 ─ Minted NFT "SpaceBud #1234"
└─ 12:01 ─ Listed NFT on JPG Store

[Load Earlier Activity...]
```

---

### 11. Search with Context

Search doesn't just find - it explains:

```
Search: "abc123"

┌─────────────────────────────────────────────────────────────┐
│ Found: Transaction abc123...def789                          │
├─────────────────────────────────────────────────────────────┤
│ This transaction sent 500 ADA from a Binance wallet to      │
│ a new address, which then delegated to NACHO pool.          │
│                                                             │
│ Quick Facts:                                                │
│ • Confirmed 2 hours ago in block #10,523,456                │
│ • Part of 3 transactions from same sender today             │
│ • Recipient address is new (first transaction)              │
│                                                             │
│ [View Transaction] [View Sender] [View Recipient]           │
└─────────────────────────────────────────────────────────────┘
```

---

### 12. Comparison Views

Compare entities side-by-side:

**Pool Comparison:**
```
┌──────────────────┬──────────────────┬──────────────────┐
│ NACHO            │ BLOOM            │ SUNDAE           │
├──────────────────┼──────────────────┼──────────────────┤
│ Stake: 2.5M ADA  │ Stake: 5.2M ADA  │ Stake: 8.1M ADA  │
│ Margin: 1.5%     │ Margin: 2.0%     │ Margin: 1.0%     │
│ ROA: 4.2%        │ ROA: 3.9%        │ ROA: 4.1%        │
│ Blocks: 156      │ Blocks: 312      │ Blocks: 489      │
│ Luck: 102%       │ Luck: 98%        │ Luck: 101%       │
│ Saturation: 35%  │ Saturation: 72%  │ Saturation: 95%  │
├──────────────────┼──────────────────┼──────────────────┤
│ ✅ Best margin   │                  │ ✅ Best ROA      │
│ ✅ Lowest satur. │                  │                  │
└──────────────────┴──────────────────┴──────────────────┘
```

**Address Comparison:**
- Compare two addresses: shared transactions, common counterparties
- Useful for investigating connections

---

### 13. "What's Happening Now" Discovery Feed

Live feed of interesting on-chain activity:

```
┌─────────────────────────────────────────────────────────────┐
│ 🔥 Happening Now                              [Customize]   │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│ 💰 Whale Alert                                   2 min ago  │
│    5,000,000 ADA moved from unknown to Binance              │
│    [View Transaction]                                       │
│                                                             │
│ 🎨 NFT Mint                                      5 min ago  │
│    New collection: "Cardano Punks" (1,000 items)            │
│    [View Collection]                                        │
│                                                             │
│ 📊 Large Delegation                             12 min ago  │
│    500,000 ADA delegated to NACHO pool                      │
│    [View Stake Address]                                     │
│                                                             │
│ 🔄 DEX Volume Spike                             15 min ago  │
│    Minswap HOSKY/ADA pool: 10x normal volume                │
│    [View Pool Activity]                                     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

**Customizable Filters:**
- Whale movements (>X ADA)
- NFT mints
- Large delegations
- Smart contract deployments
- Token mints/burns
- Specific address activity

---

### 14. Deep Links & Sharing

Make every view shareable and linkable:

**URL Structure:**
```
explorer.nacho.builders/mainnet/tx/abc123                    # Basic
explorer.nacho.builders/mainnet/tx/abc123?view=flow          # Flow diagram
explorer.nacho.builders/mainnet/tx/abc123?trace=source&depth=3  # Tracing
explorer.nacho.builders/mainnet/address/addr1...?tab=tokens  # Specific tab
explorer.nacho.builders/mainnet/compare?pools=NACHO,BLOOM    # Comparison
```

**Share Menu:**
```
┌─────────────────────────────────────────────┐
│ 📤 Share This View                          │
├─────────────────────────────────────────────┤
│ 🔗 Copy Link                                │
│ 🐦 Share on Twitter                         │
│ 📋 Copy as Markdown                         │
│ 📸 Download as Image                        │
│ 📄 Export as JSON                           │
└─────────────────────────────────────────────┘
```

---

### 15. Universal Search & Filtering

A single, powerful search experience across the entire explorer.

---

#### Global Search Autocomplete

One search field that searches everything:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Search transactions, addresses, blocks, pools, tokens...        │
└─────────────────────────────────────────────────────────────────────┘
                              │
                              ▼ (as you type)
┌─────────────────────────────────────────────────────────────────────┐
│ Results for "nacho"                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 🏊 Stake Pools                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ [🌮] NACHO - Nacho Stake Pool                                   ││
│ │     pool1pu5jlj...q3lkdy • 2.5M ₳ staked                       ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ 🪙 Tokens                                                           │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ NACHO Token • Policy: 8f52f6...                                 ││
│ │ NACHOS NFT Collection • Policy: a1b2c3...                       ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ 👤 DReps                                                            │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ $nacho_voter • 50.2M ₳ voting power                             ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ 🏷️ ADA Handles                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ $nacho • addr1qxy...abc789                                      ││
│ │ $nacho_staker • addr1def...xyz123                               ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Press Enter to see all results • Tab to navigate                   │
└─────────────────────────────────────────────────────────────────────┘
```

**Search Categories (searched simultaneously):**
| Category | Searchable Fields |
|----------|-------------------|
| Blocks | Block number, block hash |
| Transactions | TX hash, metadata content |
| Addresses | Full address, payment credential |
| Stake Addresses | stake1... addresses |
| Pools | Pool ID, ticker, name, description |
| Tokens | Policy ID, asset name, ticker, fingerprint |
| DReps | DRep ID, handle, name |
| Governance | Action ID, title, description |
| ADA Handles | Handle name ($handle) |
| CNS Domains | Domain name (.ada) |

**Smart Detection (instant routing):**
| Pattern | Detected Type | Action |
|---------|---------------|--------|
| 64 hex chars | Block or TX hash | Search both, show matches |
| `addr1...` | Mainnet address | Direct navigation |
| `addr_test1...` | Testnet address | Direct navigation |
| `stake1...` | Stake address | Direct navigation |
| `pool1...` | Pool ID | Direct navigation |
| `drep1...` | DRep ID | Direct navigation |
| `$...` | ADA Handle | Resolve and navigate |
| `...ada` | CNS Domain | Resolve and navigate |
| Numeric | Block number or epoch | Show options |
| `gov_action1...` | Governance action | Direct navigation |
| Text | Fuzzy search all | Show categorized results |

---

#### Advanced Filter System

Every list page has consistent, powerful filtering:

**Filter UI Component:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Filter                                              [Advanced ▼] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Search: [_______________________] [Contains ▼]                  ││
│ │                                                                 ││
│ │ Match type:  ○ Contains   ○ Begins with                        ││
│ │              ○ Ends with  ○ Exact match  ○ Wildcard            ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Quick Filters:                                                      │
│ [Type ▼] [Date Range ▼] [Value Range ▼] [Status ▼]                 │
│                                                                     │
│ Active Filters: [Contains: "nacho" ×] [Type: Transfer ×] [Clear All]│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Match Types:**
| Type | Syntax | Example | Matches |
|------|--------|---------|---------|
| Contains | `nacho` | Default | "**nacho**", "the**nacho**pool" |
| Begins with | `nacho*` | Prefix | "**nacho**_token", "**nacho**builders" |
| Ends with | `*nacho` | Suffix | "super**nacho**", "the_**nacho**" |
| Exact match | `"nacho"` | Quoted | Only "nacho" exactly |
| Wildcard | `na*ho` | Pattern | "nacho", "navaho", "nabuho" |
| Regex | `/na.+ho/` | Advanced | Full regex support |

**Filter Operators for Numeric/Date Fields:**
| Operator | Symbol | Example |
|----------|--------|---------|
| Equals | `=` | `= 1000` |
| Greater than | `>` | `> 1000 ADA` |
| Less than | `<` | `< 500 ADA` |
| Between | `..` | `100..500 ADA` |
| Not equal | `!=` | `!= 0` |

---

#### Page-Specific Filters

**Blocks List Filters:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Filters:                                                            │
│                                                                     │
│ Block Number: [________] to [________]                              │
│ Epoch:        [Epoch 607 ▼]                                         │
│ Pool:         [Search pools... ▼] (autocomplete)                    │
│ Date Range:   [Jan 1, 2025] to [Jan 28, 2025]                      │
│ TX Count:     [> 0 ▼] [________]                                    │
│ Block Size:   [Any ▼] [________] KB                                 │
│                                                                     │
│ [Apply Filters] [Reset]                                             │
└─────────────────────────────────────────────────────────────────────┘
```

**Transactions List Filters:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Filters:                                                            │
│                                                                     │
│ Search TX/Address: [________________] [Contains ▼]                  │
│                                                                     │
│ Type:    [×] Transfer  [×] Delegation  [ ] Mint  [ ] Contract      │
│          [ ] Withdrawal  [ ] Pool Reg  [ ] Governance              │
│                                                                     │
│ Value:   [________] to [________] ADA                               │
│ Fee:     [________] to [________] ADA                               │
│                                                                     │
│ Includes:  [ ] Metadata  [ ] Scripts  [ ] Tokens  [ ] Certificates │
│                                                                     │
│ Address (sender/receiver): [________________] [Contains ▼]          │
│ Token (policy/name):       [________________]                       │
│                                                                     │
│ Date Range: [________] to [________]                                │
│                                                                     │
│ [Apply] [Reset] [Save as Preset ▼]                                  │
└─────────────────────────────────────────────────────────────────────┘
```

**Pools List Filters:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Filters:                                                            │
│                                                                     │
│ Search: [________________] [Contains ▼]                             │
│         (searches ticker, name, pool ID, description)               │
│                                                                     │
│ Status:     [×] Active  [ ] Retiring  [ ] Retired                  │
│                                                                     │
│ Saturation: [0%]────────●────────[100%+]                           │
│             Currently: 20% - 80%                                    │
│                                                                     │
│ Stake:      [________] to [________] ADA                            │
│ Margin:     [________] to [________] %                              │
│ Pledge:     [________] to [________] ADA                            │
│                                                                     │
│ Performance:  [ ] Minted this epoch  [ ] ROA > 4%                  │
│               [ ] Pledge met                                        │
│                                                                     │
│ [Apply] [Reset]                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Tokens List Filters:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Filters:                                                            │
│                                                                     │
│ Search: [________________] [Contains ▼]                             │
│         (searches ticker, name, policy ID, fingerprint)             │
│                                                                     │
│ Type:       [×] Fungible  [×] NFT  [ ] Unknown                     │
│                                                                     │
│ Policy ID:  [________________] [Begins with ▼]                      │
│ Asset Name: [________________] [Contains ▼]                         │
│                                                                     │
│ Supply:     [________] to [________]                                │
│ Holders:    [________] to [________]                                │
│                                                                     │
│ Metadata:   [ ] Has image  [ ] Has description  [ ] Verified       │
│                                                                     │
│ [Apply] [Reset]                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**DReps List Filters:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Filters:                                                            │
│                                                                     │
│ Search: [________________] [Contains ▼]                             │
│         (searches DRep ID, handle, name)                            │
│                                                                     │
│ Status:       [×] Active  [ ] Inactive  [ ] Retired                │
│                                                                     │
│ Voting Power: [________] to [________] ADA                          │
│ Delegators:   [________] to [________]                              │
│ Participation: [________]% to [________]%                           │
│                                                                     │
│ Type:   [×] Individual  [×] Script-based  [ ] Predefined           │
│                                                                     │
│ [Apply] [Reset]                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Governance Actions Filters:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Filters:                                                            │
│                                                                     │
│ Search: [________________] [Contains ▼]                             │
│         (searches title, description, action ID)                    │
│                                                                     │
│ Status: [×] Live  [×] Passed  [ ] Enacted  [ ] Expired  [ ] Rejected│
│                                                                     │
│ Type:   [ ] Treasury  [ ] Parameters  [ ] Hard Fork                │
│         [ ] Committee  [ ] Constitution  [ ] No Confidence         │
│         [ ] Info                                                    │
│                                                                     │
│ Submitted:  Epoch [____] to [____]                                  │
│ Expires:    Epoch [____] to [____]                                  │
│                                                                     │
│ Voting Progress:                                                    │
│   DRep Yes: [________]% to [________]%                              │
│                                                                     │
│ [Apply] [Reset]                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Filter Presets & Saved Searches

Allow users to save common filter combinations:

```
┌─────────────────────────────────────────────────────────────────────┐
│ Saved Filters                                          [+ New]      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 📁 My Presets:                                                      │
│    • "Whale transactions" (> 100k ADA transfers)                   │
│    • "NACHO pool blocks" (pool = NACHO)                            │
│    • "NFT mints today" (type = mint, date = today)                 │
│                                                                     │
│ 📁 Popular Presets:                                                 │
│    • "Large delegations" (> 1M ADA)                                │
│    • "Smart contract interactions"                                  │
│    • "Governance votes today"                                       │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### URL-Based Filters (Shareable)

All filters encode to URL for sharing:

```
/explorer/mainnet/transactions?
  type=transfer,mint&
  value_min=1000&
  value_max=100000&
  address_contains=nacho&
  date_from=2025-01-01&
  sort=value_desc
```

This allows:
- Bookmarking filtered views
- Sharing specific searches
- Deep linking from external sites
- Browser back/forward navigation

---

#### Search Implementation

**Backend Search Architecture:**
```typescript
interface SearchQuery {
  query: string
  matchType: 'contains' | 'begins' | 'ends' | 'exact' | 'wildcard' | 'regex'
  categories?: SearchCategory[]  // Filter to specific types
  limit?: number
  offset?: number
}

interface SearchResult {
  category: SearchCategory
  id: string
  displayName: string       // Friendly name ($michael, NACHO, etc.)
  subtitle?: string         // Additional context
  relevanceScore: number
  highlights: string[]      // Matched portions for highlighting
}

// Parallel search across all categories
async function globalSearch(query: SearchQuery): Promise<SearchResult[]> {
  const searches = [
    searchBlocks(query),
    searchTransactions(query),
    searchAddresses(query),
    searchPools(query),
    searchTokens(query),
    searchDReps(query),
    searchGovernance(query),
    searchHandles(query),
  ]

  const results = await Promise.all(searches)
  return mergeAndRank(results)
}
```

**Database Indexes for Fast Search:**
```sql
-- Pool search (ticker, name, description)
CREATE INDEX idx_pool_search ON pool_offline_data
  USING gin(to_tsvector('english', ticker_name || ' ' || json->>'name' || ' ' || json->>'description'));

-- Token search
CREATE INDEX idx_token_search ON multi_asset
  USING gin(to_tsvector('english', encode(name, 'escape')));

-- Handle search (if stored locally)
CREATE INDEX idx_handle_name ON ada_handles(handle_name);

-- Governance action search
CREATE INDEX idx_gov_search ON gov_action_proposal
  USING gin(to_tsvector('english', title || ' ' || description));
```

**Autocomplete Debouncing:**
- 150ms debounce on keystroke
- Show loading indicator
- Cache recent searches
- Keyboard navigation (↑↓ to select, Enter to go, Esc to close)

---

#### Search Result Highlighting

Highlight matched portions in results:

```
Search: "nach"

Results:
┌─────────────────────────────────────────────────────────────────────┐
│ 🏊 [NACH]O - [Nach]o Stake Pool                                     │
│    pool1pu5...q3lkdy • 2.5M ₳                                      │
├─────────────────────────────────────────────────────────────────────┤
│ 🪙 [NACH]O Token                                                    │
│    Policy: 8f52f6... • 1B supply                                   │
├─────────────────────────────────────────────────────────────────────┤
│ 🏷️ $[nach]o_builder                                                 │
│    addr1qxy...abc789                                               │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 16. Mempool / Pending Transactions

Show transactions waiting to be included in a block:

**Mempool Dashboard:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ 📡 Mempool (Pending Transactions)                      [Live 🟢]   │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ Pending TXs  │ │ Total Size   │ │ Total Fees   │ │ Avg Wait   │ │
│  │     847      │ │   12.4 MB    │ │   156 ADA    │ │   ~45s     │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                     │
│  Mempool Size Over Time (1 hour)                                   │
│  [CHART: Line graph showing pending TX count fluctuation]          │
│                                                                     │
│  Pending Transactions                              [Auto-refresh ▼] │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Hash         │ Type      │ Size   │ Fee      │ Waiting     │   │
│  ├──────────────┼───────────┼────────┼──────────┼─────────────┤   │
│  │ abc123...    │ Transfer  │ 428 B  │ 0.18 ADA │ 12s ⏳      │   │
│  │ def456...    │ Contract  │ 15 KB  │ 1.2 ADA  │ 8s ⏳       │   │
│  │ ghi789...    │ Mint      │ 2.1 KB │ 0.45 ADA │ 3s ⏳       │   │
│  │ [NEW] jkl... │ Delegation│ 512 B  │ 0.20 ADA │ <1s 🆕      │   │
│  └──────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  ℹ️ Transactions typically confirm within 20-60 seconds            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Mempool Features:**
| Feature | Description |
|---------|-------------|
| Real-time updates | SSE/WebSocket for live TX arrivals |
| TX Preview | Click to see full TX details before confirmation |
| Fee analysis | Show fee distribution, suggest optimal fees |
| Size tracking | Monitor mempool congestion |
| Wait time estimates | Based on current block production |
| Confirmation alerts | Notify when your TX confirms |

**Track Your Transaction:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Track Transaction                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ TX Hash: [abc123...def789                              ] [Track]   │
│                                                                     │
│ Status: ⏳ Pending in mempool                                       │
│                                                                     │
│ Timeline:                                                           │
│ ──●────────────────────────────────────────────────────────────    │
│   │                                                                 │
│   Submitted (12s ago)     Expected confirmation: ~30s              │
│                                                                     │
│ [🔔 Notify me when confirmed]                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Implementation Note:**
Requires Ogmios mempool monitoring or direct node connection via local mempool query.

---

### 17. Developer Tools

Specialized tools for developers and power users:

---

#### Datum Inspector

Decode and analyze datum content from smart contract UTxOs:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Datum Inspector                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Enter Datum Hash or Inline Datum:                                  │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ a1b2c3d4e5f6...                                                 ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ [Inspect] [Load from TX] [Paste CBOR]                              │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Decoded Datum:                                                      │
│                                                                     │
│ Format: [JSON ▼]  [CBOR Diagnostic] [Raw Hex] [Plutus Data]        │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ {                                                               ││
│ │   "constructor": 0,                                             ││
│ │   "fields": [                                                   ││
│ │     {                                                           ││
│ │       "bytes": "a1b2c3..."     // ← Likely a PubKeyHash        ││
│ │     },                                                          ││
│ │     {                                                           ││
│ │       "int": 1706486400        // ← Unix timestamp (Jan 28)    ││
│ │     },                                                          ││
│ │     {                                                           ││
│ │       "list": [                                                 ││
│ │         { "int": 1000000 },    // ← 1 ADA in lovelace          ││
│ │         { "int": 5000000 }     // ← 5 ADA in lovelace          ││
│ │       ]                                                         ││
│ │     }                                                           ││
│ │   ]                                                             ││
│ │ }                                                               ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ 💡 Auto-detected annotations:                                       │
│    • Field 0: Likely wallet address (PubKeyHash)                   │
│    • Field 1: Deadline timestamp → Jan 28, 2025 12:00:00 UTC      │
│    • Field 2: Price tiers in lovelace                              │
│                                                                     │
│ Known Protocol Detection: [Minswap Order] [SundaeSwap] [Unknown]   │
│                                                                     │
│ Used in Transactions: 12 [View All →]                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Datum Inspector Features:**
| Feature | Description |
|---------|-------------|
| Multiple formats | JSON, CBOR diagnostic, raw hex, Plutus Data |
| Auto-annotation | Detect common patterns (timestamps, amounts, hashes) |
| Protocol detection | Identify known DEX/lending protocol datums |
| History | Show all TXs using this datum |
| Schema matching | Match against known datum schemas |
| Copy/Export | Copy decoded data in various formats |

---

#### Contract Decoder

Analyze Plutus smart contract interactions:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔧 Contract Decoder                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Transaction: abc123...xyz789                           [Load TX]   │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Script Executions (2):                                              │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ 1. SPEND Script                                                 ││
│ │    Script Hash: def456...                                       ││
│ │    Protocol: Minswap V2 DEX                      [Verified ✓]   ││
│ │                                                                 ││
│ │    ┌─────────────────────────────────────────────────────────┐ ││
│ │    │ Input UTxO:                                              │ ││
│ │    │   Address: addr1_minswap_pool...                         │ ││
│ │    │   Value: 50,000 ADA + 1M HOSKY                          │ ││
│ │    │                                                          │ ││
│ │    │ Datum (Order Details):                                   │ ││
│ │    │   Type: Swap Order                                       │ ││
│ │    │   Direction: ADA → HOSKY                                 │ ││
│ │    │   Min Receive: 45,000 HOSKY                             │ ││
│ │    │   Deadline: Jan 28, 2025 15:00 UTC                      │ ││
│ │    │                                                          │ ││
│ │    │ Redeemer (Action):                                       │ ││
│ │    │   Action: "Execute Swap"                                 │ ││
│ │    │   Slippage: 2%                                          │ ││
│ │    └─────────────────────────────────────────────────────────┘ ││
│ │                                                                 ││
│ │    Execution Cost:                                              ││
│ │    Memory: 450,000 units (45% of limit)                        ││
│ │    CPU: 180,000,000 steps (36% of limit)                       ││
│ │                                                                 ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ 2. MINT Script                                                  ││
│ │    Script Hash: ghi789...                                       ││
│ │    Protocol: Unknown                             [Submit Info]   ││
│ │    ...                                                          ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Execution Flow Visualization:                                       │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │  [Input 1]──┐                      ┌──[Output 1: User]          ││
│ │             │    ┌──────────┐      │  47,500 HOSKY              ││
│ │  [Input 2]──┼───▶│ SWAP     │──────┤                            ││
│ │             │    │ SCRIPT   │      ├──[Output 2: Pool]          ││
│ │  [Redeemer]─┘    └──────────┘      │  52,500 ADA + 952k HOSKY   ││
│ │                                    │                            ││
│ │                                    └──[Output 3: Fee]           ││
│ │                                       0.3% = 150 ADA            ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Contract Decoder Features:**
| Feature | Description |
|---------|-------------|
| Script identification | Detect known protocols (DEXes, lending, NFT markets) |
| Datum/Redeemer decoding | Human-readable interpretation |
| Execution visualization | Flow diagram of script execution |
| Cost analysis | Memory/CPU usage with budget comparison |
| Error explanation | If script failed, explain why |
| Similar TXs | Find transactions using same script |

---

#### Address Inspector

Deep analysis of any address:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔍 Address Inspector                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Address: addr1qxy...abc789                                         │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│ Address Breakdown:                                                  │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Type:           Base Address (Type 0)                           ││
│ │ Network:        Mainnet                                         ││
│ │ Era:            Shelley+                                        ││
│ │                                                                 ││
│ │ Payment Credential:                                             ││
│ │   Type:         PubKeyHash                                      ││
│ │   Hash:         a1b2c3d4e5f6...                                ││
│ │   Derived:      m/1852'/1815'/0'/0/0 (typical)                 ││
│ │                                                                 ││
│ │ Staking Credential:                                             ││
│ │   Type:         PubKeyHash                                      ││
│ │   Hash:         f6e5d4c3b2a1...                                ││
│ │   Stake Addr:   stake1uxyz...                   [View →]       ││
│ │                                                                 ││
│ │ Raw Bytes:      01 a1b2c3d4... (hex)                           ││
│ │ Bech32:         addr1qxy...abc789                              ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Address Classification:                                             │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ [×] Regular wallet address                                      ││
│ │ [ ] Script address (smart contract)                             ││
│ │ [ ] Enterprise address (no staking)                             ││
│ │ [ ] Pointer address                                             ││
│ │ [ ] Reward/stake address                                        ││
│ │ [ ] Byron-era address                                           ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Associated Identities:                                              │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ ADA Handle:     $michael                                        ││
│ │ CNS Domain:     michael.ada                                     ││
│ │ Known Entity:   None detected                                   ││
│ │ Wallet Cluster: 5 addresses share stake key                    ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Convert Address:                                                    │
│ [To Hex] [To Bech32] [Extract Stake Key] [Generate QR]             │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 18. Analytics & Rich Lists

Network-wide analytics and rankings:

---

#### Top Addresses (Rich List)

```
┌─────────────────────────────────────────────────────────────────────┐
│ 💰 Top Addresses by Balance                                         │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Filter: [All ▼] [Exclude Exchanges] [Exclude Scripts]              │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ #  │ Address           │ Balance       │ % Supply │ Change 24h ││
│ ├────┼───────────────────┼───────────────┼──────────┼────────────┤│
│ │ 1  │ 🏦 Binance Hot    │ 892.5M ADA    │ 2.48%    │ ↓ 12.5M    ││
│ │ 2  │ 🏦 Kraken Cold    │ 456.2M ADA    │ 1.27%    │ ↑ 5.2M     ││
│ │ 3  │ addr1whale...     │ 234.1M ADA    │ 0.65%    │ -          ││
│ │ 4  │ 📜 Script: Minswap│ 198.7M ADA    │ 0.55%    │ ↑ 8.1M     ││
│ │ 5  │ $crypto_whale     │ 156.3M ADA    │ 0.43%    │ ↓ 2.3M     ││
│ │ 6  │ 🏦 Coinbase       │ 145.8M ADA    │ 0.41%    │ ↑ 15.2M    ││
│ │ ... │                   │               │          │            ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Wealth Distribution:                                                │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Top 10:     12.5% of supply                                     ││
│ │ Top 100:    28.3% of supply                                     ││
│ │ Top 1000:   45.7% of supply                                     ││
│ │                                                                 ││
│ │ [PIE CHART: Distribution visualization]                         ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Top Staking Accounts

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🥩 Top Staking Accounts                                             │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ #  │ Stake Address     │ Staked       │ Pool      │ Rewards    ││
│ ├────┼───────────────────┼──────────────┼───────────┼────────────┤│
│ │ 1  │ stake1whale...    │ 125.5M ADA   │ NACHO     │ 2.3M ADA   ││
│ │ 2  │ $big_delegator    │ 98.2M ADA    │ BLOOM     │ 1.8M ADA   ││
│ │ 3  │ stake1xyz...      │ 87.1M ADA    │ IOG       │ 1.6M ADA   ││
│ │ ... │                   │              │           │            ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Analytics Dashboard

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📊 Network Analytics                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Time Range: [24h] [7d] [30d] [90d] [1y] [All]                      │
│                                                                     │
│ ┌────────────────────────────┐ ┌────────────────────────────┐      │
│ │ Transaction Volume         │ │ Active Addresses           │      │
│ │ [LINE CHART]               │ │ [LINE CHART]               │      │
│ │ Today: 85,432 TXs          │ │ Today: 45,678 unique       │      │
│ │ vs Yesterday: +12%         │ │ vs Yesterday: +5%          │      │
│ └────────────────────────────┘ └────────────────────────────┘      │
│                                                                     │
│ ┌────────────────────────────┐ ┌────────────────────────────┐      │
│ │ Total Value Transferred    │ │ Average Fee               │      │
│ │ [LINE CHART]               │ │ [LINE CHART]               │      │
│ │ Today: 2.4B ADA            │ │ Today: 0.18 ADA            │      │
│ │ vs Yesterday: -8%          │ │ vs Yesterday: +2%          │      │
│ └────────────────────────────┘ └────────────────────────────┘      │
│                                                                     │
│ ┌────────────────────────────┐ ┌────────────────────────────┐      │
│ │ Smart Contract TXs         │ │ NFT Mints                  │      │
│ │ [LINE CHART]               │ │ [LINE CHART]               │      │
│ │ Today: 12,456 (14.5%)      │ │ Today: 3,421 NFTs          │      │
│ └────────────────────────────┘ └────────────────────────────┘      │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Transaction Types Distribution                                  ││
│ │ [STACKED BAR CHART over time]                                   ││
│ │                                                                 ││
│ │ ████ Transfers  ████ Delegations  ████ Contract  ████ Mint     ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Staking Metrics                                                 ││
│ │                                                                 ││
│ │ Total Staked:     25.8B ADA (71.8% of supply)                  ││
│ │ Active Pools:     3,124                                         ││
│ │ Active Delegators: 1.2M stake keys                              ││
│ │ Average ROA:      4.2%                                          ││
│ │                                                                 ││
│ │ [CHART: Staking participation over time]                        ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ DeFi Metrics                                                    ││
│ │                                                                 ││
│ │ Total Value Locked:  $450M                                      ││
│ │ DEX Volume (24h):    $12.5M                                     ││
│ │ Top Protocol:        Minswap (45% of TVL)                       ││
│ │                                                                 ││
│ │ [CHART: TVL by protocol]                                        ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Whale Alerts

Track large movements:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🐋 Whale Alerts                                        [Configure] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Threshold: [1,000,000 ▼] ADA                                       │
│                                                                     │
│ Recent Large Transactions:                                          │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ 🐋 5,000,000 ADA                                    2 min ago   ││
│ │    Unknown → Binance                                            ││
│ │    Possible: Exchange deposit for selling                       ││
│ │    [View TX]                                                    ││
│ ├─────────────────────────────────────────────────────────────────┤│
│ │ 🐋 2,500,000 ADA                                   15 min ago   ││
│ │    Kraken → Unknown                                             ││
│ │    Possible: Withdrawal to cold storage                         ││
│ │    [View TX]                                                    ││
│ ├─────────────────────────────────────────────────────────────────┤│
│ │ 🐋 10,000,000 ADA                                  1 hour ago   ││
│ │    $whale_wallet → Minswap Pool                                 ││
│ │    Possible: Liquidity provision                                ││
│ │    [View TX]                                                    ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Exchange Flow (24h):                                                │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Inflow:   125.5M ADA  ████████████████░░░░░░ (bullish signal)  ││
│ │ Outflow:  156.2M ADA  ████████████████████░░ (more leaving)    ││
│ │ Net:      -30.7M ADA  (outflow > inflow = accumulation)        ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### 19. Transaction Execution Preview

Allow users to simulate transactions before submitting to see exactly what will happen:

**How It Works:**
- User pastes unsigned/signed transaction (CBOR hex)
- We use Ogmios `evaluateTx` to simulate execution
- Show detailed breakdown of what the TX will do
- No funds at risk - it's just a simulation

**Transaction Preview Tool:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔮 Transaction Preview                                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Paste transaction CBOR (hex):                                       │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ 84a500828258203b40265111d8bb3c3c608d95b3a0bf83461ace32d79336     ││
│ │ 579a1...                                                        ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ [Preview Transaction] [Load from File] [Paste from Clipboard]      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Preview Results - Success:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ✅ Transaction Valid                                                │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Summary:                                                            │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ 📤 You will SEND:                                               ││
│ │    • 500 ADA to $alice (addr1xyz...)                           ││
│ │    • 1,000,000 HOSKY to $alice                                 ││
│ │                                                                 ││
│ │ 📥 You will RECEIVE:                                            ││
│ │    • 49.82 ADA (change) to addr1abc...                         ││
│ │                                                                 ││
│ │ 💰 Fee: 0.176789 ADA                                            ││
│ │                                                                 ││
│ │ 🔄 Net Change to Your Wallet:                                   ││
│ │    • -500.18 ADA                                                ││
│ │    • -1,000,000 HOSKY                                          ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Inputs (UTxOs being spent):                                         │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ #  │ UTxO              │ Value                                  ││
│ ├────┼───────────────────┼────────────────────────────────────────┤│
│ │ 1  │ abc123...#0       │ 550 ADA + 1,000,000 HOSKY             ││
│ └────┴───────────────────┴────────────────────────────────────────┘│
│                                                                     │
│ Outputs (UTxOs being created):                                      │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ #  │ Address           │ Value                                  ││
│ ├────┼───────────────────┼────────────────────────────────────────┤│
│ │ 0  │ $alice (addr1xy..)│ 500 ADA + 1,000,000 HOSKY             ││
│ │ 1  │ addr1abc... (you) │ 49.82 ADA (change)                    ││
│ └────┴───────────────────┴────────────────────────────────────────┘│
│                                                                     │
│ [View Full Details ▼]                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Preview Results - Smart Contract Execution:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ✅ Transaction Valid - Smart Contract Execution                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ 🔮 What This Transaction Will Do:                                   │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │                                                                 ││
│ │ 1. SWAP on Minswap DEX                                         ││
│ │    ├─ You send: 100 ADA                                        ││
│ │    ├─ You receive: ~47,500 HOSKY (estimated)                   ││
│ │    ├─ Slippage: 2% max                                         ││
│ │    └─ DEX Fee: 0.3% (0.3 ADA)                                  ││
│ │                                                                 ││
│ │ 2. Network fee: 0.45 ADA                                       ││
│ │                                                                 ││
│ │ Net Result:                                                     ││
│ │    • -100.45 ADA                                               ││
│ │    • +47,500 HOSKY (approximately)                             ││
│ │                                                                 ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Script Execution:                                                   │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Script: Minswap V2 Swap                      [Verified ✓]       ││
│ │                                                                 ││
│ │ Execution Units:                                                ││
│ │ ├─ Memory:  450,000 / 14,000,000  (3.2%)     ████░░░░░░░░░░░  ││
│ │ └─ CPU:     180M / 10,000M        (1.8%)     ███░░░░░░░░░░░░  ││
│ │                                                                 ││
│ │ ✅ Well within limits                                           ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Preview Results - Failure:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ❌ Transaction Would FAIL                                           │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Error:                                                              │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ ⚠️ InsufficientFunds                                            ││
│ │                                                                 ││
│ │ The transaction tries to spend 500 ADA, but the input UTxOs    ││
│ │ only contain 450 ADA.                                          ││
│ │                                                                 ││
│ │ Required:  500.18 ADA (including fee)                          ││
│ │ Available: 450.00 ADA                                          ││
│ │ Shortfall: 50.18 ADA                                           ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ 💡 Suggestion: Add another UTxO with at least 50.18 ADA            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Script Failure Example:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ❌ Transaction Would FAIL - Script Error                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Error:                                                              │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ ⚠️ Script Validation Failed                                     ││
│ │                                                                 ││
│ │ Script: Minswap V2 Swap (def456...)                            ││
│ │ Purpose: Spend                                                  ││
│ │                                                                 ││
│ │ Failure Reason:                                                 ││
│ │ "Deadline exceeded - order expired"                             ││
│ │                                                                 ││
│ │ The swap order's deadline was Jan 27, 2025 12:00 UTC.          ││
│ │ Current time: Jan 28, 2025 14:30 UTC.                          ││
│ │ The order has expired and cannot be executed.                  ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ 💡 Suggestion: Cancel this order and create a new one              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Budget Exceeded Example:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ ❌ Transaction Would FAIL - Execution Budget Exceeded               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Error:                                                              │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ ⚠️ ExUnitsTooBigUTxO                                            ││
│ │                                                                 ││
│ │ The script execution exceeds the allowed budget:                ││
│ │                                                                 ││
│ │ Memory:                                                         ││
│ │ ├─ Required:  16,500,000 units                                 ││
│ │ ├─ Limit:     14,000,000 units                                 ││
│ │ └─ Exceeded by: 2,500,000 units (17.8%)                        ││
│ │                                                                 ││
│ │ [████████████████████░░░░] 117% - OVER LIMIT                   ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ 💡 Suggestion: Split into multiple transactions or optimize script │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

**Preview Features:**

| Feature | Description |
|---------|-------------|
| **Balance Changes** | Clear summary of what you'll send/receive |
| **Human-Readable** | "Swap 100 ADA for ~47,500 HOSKY" not raw data |
| **Script Execution** | Memory/CPU usage with visual budget bars |
| **Error Explanation** | Plain English explanation of failures |
| **Suggestions** | Actionable tips to fix issues |
| **Protocol Detection** | Identify DEX swaps, NFT purchases, etc. |
| **Fee Breakdown** | Network fee + protocol fees separated |
| **Risk Warnings** | Flag suspicious patterns or unusual TXs |

---

**Additional Preview Modes:**

**Compare Mode (Before/After):**
```
┌─────────────────────────────┬─────────────────────────────┐
│ BEFORE (Current State)      │ AFTER (If TX Succeeds)      │
├─────────────────────────────┼─────────────────────────────┤
│ Your Balance:               │ Your Balance:               │
│ • 550 ADA                   │ • 49.82 ADA                 │
│ • 1,000,000 HOSKY           │ • 0 HOSKY                   │
│                             │                             │
│ UTxOs: 1                    │ UTxOs: 1                    │
│                             │                             │
│ $alice Balance:             │ $alice Balance:             │
│ • 100 ADA                   │ • 600 ADA                   │
│ • 0 HOSKY                   │ • 1,000,000 HOSKY           │
└─────────────────────────────┴─────────────────────────────┘
```

**Batch Preview (Multiple TXs):**
```
Preview multiple transactions in sequence to see cumulative effect:

TX 1: Swap 100 ADA → HOSKY     ✅ Valid
TX 2: Send HOSKY to $alice     ✅ Valid (depends on TX 1)
TX 3: Delegate to NACHO        ✅ Valid

Final State After All TXs:
• Balance: 449.5 ADA
• Delegated to: NACHO
• HOSKY: 0 (sent to $alice)
```

---

**Implementation:**

```typescript
// Using Ogmios evaluateTx
async function previewTransaction(txCbor: string): Promise<PreviewResult> {
  const ogmios = await connectOgmios()

  try {
    // Evaluate without submitting
    const result = await ogmios.evaluateTx(txCbor)

    return {
      valid: true,
      executionUnits: result.executionUnits,
      fee: calculateFee(result),
      inputs: parseInputs(txCbor),
      outputs: parseOutputs(txCbor),
      scripts: parseScriptExecutions(result),
      summary: generateHumanSummary(result)
    }
  } catch (error) {
    return {
      valid: false,
      error: parseError(error),
      suggestion: generateSuggestion(error)
    }
  }
}
```

**API Endpoint:**
```
POST /api/explorer/preview-tx
Body: { txCbor: "84a500..." }

Response: {
  valid: true/false,
  summary: { ... },
  inputs: [ ... ],
  outputs: [ ... ],
  scripts: [ ... ],
  fee: "176789",
  error?: { ... },
  suggestion?: "..."
}
```

---

### 20. Additional Feature Ideas

---

#### Portfolio Tracker

Track multiple addresses as a unified portfolio:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📊 My Portfolio                                    [+ Add Address] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Total Value: 125,456.78 ADA (~$45,234 USD)        ↑ 5.2% (24h)   │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ [CHART: Portfolio value over time with ADA price overlay]   │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Addresses (3):                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Label         │ Address       │ Balance     │ % of Total    │   │
│  ├───────────────┼───────────────┼─────────────┼───────────────┤   │
│  │ 🏠 Main       │ $michael      │ 100,000 ADA │ 79.7%         │   │
│  │ 💼 Trading    │ addr1abc...   │ 20,456 ADA  │ 16.3%         │   │
│  │ 🎨 NFTs       │ addr1xyz...   │ 5,000 ADA   │ 4.0%          │   │
│  └───────────────┴───────────────┴─────────────┴───────────────┘   │
│                                                                     │
│  Token Holdings (Combined):                                         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🐕 HOSKY: 50,000,000 │ 🍨 SUNDAE: 10,000 │ 🖼️ NFTs: 23     │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Recent Activity (All Addresses):                                   │
│  • $michael received 500 ADA from $alice (2h ago)                  │
│  • addr1abc... swapped on Minswap (5h ago)                         │
│                                                                     │
│  [Export CSV] [Tax Report] [Share (read-only link)]                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Features:**
- Private labels for addresses (stored locally or with account)
- Combined balance across all addresses
- Aggregated transaction history
- Token holdings summary
- Performance tracking over time
- Export for tax purposes

---

#### Time Travel / Historical State

View any address or the chain at a specific point in history:

```
┌─────────────────────────────────────────────────────────────────────┐
│ ⏰ Time Travel                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ View state at: [Jan 1, 2024 ▼] or [Epoch 450 ▼] or [Block # ___]  │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Address: $michael                                               ││
│ │                                                                 ││
│ │ Balance on Jan 1, 2024:          Balance Today:                ││
│ │ • 50,000 ADA                      • 125,456 ADA                ││
│ │ • 10,000,000 HOSKY                • 50,000,000 HOSKY           ││
│ │                                                                 ││
│ │ Change: +75,456 ADA (+150.9%)                                  ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ [View TX History Since Then] [Compare Another Date]                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Staking Rewards Calculator

Estimate future staking rewards:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🧮 Staking Rewards Calculator                                       │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Amount to Stake: [10,000        ] ADA                              │
│ Pool:            [NACHO ▼] (1.5% margin, 340 ADA fixed)           │
│ Duration:        [1 Year ▼]                                        │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Estimated Annual Rewards:                                       ││
│ │                                                                 ││
│ │   💰 ~420 ADA (4.2% ROA)                                       ││
│ │                                                                 ││
│ │ Breakdown per Epoch (5 days):                                   ││
│ │   • Gross: ~5.75 ADA                                           ││
│ │   • Pool margin (1.5%): -0.09 ADA                              ││
│ │   • Net: ~5.66 ADA                                             ││
│ │                                                                 ││
│ │ After 1 Year:                                                   ││
│ │   • Total Staked: 10,000 ADA                                   ││
│ │   • Total Rewards: ~420 ADA                                    ││
│ │   • New Balance: ~10,420 ADA                                   ││
│ │                                                                 ││
│ │ ⚠️ Estimates based on current network parameters.              ││
│ │    Actual rewards may vary.                                    ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ [Compare Pools] [View NACHO Pool]                                  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Watchlist & Alerts

Monitor addresses, pools, or tokens with notifications:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 👁️ Watchlist                                           [+ Add New] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Watching (5):                                                       │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Type    │ Item            │ Alert Conditions     │ Status      ││
│ ├─────────┼─────────────────┼──────────────────────┼─────────────┤│
│ │ Address │ $whale_wallet   │ Any TX > 100k ADA    │ 🔔 Active   ││
│ │ Pool    │ NACHO           │ Block minted         │ 🔔 Active   ││
│ │ Token   │ HOSKY           │ Mint > 1B            │ 🔔 Active   ││
│ │ Address │ addr1exchange...│ Any activity         │ ⏸️ Paused   ││
│ │ Gov     │ Treasury actions│ New proposal         │ 🔔 Active   ││
│ └─────────┴─────────────────┴──────────────────────┴─────────────┘│
│                                                                     │
│ Recent Alerts:                                                      │
│ • 🔔 NACHO minted block #10,523,456 (2h ago)                       │
│ • 🔔 $whale_wallet sent 500,000 ADA to Binance (5h ago)            │
│                                                                     │
│ Notification Settings: [Email ✓] [Browser ✓] [Webhook]            │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Embeddable Widgets

Allow other sites to embed explorer components:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🧩 Embed Widgets                                                    │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Choose Widget:                                                      │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ [●] Address Balance    [ ] Transaction Status                   ││
│ │ [ ] Pool Stats         [ ] Token Info                          ││
│ │ [ ] Live Block Feed    [ ] Network Stats                       ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ Configure:                                                          │
│ Address: [$michael                    ]                            │
│ Theme:   [Dark ▼]  Size: [Medium ▼]                               │
│                                                                     │
│ Preview:                                                            │
│ ┌─────────────────────────────────────┐                            │
│ │ $michael          NACHO Explorer    │                            │
│ │ 125,456.78 ADA              ↑ 5.2% │                            │
│ │ Delegated to NACHO                  │                            │
│ └─────────────────────────────────────┘                            │
│                                                                     │
│ Embed Code:                                                         │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ <iframe src="https://explorer.nacho.builders/widget/address/    ││
│ │ addr1..." width="300" height="100"></iframe>                    ││
│ └─────────────────────────────────────────────────────────────────┘│
│ [Copy Code]                                                        │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### QR Code Generation

Generate QR codes for easy sharing:

```
┌─────────────────────────────────────────────────────────────────────┐
│ On any address/transaction page:                                    │
│                                                                     │
│ ┌─────────────┐                                                    │
│ │ ▄▄▄▄▄ ▄▄▄▄ │  $michael                                          │
│ │ █   █ █  █ │  addr1qxy...abc789                                 │
│ │ █▄▄▄█ █▄▄█ │                                                    │
│ │ ▄▄▄▄▄ ▄▄▄▄ │  [Download PNG] [Download SVG]                     │
│ │ █   █      │  [Copy Address] [Share Link]                       │
│ └─────────────┘                                                    │
│                                                                     │
│ QR contains: [Address only ▼]                                      │
│ Options: Address only | With amount | Explorer link                │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Export & Tax Reports

Export transaction history for accounting:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📄 Export Data                                                      │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Address: [$michael              ▼]                                 │
│ Date Range: [Jan 1, 2024] to [Dec 31, 2024]                        │
│                                                                     │
│ Include:                                                            │
│ [✓] Transactions    [✓] Staking Rewards    [ ] Token Transfers    │
│ [✓] Fee Paid        [ ] USD Values         [✓] Timestamps         │
│                                                                     │
│ Format: [CSV ▼]  (also: JSON, PDF)                                 │
│                                                                     │
│ Tax Format Presets:                                                 │
│ [ ] Koinly          [ ] CoinTracker       [ ] TurboTax            │
│ [ ] CoinLedger      [ ] Generic                                    │
│                                                                     │
│ [Generate Export]                                                   │
│                                                                     │
│ Preview (first 5 rows):                                            │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Date       │ Type     │ Amount   │ Fee    │ TX Hash            ││
│ ├────────────┼──────────┼──────────┼────────┼────────────────────┤│
│ │ 2024-01-05 │ Received │ +500 ADA │ -      │ abc123...          ││
│ │ 2024-01-10 │ Sent     │ -100 ADA │ 0.18   │ def456...          ││
│ │ 2024-01-15 │ Reward   │ +5.6 ADA │ -      │ (epoch 460)        ││
│ └────────────┴──────────┴──────────┴────────┴────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Protocol Directory

Curated directory of Cardano protocols and dApps:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 📚 Protocol Directory                                               │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Categories: [All] [DEX] [Lending] [NFT] [Staking] [Governance]     │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ 🔄 Minswap                                         [Verified ✓] ││
│ │    Category: DEX                                                ││
│ │    TVL: $125M │ 24h Volume: $2.5M │ Users: 45,678              ││
│ │    Script: def456... [View Transactions]                        ││
│ │    Website: minswap.org                                         ││
│ ├─────────────────────────────────────────────────────────────────┤│
│ │ 🏦 Liqwid                                          [Verified ✓] ││
│ │    Category: Lending                                            ││
│ │    TVL: $45M │ Active Loans: 1,234                             ││
│ │    Script: ghi789... [View Transactions]                        ││
│ ├─────────────────────────────────────────────────────────────────┤│
│ │ 🖼️ JPG Store                                       [Verified ✓] ││
│ │    Category: NFT Marketplace                                    ││
│ │    24h Volume: 50,000 ADA │ Listed: 125,678 NFTs               ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ [Submit New Protocol]                                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### Price Integration

Show USD values alongside ADA:

```
Transaction Value:   500 ADA (~$180.50 USD)
                     ├─ Using price at TX time: $0.361/ADA
                     └─ Current value: $185.00 USD (+2.5%)

Address Balance:     125,456.78 ADA
                     └─ ~$45,234.50 USD (@ $0.36/ADA)

Pool Rewards (Epoch 607):
                     12.5 ADA (~$4.51 USD at epoch end)
```

**Price Sources:**
- CoinGecko API
- Historical prices for past transactions
- Optional toggle (some users prefer ADA-only)

---

#### Network Health Dashboard

Real-time network monitoring:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🏥 Network Health                                       [All Good] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ Block Time   │ │ TX Throughput│ │ Mempool      │ │ Sync Status│ │
│  │ 20.1s (avg)  │ │ 4.2 TPS      │ │ 234 pending  │ │ 100% ✓     │ │
│  │ ✅ Normal    │ │ ✅ Normal    │ │ ✅ Normal    │ │ ✅ Synced  │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                     │
│  Block Production (Last Hour):                                      │
│  [████████████████████████████████████████████████] 180/180 slots  │
│  100% - All slots filled ✅                                        │
│                                                                     │
│  Recent Issues:                                                     │
│  • None in the last 24 hours                                       │
│                                                                     │
│  Historical Uptime: 99.97% (30 days)                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

#### NACHO API Integration

The explorer integrates with the existing **NACHO API** at `app.nacho.builders`:

```
┌─────────────────────────────────────────────────────────────────────┐
│ 🔌 Need API Access?                                                 │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ All the data you see in NACHO Explorer is available                │
│ programmatically through the NACHO API.                            │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ ✓ Query blocks, transactions, addresses                         ││
│ │ ✓ Real-time WebSocket updates                                   ││
│ │ ✓ GraphQL for flexible queries                                  ││
│ │ ✓ Transaction submission & evaluation                           ││
│ │ ✓ Pay with ADA - no credit card needed                         ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ [Get Started at app.nacho.builders →]                              │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Cross-Promotion:**
- Explorer pages link to API docs for programmatic access
- "Get this data via API" buttons on key pages
- API documentation references explorer for visual examples
- Shared authentication (users logged into API can save explorer preferences)

---

### 21. Contextual Education

Help users learn as they explore:

**First Visit Hints:**
```
┌─────────────────────────────────────────────────────────────┐
│ 💡 Did you know?                                     [×]    │
├─────────────────────────────────────────────────────────────┤
│ Each transaction on Cardano uses the UTxO model.            │
│ Think of UTxOs like physical bills - you can't split them,  │
│ so you receive "change" back to yourself.                   │
│                                                             │
│ That's why you often see transactions with outputs going    │
│ back to the sender!                                         │
│                                                             │
│ [Learn More] [Don't Show Again]                             │
└─────────────────────────────────────────────────────────────┘
```

**Glossary Panel (Always Accessible):**
```
📚 Glossary
├── UTxO: Unspent Transaction Output - spendable funds
├── Epoch: 5-day period for staking rewards
├── Slot: ~1 second block production window
├── Datum: Data attached to smart contract UTxOs
├── Redeemer: Data provided to unlock script UTxOs
└── [View Full Glossary...]
```

---

### Navigation Feature Summary

| Feature | Purpose | User Benefit |
|---------|---------|--------------|
| Relationship Panels | Show connected entities | Never hit a dead end |
| Value Flow Tracing | Follow money through hops | Understand fund origins/destinations |
| **ADA Handles** | Human-readable addresses | `$michael` instead of `addr1xyz...` |
| **CNS Domains** | .ada domain resolution | `michael.ada` instead of hex |
| **Pool Names** | Ticker + name display | `NACHO` instead of `pool1abc...` |
| **Token Names** | Ticker + icon + metadata | `🐕 HOSKY` instead of hex policy |
| Known Entity Labels | Identify exchanges, DEXes | Instant context |
| Address Clustering | Group wallet addresses | See full wallet picture |
| Transaction Stories | Narrative explanation | Understand what happened |
| Relationship Graph | Visual network view | See the web of connections |
| Journey Breadcrumbs | Track exploration path | Never get lost |
| Explore More | Contextual suggestions | Discover related data |
| Quick Previews | Hover to preview | Explore without navigating |
| Activity Timeline | Chronological history | See full address story |
| **Universal Search** | One field searches everything | Find anything instantly |
| **Advanced Filters** | Contains/begins/ends/wildcard | Precise result control |
| **Filter Presets** | Save common searches | Quick access to frequent queries |
| Comparison Views | Side-by-side analysis | Make informed decisions |
| Discovery Feed | Live interesting activity | Find what's happening now |
| Deep Links | Shareable URLs | Share specific views |
| Education | Contextual learning | Learn while exploring |

---

## Expert Agent Team

The implementation will be carried out by specialized expert agents, each focusing on their domain:

### 1. UI/UX Designer Agent
**Focus:** Visual design, user experience, information architecture

**Responsibilities:**
- Design the green color system and component theming
- Create wireframes and mockups for all pages
- Design the transaction flow diagram visual language
- Define the identicon generation algorithm/style
- Establish typography and spacing guidelines
- Design responsive layouts (mobile, tablet, desktop)
- Create loading states, empty states, and error states
- Design micro-interactions and animations

**Deliverables:**
- Component design specifications
- Color palette and design tokens
- Page layout templates
- Animation/transition guidelines

---

### 2. Frontend Developer Agent
**Focus:** React components, Next.js pages, client-side logic

**Responsibilities:**
- Implement React components following design specs
- Build Next.js pages with proper routing
- Integrate charting libraries (recharts, React Flow)
- Implement SSE connections for live data
- Build the global search with pattern detection
- Create responsive layouts with Tailwind CSS
- Implement client-side state management
- Handle loading, error, and empty states
- Ensure accessibility (ARIA, keyboard navigation)

**Deliverables:**
- All React components in `/components/explorer/`
- All pages in `/app/explorer/`
- Client-side utilities in `/lib/explorer/`

---

### 3. Backend Developer Agent
**Focus:** API routes, database queries, caching, performance

**Responsibilities:**
- Design and implement DB-Sync query functions
- Create API routes with proper error handling
- Implement Redis caching layer with TTL strategies
- Build the SSE endpoint for live block streaming
- Optimize queries for performance (<200ms target)
- Implement rate limiting for public endpoints
- Handle network switching (mainnet/preprod)
- Set up connection pooling for both databases

**Deliverables:**
- API routes in `/app/api/explorer/`
- Query functions in `/lib/explorer/queries.ts`
- Caching utilities in `/lib/explorer/cache.ts`
- Database connection management

---

### 4. Cardano Expert Agent
**Focus:** Blockchain accuracy, data interpretation, domain knowledge

**Responsibilities:**
- Validate all blockchain data displays for accuracy
- Define transaction type detection logic
- Ensure correct ADA/lovelace conversions
- Verify epoch/slot/block calculations
- Review stake pool metrics and calculations
- Validate token/NFT metadata parsing (CIP-25, CIP-68)
- Ensure Plutus script data is correctly interpreted
- Write human-readable transaction summaries
- Create glossary content for smart tooltips
- Review all Cardano-specific terminology

**Deliverables:**
- Transaction type parser logic
- Human-readable summary templates
- Tooltip/glossary content
- Data validation rules
- Cardano-specific utility functions

---

### Agent Collaboration Flow

```
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 1: DESIGN                          │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │  UI/UX       │ ←──→ │  Cardano     │                    │
│  │  Designer    │      │  Expert      │                    │
│  └──────────────┘      └──────────────┘                    │
│         │                     │                             │
│         ▼                     ▼                             │
│  Design specs          Data requirements                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 2: BUILD                           │
│  ┌──────────────┐      ┌──────────────┐                    │
│  │  Frontend    │ ←──→ │  Backend     │                    │
│  │  Developer   │      │  Developer   │                    │
│  └──────────────┘      └──────────────┘                    │
│         │                     │                             │
│         ▼                     ▼                             │
│  Components + Pages    APIs + Queries                       │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    PHASE 3: VALIDATE                        │
│  ┌──────────────┐                                          │
│  │  Cardano     │ ──→ Review all data displays             │
│  │  Expert      │ ──→ Verify calculations                  │
│  └──────────────┘ ──→ Test edge cases                      │
└─────────────────────────────────────────────────────────────┘
```

---

## Governance (Voltaire Era - CIP-1694)

NACHO Explorer will provide full-featured governance support, allowing users to explore proposals, track voting, and understand the democratic process on Cardano.

### Governance Overview

**Three Voting Bodies:**
| Body | Description | Voting Power |
|------|-------------|--------------|
| **DReps** | Delegated Representatives | Vote weighted by delegated stake |
| **SPOs** | Stake Pool Operators | Vote weighted by pool stake (some actions only) |
| **CC** | Constitutional Committee | Threshold-based approval (e.g., 66.67%) |

**Governance Action Types:**
| Type | Description | Who Votes |
|------|-------------|-----------|
| Motion of No Confidence | Remove confidence in CC | DReps, SPOs |
| New Constitutional Committee | Elect/remove CC members | DReps, SPOs |
| Update Constitution | Change the constitution | DReps, CC |
| Hard Fork Initiation | Initiate protocol upgrade | DReps, SPOs, CC |
| Protocol Parameter Changes | Adjust chain parameters | DReps, CC (some SPOs) |
| Treasury Withdrawals | Spend from treasury | DReps, CC |
| Info Actions | Non-binding polls | DReps, SPOs |

---

### Governance Dashboard Page

**Route:** `/explorer/[network]/governance`

**Layout:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ 🏛️ Cardano Governance                           [Mainnet ▼]        │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ Active       │ │ DReps        │ │ SPOs         │ │ CC Members │ │
│  │ Proposals    │ │ Registered   │ │ Voting       │ │            │ │
│  │     12       │ │    1,234     │ │    2,800     │ │    7/8     │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Voting Power Distribution                                    │   │
│  │ [PIE CHART: DRep delegations, Auto-Abstain, Not delegated]  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Active Proposals                              [View All →]         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Treasury Withdrawal    Cardano DeFi Budget    ⏰ 12 days     │   │
│  │ [LIVE]                 1.28b Yes / 4.65b No    │░░░░░│ 21%  │   │
│  ├─────────────────────────────────────────────────────────────┤   │
│  │ Protocol Parameters    Increase block size     ⏰ 5 days      │   │
│  │ [LIVE]                 8.2b Yes / 1.1b No      │████░│ 88%  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Recent Votes                                  [View All →]         │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ 🗳️ $michael (DRep) voted YES on "DeFi Budget"   2 min ago   │   │
│  │ 🗳️ NACHO Pool voted ABSTAIN on "Block Size"     15 min ago  │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Key Metrics Cards:**
| Metric | Source | Display |
|--------|--------|---------|
| Active Proposals | COUNT gov_action WHERE status = 'active' | Number |
| Registered DReps | COUNT drep_registration | Number + trend |
| Voting SPOs | COUNT pools with votes | Number |
| CC Members | Active CC members | X/Y format |
| Total Delegated Stake | SUM drep delegations | Formatted ADA |
| Treasury Balance | ada_pots.treasury | Formatted ADA |

---

### Governance Action Detail Page

**Route:** `/explorer/[network]/governance/[action_id]`

Inspired by the screenshot but with NACHO Explorer's unique style:

**Header Section:**
```
┌─────────────────────────────────────────────────────────────────────┐
│                                                                     │
│  🏛️ Governance Action                                              │
│                                                                     │
│  ┌─────────────────┐  ┌────────┐                                   │
│  │ Treasury        │  │ 🟢 Live │                                   │
│  │ Withdrawal      │  └────────┘                                   │
│  └─────────────────┘                                               │
│                                                                     │
│  gov_action1fvgw27...xtz8r7                              [Copy]    │
│                                                                     │
│  Cardano DeFi Liquidity Budget - Withdrawal 1                      │
│  ─────────────────────────────────────────────                     │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Status Badge Colors:**
| Status | Color | Description |
|--------|-------|-------------|
| Live | Lime/Green | Currently accepting votes |
| Passed | Blue | Ratified, awaiting enactment |
| Enacted | Purple | Successfully executed |
| Expired | Gray | Voting deadline passed without ratification |
| Rejected | Red | Did not meet thresholds |

**Key Details Grid:**
| Field | Source | Display |
|-------|--------|---------|
| Title | Metadata | Human-readable title |
| Type | `gov_action.type` | Badge (Treasury Withdrawal, Parameter Change, etc.) |
| Submitted | `gov_action.submitted_epoch` | Date + Epoch link |
| Expires | `gov_action.expiration` | Date + Epoch link + countdown |
| Deposit | `gov_action.deposit` | Formatted ADA |
| Return Address | `gov_action.return_address` | Linked stake address |
| Submission TX | `gov_action.tx_id` | Linked transaction |

**For Treasury Withdrawals - Additional Fields:**
| Field | Source | Display |
|-------|--------|---------|
| Requested Amount | From action | Formatted ADA |
| Recipient | Stake address | Linked with identity |

**For Parameter Changes - Additional Fields:**
| Field | Display |
|-------|---------|
| Parameters Changed | Table showing current → proposed values |
| Impact Analysis | Human-readable explanation of changes |

---

### Voting Progress Panels

Three distinct panels for each voting body:

**DRep Votes Panel:**
```
┌─────────────────────────────────────────────────────────────────┐
│ DRep Votes                    Total: 80 votes │ 14.24b ₳ stake │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│ [████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░] 21.63%    │
│  ← Yes                                              No →        │
│                                                                 │
│ ┌─────────────────┬──────────────┬──────────┬───────┐          │
│ │ Vote            │ Stake        │ % Total  │ Count │          │
│ ├─────────────────┼──────────────┼──────────┼───────┤          │
│ │ ✅ Yes          │ 1.28b ₳      │ 21.63%   │ 58    │          │
│ │ ❌ No           │ 264.55m ₳    │ 4.46%    │ 16    │          │
│ │ ⚪ Abstain      │ 8.30b ₳      │ 14.01%   │ 6     │          │
│ │ 🔘 Not Voted    │ 4.19b ₳      │ 70.63%   │ -     │          │
│ │ 🚫 Auto No-Conf │ 194.49m ₳    │ 3.28%    │ -     │          │
│ └─────────────────┴──────────────┴──────────┴───────┘          │
│                                                                 │
│ Required Threshold: 67% of voted stake     Status: ❌ Not met  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**SPO Votes Panel:**
```
┌─────────────────────────────────────────────────────────────────┐
│ SPO Votes                      Total: 0 votes │ 21.57b ₳ stake │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ℹ️ SPOs cannot vote on Treasury Withdrawal actions            │
│                                                                 │
│  OR (if SPOs can vote):                                        │
│                                                                 │
│ [████████████████████████████████████░░░░░░░░░░░░░░] 72%       │
│                                                                 │
│ Required Threshold: 51%                        Status: ✅ Met  │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

**Constitutional Committee Panel:**
```
┌─────────────────────────────────────────────────────────────────┐
│ Constitutional Committee                 Required Threshold: ⅔  │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌───────┐  ┌───────┐  ┌───────┐  ┌───────┐                   │
│  │  Yes  │  │  No   │  │Abstain│  │ Voted │                   │
│  │  0/8  │  │  1/8  │  │  0/8  │  │  1/8  │                   │
│  └───────┘  └───────┘  └───────┘  └───────┘                   │
│                                                                 │
│  CC Members:                                                    │
│  ┌────────────────────────────────────────────────────────────┐│
│  │ [●] Cardano Atlantic Council         ⚪ Not voted          ││
│  │ [●] Eastern Cardano Council          ⚪ Not voted          ││
│  │ [●] cc_cold1zgf5...as9w              ⚪ Not voted          ││
│  │ [●] cc_cold1ztwq...t0rz              ❌ Voted No           ││
│  │ [●] cc_cold1zvt0...mn9               ⚪ Not voted          ││
│  │                                      [View All 8 →]        ││
│  └────────────────────────────────────────────────────────────┘│
│                                                                 │
│ Status: ❌ Not met (need 6 Yes votes)                          │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

### Voting Timeline Visualization

Show voting progress over time:

```
Voting Timeline
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

         Submitted        Now                              Expires
            │              │                                  │
Epoch 607 ──┼──────────────┼──────────────────────────────────┼── Epoch 613
            │              │                                  │
            ▼              ▼                                  ▼
[░░░░░░░░░░░████████████████░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░]
                     ↑
              34% through voting period
              12 days remaining

Vote Activity:
│ ●●●●●●●●●●●●●●●●●●●●●●●●●●○○○○○○○○○○○○○○○○○○○○○○○○○○○○○○○○○ │
  Day 1    Day 5    Day 10   Day 15   Day 20   Day 25   Day 30

Major votes:
• Day 1: 15 DReps voted Yes (early supporters)
• Day 3: 2 large DReps voted No (5b stake)
• Day 8: CC member voted No
```

---

### Individual Vote Records

**Tabs: Action | Votes | Metadata**

**Votes Tab:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ All Votes (81)                    [DReps ▼] [All Votes ▼] [Search] │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Voter               │ Type  │ Vote    │ Stake      │ Time      ││
│ ├─────────────────────┼───────┼─────────┼────────────┼───────────┤│
│ │ $michael            │ DRep  │ ✅ Yes  │ 50.2m ₳    │ 2 days    ││
│ │ $cardano_whale      │ DRep  │ ❌ No   │ 2.1b ₳     │ 5 days    ││
│ │ NACHO Pool          │ SPO   │ ⚪ Abst │ 2.5m ₳     │ 1 day     ││
│ │ drep1abc...xyz      │ DRep  │ ✅ Yes  │ 125.5m ₳   │ 12 days   ││
│ │ Cardano Atlantic CC │ CC    │ ❌ No   │ -          │ 3 days    ││
│ └─────────────────────┴───────┴─────────┴────────────┴───────────┘│
│                                                                     │
│ [Load More...]                                                      │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

**Metadata Tab:**
- Full proposal metadata (rationale, links, etc.)
- IPFS links to supporting documents
- Constitution references (if applicable)
- JSON view of raw action data

---

### DRep Detail Page

**Route:** `/explorer/[network]/drep/[drep_id]`

```
┌─────────────────────────────────────────────────────────────────────┐
│ ┌────────┐                                                         │
│ │        │  $michael                               [DRep]          │
│ │[IDENTI]│  drep1abc...xyz789                      [Copy]          │
│ │ [CON]  │                                                         │
│ └────────┘  Registered since Epoch 590                             │
│                                                                     │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐ ┌────────────┐ │
│  │ Voting Power │ │ Delegators   │ │ Votes Cast   │ │ Partic.    │ │
│  │ 125.5m ₳     │ │     234      │ │     45       │ │    92%     │ │
│  └──────────────┘ └──────────────┘ └──────────────┘ └────────────┘ │
│                                                                     │
│  Voting History                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Proposal                      │ Vote   │ Stake    │ Date    │   │
│  ├───────────────────────────────┼────────┼──────────┼─────────┤   │
│  │ DeFi Liquidity Budget         │ ✅ Yes │ 125.5m ₳ │ 2 days  │   │
│  │ Increase Block Size           │ ✅ Yes │ 125.5m ₳ │ 5 days  │   │
│  │ Motion of No Confidence       │ ❌ No  │ 120.1m ₳ │ 15 days │   │
│  └───────────────────────────────┴────────┴──────────┴─────────┘   │
│                                                                     │
│  Voting Pattern                                                     │
│  [PIE: 78% Yes, 15% No, 7% Abstain]                                │
│                                                                     │
│  Delegators (Top 10)                                               │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ $alice          │ 25.5m ₳    │ Since Epoch 592              │   │
│  │ addr1xyz...     │ 15.2m ₳    │ Since Epoch 601              │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
│  Profile (from metadata)                                           │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ "I vote for proposals that benefit the Cardano ecosystem    │   │
│  │  and promote decentralization..."                            │   │
│  │                                                              │   │
│  │ 🔗 Website: michael.ada                                      │   │
│  │ 🐦 Twitter: @michael_drep                                    │   │
│  └─────────────────────────────────────────────────────────────┘   │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### DRep List Page

**Route:** `/explorer/[network]/dreps`

```
┌─────────────────────────────────────────────────────────────────────┐
│ Registered DReps (1,234)                    [Search...] [Filters]  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Sort: [Voting Power ▼]  Filter: [Active ▼] [Min Stake: ___]       │
│                                                                     │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ #  │ DRep            │ Voting Power │ Delegators │ Partic.   │  │
│ ├────┼─────────────────┼──────────────┼────────────┼───────────┤  │
│ │ 1  │ $cardano_whale  │ 2.1b ₳       │ 12         │ 100%      │  │
│ │ 2  │ $defi_expert    │ 890m ₳       │ 456        │ 95%       │  │
│ │ 3  │ Predefined Auto │ 500m ₳       │ -          │ -         │  │
│ │    │ Abstain         │              │            │           │  │
│ │ 4  │ $michael        │ 125.5m ₳     │ 234        │ 92%       │  │
│ │ 5  │ drep1xyz...     │ 98.2m ₳      │ 89         │ 88%       │  │
│ └────┴─────────────────┴──────────────┴────────────┴───────────┘  │
│                                                                     │
│ Special DReps:                                                      │
│ ┌───────────────────────────────────────────────────────────────┐  │
│ │ 🔄 Auto-Abstain    │ Stake delegated to abstain │ 8.3b ₳     │  │
│ │ 🚫 Auto No-Confid. │ Automatic no confidence    │ 194m ₳     │  │
│ │ ❓ Not Delegated   │ Stake with no DRep         │ 4.2b ₳     │  │
│ └───────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Constitutional Committee Page

**Route:** `/explorer/[network]/governance/committee`

```
┌─────────────────────────────────────────────────────────────────────┐
│ Constitutional Committee                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│  Current Composition: 7/8 members (1 expired)                      │
│  Approval Threshold: 66.67% (⅔ majority)                           │
│  Current Term: Epoch 590 - 690                                     │
│                                                                     │
│  ┌─────────────────────────────────────────────────────────────┐   │
│  │ Member                    │ Status  │ Term End │ Votes Cast │   │
│  ├───────────────────────────┼─────────┼──────────┼────────────┤   │
│  │ Cardano Atlantic Council  │ Active  │ E690     │ 45         │   │
│  │ Eastern Cardano Council   │ Active  │ E690     │ 42         │   │
│  │ Intersect                 │ Active  │ E690     │ 48         │   │
│  │ cc_cold1abc...           │ Active  │ E680     │ 38         │   │
│  │ cc_cold1xyz...           │ Expired │ E605     │ 22         │   │
│  └───────────────────────────┴─────────┴──────────┴────────────┘   │
│                                                                     │
│  Voting Record (All Actions)                                       │
│  [CHART: CC approval rate over time]                               │
│                                                                     │
│  Constitutional References                                          │
│  🔗 Current Constitution (IPFS)                                    │
│  🔗 Constitutional Committee Charter                               │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Governance Action List Page

**Route:** `/explorer/[network]/governance/actions`

```
┌─────────────────────────────────────────────────────────────────────┐
│ Governance Actions                                                  │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ Tabs: [All] [Live] [Passed] [Enacted] [Expired] [Rejected]         │
│                                                                     │
│ Filters: [Type ▼] [Epoch Range ▼] [Proposer ▼]                     │
│                                                                     │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │                                                                 ││
│ │ Treasury Withdrawal                                    🟢 Live  ││
│ │ ───────────────────                                             ││
│ │ Cardano DeFi Liquidity Budget - Withdrawal 1                    ││
│ │                                                                 ││
│ │ DReps: [████░░░░░░] 21%    SPOs: N/A    CC: 0/8                ││
│ │                                                                 ││
│ │ Submitted: E607 • Expires: E613 (12 days) • Deposit: 100k ₳    ││
│ │                                                                 ││
│ ├─────────────────────────────────────────────────────────────────┤│
│ │                                                                 ││
│ │ Protocol Parameters                                    🟢 Live  ││
│ │ ────────────────────                                            ││
│ │ Increase Max Block Size to 100KB                                ││
│ │                                                                 ││
│ │ DReps: [████████░░] 82%    SPOs: [██████░░] 75%    CC: 5/8     ││
│ │                                                                 ││
│ │ Submitted: E605 • Expires: E611 (5 days) • Deposit: 100k ₳     ││
│ │                                                                 ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Governance in Address/Stake Pages

Show governance participation on relevant pages:

**On Stake Address Page:**
```
┌─────────────────────────────────────────────────────────────────────┐
│ Governance Participation                                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                     │
│ DRep Delegation:                                                    │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ Currently delegated to: $michael (DRep)                         ││
│ │ Delegated stake: 12,456.78 ADA                                  ││
│ │ Since: Epoch 595                                                ││
│ │                                                                 ││
│ │ [View DRep Profile]                                             ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
│ OR if pool operator:                                               │
│ ┌─────────────────────────────────────────────────────────────────┐│
│ │ SPO Voting Record (NACHO Pool):                                 ││
│ │ • 12 votes cast this epoch                                      ││
│ │ • Pattern: 80% Yes, 10% No, 10% Abstain                        ││
│ │ [View Full Voting History]                                      ││
│ └─────────────────────────────────────────────────────────────────┘│
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### Governance Database Queries

**Key DB-Sync Tables (Voltaire):**
```sql
-- Governance actions
SELECT * FROM gov_action_proposal;
SELECT * FROM voting_procedure;
SELECT * FROM drep_registration;
SELECT * FROM delegation_vote;
SELECT * FROM committee_member;
SELECT * FROM constitution;

-- DRep info with voting power
SELECT
  dr.drep_hash,
  dr.view as drep_id,
  SUM(dv.amount) as voting_power,
  COUNT(DISTINCT dv.addr_id) as delegator_count
FROM drep_hash dr
LEFT JOIN delegation_vote dv ON dv.drep_hash_id = dr.id
GROUP BY dr.id;

-- Governance action with vote tallies
SELECT
  gap.*,
  SUM(CASE WHEN vp.vote = 'Yes' THEN voting_power ELSE 0 END) as yes_stake,
  SUM(CASE WHEN vp.vote = 'No' THEN voting_power ELSE 0 END) as no_stake,
  SUM(CASE WHEN vp.vote = 'Abstain' THEN voting_power ELSE 0 END) as abstain_stake
FROM gov_action_proposal gap
LEFT JOIN voting_procedure vp ON vp.gov_action_proposal_id = gap.id
GROUP BY gap.id;
```

---

### Governance Feature Summary

| Feature | Description |
|---------|-------------|
| Governance Dashboard | Overview of active proposals, DReps, voting power |
| Action Detail | Full proposal info with live voting progress |
| Three-Body Voting | Separate panels for DReps, SPOs, CC |
| Vote Timeline | Visual progress through voting period |
| Individual Votes | Searchable list of all votes with identities |
| DRep Profiles | Voting history, delegators, participation rate |
| DRep Directory | Sortable list of all registered DReps |
| CC Page | Committee composition and voting record |
| Stake Integration | Show DRep delegation on address pages |
| Real-time Updates | SSE for live vote counts |

---

## Detailed Entity Specifications

Each entity type in the explorer will display comprehensive, relevant information. The Cardano Expert agent will validate all data accuracy.

---

### Dashboard / Home Page

**Network Status Bar (Top):**
| Field | Source | Display |
|-------|--------|---------|
| Network | Config | "Mainnet" / "Preprod" badge |
| Sync Status | Tip lag | "Synced" or "X blocks behind" |
| Current Slot | Calculated | Live updating |
| Current Epoch | Calculated | With progress % |

**Key Metrics (4 Cards):**
| Metric | Source | Display |
|--------|--------|---------|
| Block Height | `block.block_no` MAX | Live updating number |
| Transactions (24h) | COUNT last 24h | Number with trend arrow |
| Active Stake | `epoch_stake` total | Formatted ADA |
| Active Pools | COUNT active pools | Number |

**Epoch Progress Widget:**
```
Epoch 450                                      67.3%
[████████████████████████████░░░░░░░░░░░░░░]
Started: Jan 24, 2025      Ends: Jan 29, 2025 (~1d 14h)
```

**Transaction Volume Chart (7 days):**
- Area chart with lime fill
- X-axis: Days
- Y-axis: Transaction count
- Hover for daily details

**Live Block Feed:**
| Column | Display |
|--------|---------|
| Block # | Clickable, with "NEW" animation on arrival |
| Pool | Ticker badge |
| TXs | Transaction count |
| Time | "Just now", "12s ago" |

Auto-scrolling list of last 10 blocks with SSE updates.

**Recent Transactions:**
| Column | Display |
|--------|---------|
| Hash | Truncated, clickable |
| Type | Color-coded badge |
| Summary | Human-readable |
| Value | Formatted ADA |
| Time | Relative |

**Network Statistics (Bottom Cards):**
| Metric | Source | Display |
|--------|--------|---------|
| Circulating Supply | `ada_pots` | ADA with % of max |
| Treasury | `ada_pots.treasury` | Formatted ADA |
| Total Stake Pools | COUNT pools | Active pools |
| Total Delegators | COUNT delegations | Unique stake keys |

---

### Block Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Block Number | `block.block_no` | Large heading with # prefix |
| Block Hash | `block.hash` | Truncated with copy button |
| Timestamp | `block.time` | Relative + absolute (e.g., "2 min ago • Jan 28, 2025 14:32:15 UTC") |
| Confirmations | Calculated | Badge with color (green if >10) |

**Block Producer Section:**
| Field | Source | Display |
|-------|--------|---------|
| Pool Ticker | `pool_offline_data.ticker_name` | Clickable link to pool |
| Pool Name | `pool_offline_data.json->name` | Full name |
| Pool ID | `pool_hash.view` | Truncated bech32 with copy |

**Block Metrics (Cards):**
| Metric | Source | Display |
|--------|--------|---------|
| Transactions | `block.tx_count` | Number with "txs" label |
| Block Size | `block.size` | Formatted (e.g., "45.2 KB") |
| Total Output | SUM of tx outputs | Formatted ADA |
| Total Fees | SUM of tx fees | Formatted ADA |

**Time Context (Visual):**
| Field | Source | Display |
|-------|--------|---------|
| Epoch | `block.epoch_no` | Clickable link to epoch |
| Slot in Epoch | `block.slot_no % 432000` | Progress bar showing position |
| Epoch Slot | `block.epoch_slot_no` | Raw number |
| Absolute Slot | `block.slot_no` | Raw number |

**Navigation:**
| Element | Display |
|---------|---------|
| Previous Block | Arrow link to block_no - 1 |
| Next Block | Arrow link to block_no + 1 (if exists) |

**Transactions List:**
| Column | Source | Display |
|--------|--------|---------|
| Hash | `tx.hash` | Truncated, clickable |
| Type | Parsed | Badge (Transfer, Delegation, Mint, Contract) |
| Summary | Parsed | Human-readable (e.g., "Sent 500 ADA") |
| Total Value | SUM outputs | Formatted ADA |
| Fee | `tx.fee` | Formatted ADA |

---

### Transaction Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Transaction Hash | `tx.hash` | Full hash with copy button |
| Status | Calculated | Badge (Confirmed/Pending) |
| Confirmations | `tip.block_no - tx.block_no` | Number + time estimate |
| Human Summary | Parsed | Large text (e.g., "Sent 1,500 ADA to addr1...") |

**Transaction Type Detection:**
```
- Has delegation certificate → "Delegation"
- Has stake registration → "Stake Registration"
- Has stake deregistration → "Stake Deregistration"
- Has pool registration → "Pool Registration"
- Has pool retirement → "Pool Retirement"
- Has mint/burn → "Token Mint" / "Token Burn"
- Has withdrawal → "Reward Withdrawal"
- Has redeemers → "Smart Contract Execution"
- Has metadata → Check for known formats (CIP-20 message, etc.)
- Default → "ADA Transfer"
```

**Value Summary (Cards):**
| Metric | Source | Display |
|--------|--------|---------|
| Total Input | SUM of inputs | Formatted ADA |
| Total Output | SUM of outputs | Formatted ADA |
| Fee | `tx.fee` | Formatted ADA (highlight if unusual) |
| Deposit | `tx.deposit` | If non-zero, show with explanation |

**Visual Transaction Flow (Sankey Diagram):**
```
INPUTS                          OUTPUTS
┌─────────────────┐            ┌─────────────────┐
│ [identicon]     │            │ [identicon]     │
│ addr1abc...     │────────────│ addr1xyz...     │
│ 500 ADA         │     │      │ 450 ADA         │
│ + 1000 HOSKY    │     │      └─────────────────┘
└─────────────────┘     │
                        │      ┌─────────────────┐
┌─────────────────┐     │      │ [identicon]     │
│ [identicon]     │     └──────│ addr1abc...     │
│ addr1def...     │────────────│ 49.8 ADA (change)│
│ 100 ADA         │            │ + 1000 HOSKY    │
└─────────────────┘            └─────────────────┘

                Fee: 0.176789 ADA
```

**Inputs Table:**
| Column | Source | Display |
|--------|--------|---------|
| # | Index | Sequential number |
| Address | `tx_out.address` via `tx_in` | Identicon + truncated, clickable |
| Source TX | `tx_in` source | Truncated hash, clickable |
| Value | `tx_out.value` | Formatted ADA |
| Tokens | `ma_tx_out` | Token count badge, expandable |

**Outputs Table:**
| Column | Source | Display |
|--------|--------|---------|
| # | `tx_out.index` | Output index |
| Address | `tx_out.address` | Identicon + truncated, clickable |
| Value | `tx_out.value` | Formatted ADA |
| Tokens | `ma_tx_out` | List of tokens with quantities |
| Datum | `tx_out.data_hash` | If present, show hash + type |
| Spent | Check if spent | Badge (Spent/Unspent) |

**Metadata Section (if present):**
| Field | Source | Display |
|-------|--------|---------|
| Label | `tx_metadata.key` | Numeric label with known type (e.g., "674 = CIP-20 Message") |
| Content | `tx_metadata.json` | Formatted JSON with syntax highlighting |
| Raw CBOR | `tx_metadata.bytes` | Hex dump (collapsible) |

**Certificates Section (if present):**
| Type | Fields | Display |
|------|--------|---------|
| Stake Registration | Stake address | "Registered stake key stake1..." |
| Stake Deregistration | Stake address | "Deregistered stake key stake1..." |
| Delegation | Stake addr, Pool ID | "Delegated stake1... to [TICKER]" |
| Pool Registration | Pool ID, Params | Full pool parameters table |
| Pool Retirement | Pool ID, Epoch | "Pool [TICKER] retiring at epoch X" |

**Scripts & Redeemers (if present):**
| Field | Source | Display |
|-------|--------|---------|
| Script Hash | `redeemer.script_hash` | Clickable link to contract |
| Script Type | `script.type` | Badge (Plutus V1/V2/V3, Native) |
| Purpose | `redeemer.purpose` | spend/mint/certify/reward |
| Datum | `datum.value` | JSON with syntax highlighting |
| Redeemer | `redeemer.data` | JSON with syntax highlighting |
| Execution Units | `redeemer.unit_mem`, `unit_steps` | Memory + CPU steps |
| Script Size | `tx.script_size` | Formatted bytes |

**Block Context:**
| Field | Source | Display |
|-------|--------|---------|
| Block Number | `block.block_no` | Clickable link |
| Block Hash | `block.hash` | Truncated with copy |
| Slot | `block.slot_no` | With epoch context |
| Timestamp | `block.time` | Relative + absolute |

**Technical Details (Collapsible):**
| Field | Source | Display |
|-------|--------|---------|
| Size | `tx.size` | Bytes |
| Valid From | `tx.invalid_before` | Slot (if set) |
| Valid Until | `tx.invalid_hereafter` | Slot (if set) |
| Collateral | If present | Collateral inputs/return |

---

### Address Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Address | Full address | With identicon, copy button |
| Address Type | Parsed | Badge (Base/Enterprise/Pointer/Reward/Byron) |
| Network | From prefix | Mainnet/Testnet indicator |
| Stake Key | Extracted | Linked stake address (if base address) |

**Balance Summary (Large Cards):**
| Metric | Source | Display |
|--------|--------|---------|
| ADA Balance | SUM `utxo_view.value` | Large formatted number |
| Token Count | COUNT distinct tokens | "X different tokens" |
| UTxO Count | COUNT utxos | Number of unspent outputs |
| First Activity | MIN block time | Date of first transaction |

**Staking Info (if delegated):**
| Field | Source | Display |
|-------|--------|---------|
| Delegated To | `delegation` | Pool ticker + name, clickable |
| Since Epoch | `delegation` epoch | Epoch number |
| Rewards Available | `reward.amount` | Formatted ADA |
| Total Rewards Earned | SUM historical | Formatted ADA |

**Activity Chart:**
- 30-day transaction volume sparkline
- Incoming vs outgoing visualization
- Hover for daily details

**Tabs:**
1. **Transactions** - Full transaction history
2. **UTxOs** - Current unspent outputs
3. **Tokens** - Token holdings
4. **Staking** - Delegation history & rewards

**Transactions Tab:**
| Column | Source | Display |
|--------|--------|---------|
| Hash | `tx.hash` | Truncated, clickable |
| Type | Parsed | Badge |
| Direction | Calculated | Incoming (green) / Outgoing (red) |
| Amount | Net change | +/- formatted ADA |
| Counterparty | Other address | Identicon + truncated |
| Time | `block.time` | Relative |
| Block | `block.block_no` | Clickable |

**UTxOs Tab:**
| Column | Source | Display |
|--------|--------|---------|
| TX Hash | `tx.hash` | Truncated, clickable |
| Index | `tx_out.index` | Output index |
| Value | `tx_out.value` | Formatted ADA |
| Tokens | `ma_tx_out` | Token badges |
| Created | `block.time` | When created |
| Datum | `tx_out.data_hash` | If present |

**Tokens Tab:**
| Column | Display |
|--------|---------|
| Token | Icon + name (if available from metadata) |
| Policy ID | Truncated, clickable |
| Asset Name | Decoded (hex to text if valid) |
| Quantity | Formatted number |
| # UTxOs | How many UTxOs contain this token |

---

### Stake Address Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Stake Address | Full address | stake1... with copy |
| Status | `stake_registration` | Registered/Not Registered badge |
| Controlled Stake | SUM of linked UTxOs | Formatted ADA |

**Delegation Status (Large Card):**
| Field | Source | Display |
|-------|--------|---------|
| Currently Delegated To | `delegation` latest | Pool ticker + name + logo |
| Pool ID | `pool_hash.view` | Bech32, clickable |
| Delegated Since | `delegation` epoch | "Since Epoch X (Y days)" |
| Active Stake | `epoch_stake` for this key | Formatted ADA |

**Rewards Summary:**
| Metric | Source | Display |
|--------|--------|---------|
| Available Rewards | `reward` unclaimed | Large formatted ADA (green if >0) |
| Total Earned (Lifetime) | SUM all rewards | Formatted ADA |
| Last Reward | Most recent | Amount + epoch |
| Total Withdrawals | SUM withdrawals | Formatted ADA |

**Rewards History Chart:**
- Bar chart showing rewards per epoch (last 20 epochs)
- Overlaid with ADA price if available

**Rewards History Table:**
| Column | Source | Display |
|--------|--------|---------|
| Epoch | `reward.earned_epoch` | Clickable |
| Pool | `reward.pool_id` | Pool ticker |
| Reward Type | `reward.type` | leader/member/refund |
| Amount | `reward.amount` | Formatted ADA |
| Withdrawn | Check withdrawals | Yes/No |

**Delegation History:**
| Column | Source | Display |
|--------|--------|---------|
| Epoch | `delegation` epoch | When delegation changed |
| Pool | `delegation.pool_hash_id` | Pool ticker, clickable |
| TX Hash | `delegation.tx_id` | Truncated, clickable |
| Action | Type | Delegated/Re-delegated |

**Associated Addresses:**
List of payment addresses that share this stake key:
| Column | Display |
|--------|---------|
| Address | Identicon + truncated, clickable |
| Balance | Current ADA balance |
| Tokens | Token count |
| Last Active | Most recent TX time |

**Registration History:**
| Column | Display |
|--------|---------|
| Action | Registered/Deregistered |
| Epoch | When |
| TX Hash | Clickable |
| Deposit | 2 ADA deposit (if applicable) |

---

### Epoch Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Epoch Number | `epoch.no` | Large heading |
| Status | Calculated | "Active" / "Completed" badge |
| Progress | Calculated | Progress bar with % and time remaining |

**Epoch Timeline:**
```
[Start] ═══════════════════════╪═══════ [End]
                              67%
        Jan 24 00:00          Now       Jan 29 00:00
```

**Key Metrics (Cards):**
| Metric | Source | Display |
|--------|--------|---------|
| Total Blocks | `epoch.blk_count` | Number |
| Total Transactions | `epoch.tx_count` | Number |
| Total Fees | `epoch.fees` | Formatted ADA |
| Total Output | `epoch.out_sum` | Formatted ADA |
| Active Stake | `epoch_stake` | Formatted ADA |
| Active Pools | COUNT pools | Number |

**ADA Distribution (Pie Chart):**
| Segment | Source | Display |
|---------|--------|---------|
| Circulating | `ada_pots.circulation` | ADA + % |
| Treasury | `ada_pots.treasury` | ADA + % |
| Reserves | `ada_pots.reserves` | ADA + % |
| Rewards | `ada_pots.rewards` | ADA + % |

**Protocol Parameters (if changed):**
Show any parameters that changed from previous epoch with before/after comparison.

**Top Pools This Epoch:**
| Column | Display |
|--------|---------|
| Rank | Position |
| Pool | Ticker + name |
| Blocks Minted | Count this epoch |
| Active Stake | Formatted ADA |
| ROA | Return on ADA % |

**Navigation:**
- Previous/Next epoch arrows
- "Current Epoch" quick link

---

### Stake Pool Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Pool Ticker | `pool_offline_data.ticker_name` | Large, with logo if available |
| Pool Name | `pool_offline_data.json->name` | Full name |
| Pool ID | `pool_hash.view` | Bech32 with copy |
| Homepage | `pool_offline_data.json->homepage` | Clickable link |
| Status | `pool_retire` check | Active/Retiring/Retired badge |

**Key Metrics (Cards):**
| Metric | Source | Display |
|--------|--------|---------|
| Live Stake | `epoch_stake.amount` | Formatted ADA |
| Active Stake | Previous epoch stake | Formatted ADA |
| Saturation | Calculated | % with color (green <80%, yellow 80-100%, red >100%) |
| Delegators | COUNT delegations | Number |
| Pledge | `pool_update.pledge` | Formatted ADA |
| Margin | `pool_update.margin` | Percentage |
| Fixed Cost | `pool_update.fixed_cost` | Formatted ADA |

**Performance Metrics:**
| Metric | Source | Display |
|--------|--------|---------|
| Lifetime Blocks | COUNT blocks | Total blocks minted |
| This Epoch Blocks | COUNT blocks | Blocks in current epoch |
| Expected Blocks | Calculated | Based on stake % |
| Luck | Actual/Expected | Percentage with color |
| ROA (30d) | Calculated | Return on ADA % |

**Blocks Chart:**
- Bar chart showing blocks minted per epoch (last 20 epochs)
- Overlay line showing expected blocks

**Delegator Distribution (Pie Chart):**
- Top 10 delegators as segments
- "Others" segment for remaining

**Pool Information:**
| Field | Source | Display |
|-------|--------|---------|
| Description | `pool_offline_data.json->description` | Full text |
| Relays | `pool_relay` | List of DNS/IP addresses |
| Owners | `pool_owner` | List of stake addresses |
| Reward Account | `pool_update.reward_addr` | Stake address |
| VRF Key Hash | `pool_update.vrf_key_hash` | Hex |
| Registration TX | `pool_update.registered_tx_id` | Clickable |

**Delegation History:**
| Column | Display |
|--------|---------|
| Epoch | Epoch number |
| Active Stake | Stake amount |
| Delegators | Count |
| Blocks | Minted that epoch |
| Rewards | Total distributed |

**Recent Blocks:**
| Column | Display |
|--------|---------|
| Block | Block number, clickable |
| Slot | Slot number |
| Time | Relative |
| Transactions | TX count |
| Size | Block size |

---

### Token/Asset Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Asset Name | Decoded from hex | Human readable if possible |
| Policy ID | `multi_asset.policy` | With copy, link to policy |
| Fingerprint | CIP-14 | Asset fingerprint |
| Type | Detected | NFT / Fungible Token badge |

**For Fungible Tokens:**
| Metric | Source | Display |
|--------|--------|---------|
| Total Supply | `multi_asset.quantity` | Formatted |
| Mint Transactions | COUNT mints | Number |
| Holders | COUNT distinct addresses | Number |
| Decimals | From metadata | If specified |

**For NFTs (CIP-25/CIP-68):**
| Field | Source | Display |
|-------|--------|---------|
| Image | From IPFS/metadata | Rendered image |
| Name | Metadata | Display name |
| Description | Metadata | Full description |
| Attributes/Traits | Metadata | Key-value table |
| Collection | Policy ID | Link to other assets in policy |
| Current Owner | UTxO holder | Address with identicon |

**Metadata Display:**
- Rendered view (images, formatted text)
- Raw JSON view (collapsible)
- On-chain vs off-chain indicator

**Transaction History:**
| Column | Display |
|--------|---------|
| TX Hash | Clickable |
| Type | Mint/Transfer/Burn |
| From | Sender address (if transfer) |
| To | Receiver address |
| Amount | Quantity transferred |
| Time | Relative |

---

### Token Policy Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Policy ID | `multi_asset.policy` | Full hex with copy |
| Policy Type | `script.type` | Native/Plutus badge |
| Script Hash | If Plutus | Link to contract page |

**Policy Overview:**
| Metric | Source | Display |
|--------|--------|---------|
| Total Assets | COUNT distinct names | Number of tokens under policy |
| Total Mints | COUNT mint TXs | Number |
| First Minted | MIN mint time | Date |
| Minting Status | Check script | Open/Locked badge |

**For NFT Collections (detected via CIP-25):**
| Metric | Display |
|--------|---------|
| Collection Name | If in metadata |
| Total Supply | Count of NFTs |
| Unique Holders | COUNT distinct addresses |
| Floor Price | If available from markets |

**NFT Gallery Grid:**
```
┌───────────┐ ┌───────────┐ ┌───────────┐ ┌───────────┐
│   [IMG]   │ │   [IMG]   │ │   [IMG]   │ │   [IMG]   │
│  NFT #1   │ │  NFT #2   │ │  NFT #3   │ │  NFT #4   │
│  Owner... │ │  Owner... │ │  Owner... │ │  Owner... │
└───────────┘ └───────────┘ └───────────┘ └───────────┘
```

**For Fungible Token Policies:**
| Column | Display |
|--------|---------|
| Asset Name | Decoded name |
| Total Supply | Quantity |
| Holders | COUNT |
| Decimals | If specified |

**Mint/Burn History:**
| Column | Display |
|--------|---------|
| TX Hash | Clickable |
| Action | Mint/Burn badge |
| Asset | Asset name |
| Quantity | Amount |
| Time | Relative |

**Minting Script (if viewable):**
- Native script: Show JSON structure with conditions
- Plutus: Link to contract detail

---

### Blocks List Page

**Filters:**
| Filter | Options |
|--------|---------|
| Pool | Select specific pool |
| Epoch | Select epoch range |
| Date Range | From/To date picker |

**Sort Options:**
- Block Number (default, descending)
- Transaction Count
- Block Size
- Time

**List View:**
| Column | Source | Display |
|--------|--------|---------|
| Block # | `block.block_no` | Clickable link |
| Hash | `block.hash` | First 8 + last 8 chars |
| Epoch/Slot | `block.epoch_no`, slot | "450 / 234,567" |
| Pool | `pool_offline_data.ticker` | Clickable badge |
| Transactions | `block.tx_count` | Number |
| Size | `block.size` | KB formatted |
| Time | `block.time` | Relative |

**Pagination:**
- 25/50/100 per page options
- "Load more" infinite scroll option
- Jump to block number

---

### Transactions List Page

**Filters:**
| Filter | Options |
|--------|---------|
| Type | Transfer, Delegation, Mint, Contract, etc. |
| Min Value | ADA amount |
| Has Metadata | Yes/No |
| Has Scripts | Yes/No |
| Address | Contains specific address |

**Sort Options:**
- Time (default, newest first)
- Value (highest first)
- Fee (highest first)

**List View:**
| Column | Source | Display |
|--------|--------|---------|
| Hash | `tx.hash` | Truncated, clickable |
| Block | `block.block_no` | Clickable |
| Type | Parsed | Color badge |
| Summary | Parsed | Human-readable |
| Value | SUM outputs | Formatted ADA |
| Fee | `tx.fee` | Formatted ADA |
| Time | `block.time` | Relative |

**Live Updates Toggle:**
- Enable/disable real-time new transaction stream
- New TXs appear at top with animation

---

### Stake Pools List Page

**Filters:**
| Filter | Options |
|--------|---------|
| Status | Active/Retiring/Retired |
| Saturation | Under 50%, 50-80%, 80-100%, Over 100% |
| Pledge Met | Yes/No |
| Blocks This Epoch | Has minted / Hasn't minted |

**Sort Options:**
- Live Stake (default)
- ROA (Return on ADA)
- Blocks Lifetime
- Pledge
- Margin (lowest first)
- Delegator Count

**List View:**
| Column | Display |
|--------|---------|
| Rank | Position by stake |
| Pool | Logo + Ticker + Name |
| Live Stake | Formatted ADA + saturation bar |
| Margin | Percentage |
| Pledge | Formatted ADA |
| ROA | % with color |
| Blocks (Epoch) | This epoch / expected |
| Delegators | Count |

**Pool Comparison:**
- Checkbox to select up to 3 pools
- "Compare" button opens side-by-side comparison

---

### Smart Contract/Script Detail Page

**Header Section:**
| Field | Source | Display |
|-------|--------|---------|
| Script Hash | `script.hash` | With copy |
| Script Type | `script.type` | Plutus V1/V2/V3 / Native badge |
| Size | `script.bytes` length | Formatted bytes |

**Usage Statistics:**
| Metric | Source | Display |
|--------|--------|---------|
| Total Executions | COUNT redeemers | Number |
| Unique Users | COUNT distinct addresses | Number |
| Total Value Locked | SUM UTxOs at script | Formatted ADA |
| First Used | MIN block time | Date |
| Last Used | MAX block time | Date |

**Execution Cost Analysis:**
| Metric | Source | Display |
|--------|--------|---------|
| Avg Memory | AVG unit_mem | Formatted |
| Avg CPU Steps | AVG unit_steps | Formatted |
| Avg Fee | AVG tx fee | Formatted ADA |
| Max Memory | MAX unit_mem | Formatted |
| Max CPU | MAX unit_steps | Formatted |

**Script Code (if available):**
- CBOR hex dump with syntax highlighting
- Size breakdown

**Recent Executions:**
| Column | Display |
|--------|---------|
| TX Hash | Clickable |
| Purpose | spend/mint/certify/reward |
| Memory | Unit mem |
| CPU | Unit steps |
| Fee | Transaction fee |
| Time | Relative |

**Datums Used:**
| Column | Display |
|--------|---------|
| Datum Hash | Truncated |
| JSON Preview | First 100 chars |
| Used In | TX count |

---

### Search Results Page

**Instant Results (as you type):**
- Pattern detection shows likely result type
- Direct navigation if unambiguous

**Search Result Categories:**
| Category | Fields Searched |
|----------|-----------------|
| Blocks | Block number, block hash |
| Transactions | TX hash |
| Addresses | Full address |
| Stake Addresses | stake1... addresses |
| Pools | Pool ID, ticker, name |
| Tokens | Policy ID, asset name, fingerprint |
| Epochs | Epoch number |

**Result Display:**
```
┌─────────────────────────────────────────────────────────────┐
│ Search: "NACHO"                                    [x Clear]│
├─────────────────────────────────────────────────────────────┤
│ Stake Pools (1 result)                                      │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ [Logo] NACHO - Nacho Stake Pool                         │ │
│ │ pool1abc...xyz • 2.5M ADA staked • 1.5% margin         │ │
│ └─────────────────────────────────────────────────────────┘ │
│                                                             │
│ Tokens (3 results)                                          │
│ ┌─────────────────────────────────────────────────────────┐ │
│ │ NACHO Token • Policy: abc123...                         │ │
│ │ Supply: 1,000,000 • 245 holders                        │ │
│ └─────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

---

## Architecture Decision

**Add explorer routes to the existing Next.js app** (not a separate app)

**Rationale:**
- Reuses DB-Sync connection pools, Redis clients, and styling
- Single build/deploy process (documented procedure)
- Kong Gateway already handles hostname routing
- Shared UI components maintain consistency

**Kong Configuration:**
```
explorer.nacho.builders → localhost:3000 (same upstream as app.nacho.builders)
```

Middleware will route `explorer.nacho.builders` → `/explorer/` routes (same pattern as `nacho.builders` → `/pool`)

---

## Phased Implementation

### Phase 1: Foundation (MVP)
Core infrastructure, blocks, transactions, addresses

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Design system setup, dashboard layout, block/tx/address page designs, search UX |
| **Cardano Expert** | Define data requirements, transaction type parser, tooltip glossary |
| **Backend Developer** | DB-Sync queries, API routes, caching layer, SSE endpoint |
| **Frontend Developer** | Layout components, pages, search, live block feed |

**Deliverables:**
- Middleware routing for `explorer.nacho.builders`
- Explorer layout with header, search, network switcher
- Dashboard with key metrics and charts
- `/explorer/[network]` - Dashboard with live stats
- `/explorer/[network]/blocks` - Block list with pagination
- `/explorer/[network]/blocks/[hash]` - Block detail with transactions
- `/explorer/[network]/tx/[hash]` - Transaction detail with flow diagram
- `/explorer/[network]/address/[address]` - Address with identicon, balance, UTxOs
- Live block feed via SSE
- Global search with pattern detection

---

### Phase 2: Stake Pools & Staking

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Pool list/detail layouts, performance charts, delegator visualization |
| **Cardano Expert** | Pool metrics accuracy, reward calculations, epoch stake logic |
| **Backend Developer** | Pool queries, stake queries, performance data aggregation |
| **Frontend Developer** | Pool components, charts, stake account pages |

**Deliverables:**
- `/explorer/[network]/pools` - Pool list with sorting/filtering
- `/explorer/[network]/pools/[pool_id]` - Pool detail (stats, delegators, blocks minted)
- `/explorer/[network]/stake/[stake_address]` - Stake account detail with rewards

---

### Phase 3: Tokens & NFTs

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Token list design, NFT gallery layout, metadata display |
| **Cardano Expert** | CIP-25/CIP-68 metadata parsing, policy ID handling |
| **Backend Developer** | Multi-asset queries, IPFS/metadata fetching |
| **Frontend Developer** | Token components, NFT gallery, image handling |

**Deliverables:**
- `/explorer/[network]/tokens` - Token list with search
- `/explorer/[network]/tokens/[policy_id]` - Policy detail with all assets
- `/explorer/[network]/tokens/[policy_id]/[asset]` - Asset detail with NFT rendering

---

### Phase 4: Smart Contracts

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Script detail layout, datum/redeemer display, execution visualization |
| **Cardano Expert** | Plutus V1/V2/V3 detection, script interpretation, execution cost analysis |
| **Backend Developer** | Script queries, redeemer queries, execution history |
| **Frontend Developer** | Contract components, JSON formatting, code display |

**Deliverables:**
- `/explorer/[network]/contracts` - Script list
- `/explorer/[network]/contracts/[script_hash]` - Script detail (type, datums, executions)

---

### Phase 5: Governance (Voltaire)

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Governance dashboard, voting progress panels, DRep profiles |
| **Cardano Expert** | Voting threshold calculations, action type rules, CC logic |
| **Backend Developer** | Governance queries, vote aggregation, real-time tallies |
| **Frontend Developer** | Voting visualizations, timeline charts, DRep components |

**Deliverables:**
- `/explorer/[network]/governance` - Governance dashboard
- `/explorer/[network]/governance/actions` - All proposals list
- `/explorer/[network]/governance/[action_id]` - Action detail with voting panels
- `/explorer/[network]/dreps` - DRep directory
- `/explorer/[network]/drep/[drep_id]` - DRep profile
- `/explorer/[network]/governance/committee` - CC page
- Governance section on stake address pages
- Real-time vote count updates via SSE

---

### Phase 6: Developer Tools

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Tool interfaces, code/data display layouts, preview result UI |
| **Cardano Expert** | Datum schema detection, protocol identification, error interpretation |
| **Backend Developer** | Decoding APIs, CBOR parsing, Ogmios evaluateTx integration |
| **Frontend Developer** | Inspector UIs, syntax highlighting, before/after comparisons |

**Deliverables:**
- `/explorer/[network]/tools/datum` - Datum Inspector
- `/explorer/[network]/tools/contract` - Contract Decoder
- `/explorer/[network]/tools/address` - Address Inspector
- `/explorer/[network]/tools/preview` - Transaction Execution Preview
- Protocol detection for known DEXes/lending/NFT markets
- Multiple output formats (JSON, CBOR, hex, Plutus Data)
- Human-readable error explanations with suggestions

---

### Phase 7: Analytics & Rich Lists

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Analytics dashboard, charts, rich list layouts |
| **Cardano Expert** | Metric definitions, whale detection, exchange labeling |
| **Backend Developer** | Aggregation queries, time-series data, caching |
| **Frontend Developer** | Charts (recharts), data tables, filters |

**Deliverables:**
- `/explorer/[network]/analytics` - Network analytics dashboard
- `/explorer/[network]/richlist` - Top addresses by balance
- `/explorer/[network]/richlist/staking` - Top staking accounts
- `/explorer/[network]/whales` - Whale alerts and large TX tracking
- Transaction volume, active addresses, fee trends charts
- DeFi TVL tracking
- Exchange inflow/outflow metrics

---

### Phase 8: Mempool & Real-time

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Mempool dashboard, TX tracking UI |
| **Cardano Expert** | Confirmation time estimates, fee optimization |
| **Backend Developer** | Ogmios mempool integration, WebSocket streaming |
| **Frontend Developer** | Real-time updates, notifications, live charts |

**Deliverables:**
- `/explorer/[network]/mempool` - Pending transactions dashboard
- TX tracking with confirmation notifications
- Mempool size and congestion metrics
- Fee estimation tool
- WebSocket/SSE for real-time updates

---

### Phase 9: User Features

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Portfolio UI, watchlist management, export wizards |
| **Cardano Expert** | Staking calculator formulas, reward projections |
| **Backend Developer** | User data storage, notification system, export generation |
| **Frontend Developer** | Portfolio charts, alert configuration, QR generation |

**Deliverables:**
- `/explorer/portfolio` - Multi-address portfolio tracker
- `/explorer/tools/calculator` - Staking rewards calculator
- `/explorer/watchlist` - Watchlist with alert configuration
- Time travel feature on address pages
- Export/tax report generation (CSV, PDF)
- QR code generation on all address/TX pages
- Email/browser notification system

---

### Phase 10: Ecosystem & Integrations

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Widget builder UI, protocol directory layout |
| **Cardano Expert** | Protocol verification, TVL calculations |
| **Backend Developer** | Widget API endpoints, price feed integration |
| **Frontend Developer** | Embeddable components, network health dashboard |

**Deliverables:**
- `/explorer/widgets` - Embeddable widget builder
- `/explorer/protocols` - Protocol/dApp directory
- `/explorer/health` - Network health dashboard
- Price integration (CoinGecko) throughout explorer
- NACHO API cross-promotion and deep linking

---

### Phase 11: Polish & Optimization

| Agent | Tasks |
|-------|-------|
| **UI/UX Designer** | Responsive refinements, accessibility audit |
| **Cardano Expert** | Data accuracy review, edge case testing |
| **Backend Developer** | Performance optimization, caching tuning |
| **Frontend Developer** | Bundle optimization, lazy loading, SEO |

**Deliverables:**
- Mobile-responsive layouts
- Accessibility compliance (WCAG)
- Performance optimization (<200ms queries)
- SEO optimization for search engines
- Error handling and edge cases

---

## File Structure

```
src/
├── app/explorer/
│   ├── layout.tsx                      # Explorer layout
│   ├── page.tsx                        # Redirect to /explorer/mainnet
│   └── [network]/
│       ├── page.tsx                    # Dashboard
│       ├── blocks/
│       │   ├── page.tsx                # Block list
│       │   └── [hash]/page.tsx         # Block detail
│       ├── tx/[hash]/page.tsx          # Transaction detail
│       ├── address/[address]/page.tsx  # Address detail
│       ├── pools/
│       │   ├── page.tsx                # Pool list
│       │   └── [pool_id]/page.tsx      # Pool detail
│       ├── stake/[stake_address]/page.tsx
│       ├── tokens/
│       │   ├── page.tsx
│       │   └── [policy_id]/page.tsx
│       ├── contracts/
│       │   ├── page.tsx
│       │   └── [script_hash]/page.tsx
│       └── search/page.tsx             # Search results
│
├── components/explorer/
│   ├── layout/
│   │   ├── explorer-header.tsx         # Nav with search + network switcher
│   │   ├── explorer-footer.tsx
│   │   ├── network-switcher.tsx
│   │   └── breadcrumbs.tsx             # Navigation trail
│   ├── dashboard/
│   │   ├── network-overview.tsx        # Key metrics cards
│   │   ├── block-timeline.tsx          # Recent blocks visual timeline
│   │   ├── tx-volume-chart.tsx         # Transaction volume graph
│   │   └── epoch-progress.tsx          # Visual epoch countdown
│   ├── blocks/
│   │   ├── block-list.tsx
│   │   ├── block-card.tsx
│   │   ├── block-transactions.tsx
│   │   └── block-stats-chart.tsx       # Block size/tx count trends
│   ├── transactions/
│   │   ├── tx-flow-diagram.tsx         # ** Visual Sankey flow **
│   │   ├── tx-summary-card.tsx         # ** Human-readable summary **
│   │   ├── tx-inputs-outputs.tsx
│   │   ├── tx-metadata.tsx
│   │   └── tx-scripts.tsx
│   ├── addresses/
│   │   ├── address-header.tsx          # Balance + identicon
│   │   ├── address-identicon.tsx       # ** Unique visual pattern **
│   │   ├── address-activity-chart.tsx  # Activity sparkline
│   │   ├── address-utxos.tsx
│   │   └── address-tokens.tsx
│   ├── pools/
│   │   ├── pool-list.tsx
│   │   ├── pool-stats.tsx
│   │   ├── pool-performance-chart.tsx  # Blocks/epoch over time
│   │   └── delegator-chart.tsx         # Stake distribution
│   ├── tokens/
│   │   ├── token-card.tsx
│   │   ├── nft-gallery.tsx
│   │   └── token-holders-chart.tsx
│   ├── live/
│   │   ├── live-block-feed.tsx         # Real-time block stream
│   │   └── network-stats-bar.tsx       # Animated stats
│   └── shared/
│       ├── hash-link.tsx               # Truncated hash + copy
│       ├── identicon.tsx               # Address visual pattern
│       ├── ada-amount.tsx              # Formatted ADA display
│       ├── time-ago.tsx                # Relative timestamps
│       ├── confirmations.tsx           # Confirmation badge
│       ├── copy-button.tsx
│       ├── pagination.tsx
│       ├── sparkline.tsx               # Mini inline chart
│       ├── tooltip.tsx                 # Smart explanatory tooltips
│       └── type-badge.tsx              # Transaction type indicator
│
├── lib/explorer/
│   ├── queries.ts                      # DB-Sync query functions
│   ├── types.ts                        # TypeScript interfaces
│   ├── formatters.ts                   # ADA, hash, time formatting
│   ├── search.ts                       # Search pattern matching
│   ├── cache.ts                        # Redis cache helpers
│   └── constants.ts                    # Network configs
│
└── app/api/explorer/
    ├── blocks/route.ts
    ├── blocks/[hash]/route.ts
    ├── tx/[hash]/route.ts
    ├── address/[address]/route.ts
    ├── pools/route.ts
    ├── pools/[pool_id]/route.ts
    ├── search/route.ts
    └── live/blocks/route.ts            # SSE block stream
```

---

## Key Components

### Network Switcher
```typescript
// URL-based network: /explorer/mainnet vs /explorer/preprod
type Network = 'mainnet' | 'preprod'

// Context provides current network from URL params
const ExplorerContext = createContext<{ network: Network }>()
```

### Search Implementation
Pattern detection for instant routing:
- 64 hex chars → Block/Transaction hash
- `addr1`/`addr_test1` → Address
- `pool1` → Pool ID
- `stake1` → Stake address
- Numeric → Block height
- 56 hex chars → Policy ID
- Otherwise → Pool name search

### Live Block Feed
Extend existing SSE pattern from `tip-stream`:
- Connect to Ogmios WebSocket for chain sync
- Emit new blocks via SSE to clients
- Include: hash, blockNo, slotNo, epochNo, time, txCount, poolTicker

---

## Database Queries

### Block List
```sql
SELECT b.block_no, b.slot_no, b.epoch_no, b.time,
       encode(b.hash, 'hex') as hash, b.tx_count, b.size,
       pod.ticker_name as pool_ticker
FROM block b
LEFT JOIN slot_leader sl ON b.slot_leader_id = sl.id
LEFT JOIN pool_hash ph ON sl.pool_hash_id = ph.id
LEFT JOIN pool_offline_data pod ON pod.pool_id = ph.id
ORDER BY b.id DESC LIMIT $1 OFFSET $2;
```

### Transaction Detail
```sql
-- Main tx
SELECT tx.*, b.block_no, b.time, b.epoch_no
FROM tx JOIN block b ON tx.block_id = b.id
WHERE tx.hash = decode($1, 'hex');

-- Inputs (spent UTxOs)
SELECT encode(tx_src.hash, 'hex') as source_tx, txo.index, txo.address, txo.value
FROM tx_in ti
JOIN tx_out txo ON ti.tx_out_id = txo.tx_id AND ti.tx_out_index = txo.index
JOIN tx tx_src ON txo.tx_id = tx_src.id
WHERE ti.tx_in_id = $1;

-- Outputs
SELECT txo.index, txo.address, txo.value, sa.view as stake_address
FROM tx_out txo
LEFT JOIN stake_address sa ON txo.stake_address_id = sa.id
WHERE txo.tx_id = $1;
```

### Address UTxOs (using utxo_view for performance)
```sql
SELECT encode(tx.hash, 'hex') as tx_hash, uv.index, uv.value, b.block_no, b.time
FROM utxo_view uv
JOIN tx ON tx.id = uv.tx_id
JOIN block b ON tx.block_id = b.id
WHERE uv.address = $1
ORDER BY b.block_no DESC;
```

---

## Caching Strategy

| Data Type | Redis TTL | Key Pattern |
|-----------|-----------|-------------|
| Block (>10 conf) | Forever | `explorer:{network}:block:{hash}` |
| Block list | 10s | `explorer:{network}:blocks:page:{n}` |
| Transaction (>10 conf) | Forever | `explorer:{network}:tx:{hash}` |
| Address UTxOs | 30s | `explorer:{network}:addr:{address}` |
| Pool info | 1h | `explorer:{network}:pool:{id}` |
| Network stats | 30s | `explorer:{network}:stats` |

---

## Theme & Color System

### Lime Accent Palette
```typescript
// Add to tailwind.config.ts
'explorer': {
  DEFAULT: '#84cc16',     // Primary lime (Tailwind lime-500)
  light: '#a3e635',       // Lighter for hover (lime-400)
  dark: '#65a30d',        // Darker for contrast (lime-600)
  glow: 'rgba(132, 204, 22, 0.15)',  // Glow effects
}
```

**Color Harmony:**
- Lime (#84cc16) + Cyan (#00d4ff) + Purple (#8b5cf6) form a vibrant split-complementary scheme
- All three colors pop against the dark backgrounds (#0a0a0f, #111118)

### Consistent Dark Theme
- Backgrounds: `bg-primary` (#0a0a0f), `bg-secondary` (#111118), `bg-tertiary` (#1a1a24)
- Text: `text-primary` (#f8fafc), `text-secondary` (#94a3b8)
- Borders: `border` (#2a2a3a)
- Semantic: `success` (green), `warning` (amber), `error` (red)

### Transaction Type Colors
| Type | Color | Hex | Example |
|------|-------|-----|---------|
| ADA Transfer | Lime | #84cc16 | Simple sends |
| Delegation | Blue | #3b82f6 | Staking actions |
| Token/NFT | Purple | #8b5cf6 | Native assets |
| Smart Contract | Orange | #f59e0b | Plutus execution |
| Reward Withdrawal | Cyan | #00d4ff | Staking rewards |

### Typography
- **Inter** - UI text and labels
- **JetBrains Mono** - Hashes, addresses, technical data
- **Cal Sans** - Headlines and emphasis

---

## Innovative UI Components

### 1. Address Identicon
Generate unique visual patterns from address hashes:
- 6x6 grid of colored squares
- Deterministic from address (same address = same pattern)
- Helps users visually recognize addresses they've seen before
- Library: `@dicebear/avatars` or custom implementation

### 2. Transaction Flow Diagram
Visual representation of value movement:
```
┌─────────────┐                    ┌─────────────┐
│ Input 1     │─────┐      ┌──────│ Output 1    │
│ 500 ADA     │     │      │      │ 450 ADA     │
└─────────────┘     │      │      └─────────────┘
                    ▼      ▼
┌─────────────┐  ┌──────────┐  ┌─────────────┐
│ Input 2     │──│    TX    │──│ Output 2    │
│ 100 ADA     │  │ Fee: 0.2 │  │ 149.8 ADA   │
└─────────────┘  └──────────┘  └─────────────┘
```
- Interactive: hover for details, click to navigate
- Color-coded flows (ADA green, tokens purple)
- Library: `react-flow` or custom SVG

### 3. Human-Readable Transaction Parser
Analyze transaction structure to determine type:
```typescript
function parseTransactionType(tx: Transaction): TransactionSummary {
  // Detect delegation certificates
  if (tx.certificates?.some(c => c.type === 'delegation'))
    return { type: 'delegation', summary: `Delegated to ${poolTicker}` }

  // Detect token mints
  if (tx.mint?.length > 0)
    return { type: 'mint', summary: `Minted ${count} tokens` }

  // Detect smart contract execution
  if (tx.redeemers?.length > 0)
    return { type: 'contract', summary: `Executed ${scriptType} contract` }

  // Simple transfer
  return { type: 'transfer', summary: `Sent ${formatADA(amount)} to ${truncate(addr)}` }
}
```

### 4. Activity Sparklines
Mini inline charts showing:
- Address activity over time (7-day)
- Pool block production (epoch)
- Transaction volume trends

### 5. Smart Tooltips
Hover on any technical term for explanation:
- "Slot 12345678" → "Block position in time. ~1 slot per second."
- "Epoch 450" → "5-day period. Staking rewards calculated per epoch."
- "UTxO" → "Unspent Transaction Output - spendable funds at an address."

---

## Recommended Libraries

| Purpose | Library | Why |
|---------|---------|-----|
| Charts & Graphs | `recharts` | Already used in ecosystem, React-native, responsive |
| Transaction Flow | `@xyflow/react` (React Flow) | Powerful node-based diagrams, customizable |
| Identicons | `@dicebear/core` + custom | Deterministic avatars from hashes |
| Animations | `framer-motion` | Smooth transitions, already in project |
| Tooltips | `@radix-ui/react-tooltip` | Accessible, customizable |
| Data Tables | `@tanstack/react-table` | Sorting, filtering, pagination |
| Date Formatting | `date-fns` | Already in project |

---

## Page Wireframes

### Dashboard (explorer.nacho.builders/mainnet)
```
┌─────────────────────────────────────────────────────────────┐
│ [Logo] NACHO Explorer    [Search............] [Mainnet ▼]  │
├─────────────────────────────────────────────────────────────┤
│                                                             │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ Blocks   │ │ TXs/Day  │ │ ADA Vol  │ │ Epoch    │       │
│  │ 10.5M    │ │ 85,432   │ │ 2.4B ₳   │ │ 450 (67%)│       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                             │
│  ┌─────────────────────────────────┐ ┌───────────────────┐ │
│  │ Transaction Volume (7 days)     │ │ Live Block Feed   │ │
│  │ [═══════════════════════════]   │ │ #10,523,456 (3s)  │ │
│  │ [Chart with green line]         │ │ #10,523,455 (23s) │ │
│  └─────────────────────────────────┘ │ #10,523,454 (45s) │ │
│                                       └───────────────────┘ │
│  ┌─────────────────────────────────────────────────────────┐│
│  │ Recent Transactions                                     ││
│  │ ┌────┐ abc123...789  Sent 500 ADA        2 min ago     ││
│  │ │ ID │ def456...012  Delegated to NACHO  5 min ago     ││
│  │ └────┘ ghi789...345  Minted 3 NFTs       8 min ago     ││
│  └─────────────────────────────────────────────────────────┘│
└─────────────────────────────────────────────────────────────┘
```

### Transaction Detail
```
┌─────────────────────────────────────────────────────────────┐
│ Transaction abc123...xyz789                    [Copy] [Raw] │
├─────────────────────────────────────────────────────────────┤
│ ┌───────────────────────────────────────────────────────┐   │
│ │ ✓ Sent 500 ADA from addr1abc... to addr1xyz...       │   │
│ │   Confirmed in block #10,523,456 • 15 confirmations   │   │
│ └───────────────────────────────────────────────────────┘   │
│                                                             │
│ ┌─────────────────── FLOW DIAGRAM ────────────────────┐    │
│ │                                                      │    │
│ │  [▣ addr1abc...]──────┐      ┌────[▣ addr1xyz...]   │    │
│ │      600 ADA          │      │        500 ADA       │    │
│ │                       ▼      ▼                      │    │
│ │                    ┌──────────┐                     │    │
│ │                    │   TX     │                     │    │
│ │                    │ Fee: 0.2 │                     │    │
│ │                    └──────────┘                     │    │
│ │                       │      │                      │    │
│ │                       ▼      └────[▣ addr1abc...]   │    │
│ │                   (change)         99.8 ADA         │    │
│ │                                                      │    │
│ └──────────────────────────────────────────────────────┘    │
│                                                             │
│ Details                                                     │
│ ├─ Block: #10,523,456                                      │
│ ├─ Slot: 123,456,789                                       │
│ ├─ Fee: 0.176789 ADA                                       │
│ └─ Size: 428 bytes                                         │
└─────────────────────────────────────────────────────────────┘
```

### Address Detail
```
┌─────────────────────────────────────────────────────────────┐
│ ┌────┐                                                      │
│ │ ▣▣ │  addr1qxy...abc789                         [Copy]   │
│ │ ▣▣ │  Balance: 12,456.78 ADA                             │
│ └────┘  + 5 tokens • Delegated to NACHO                    │
├─────────────────────────────────────────────────────────────┤
│ [Overview] [Transactions] [Tokens] [Staking]                │
│                                                             │
│  ┌─────────────────────┐  ┌─────────────────────┐          │
│  │ Activity (7 days)   │  │ Token Holdings       │          │
│  │ [sparkline chart]   │  │ HOSKY: 1,000,000    │          │
│  │ 23 transactions     │  │ SUNDAE: 500         │          │
│  └─────────────────────┘  └─────────────────────┘          │
│                                                             │
│  Recent Transactions                                        │
│  ┌────┐ Received 100 ADA from addr1def...  2 hours ago     │
│  └────┘ Sent 50 ADA to addr1ghi...         1 day ago       │
└─────────────────────────────────────────────────────────────┘
```

---

## Infrastructure Changes

### Middleware Update (middleware.ts)
Add hostname routing for `explorer.nacho.builders`:
```typescript
const isExplorerDomain = hostname === "explorer.nacho.builders" || ...

if (isExplorerDomain) {
  if (pathname === "/") {
    return NextResponse.rewrite(new URL("/explorer/mainnet", request.url))
  }
  if (!pathname.startsWith("/explorer")) {
    return NextResponse.rewrite(new URL(`/explorer${pathname}`, request.url))
  }
}
```

### Kong Gateway
```bash
curl -X POST http://localhost:8001/routes \
  -d "service.name=webapp" \
  -d "hosts[]=explorer.nacho.builders"
```

### Environment Variables
```env
DBSYNC_PREPROD_DATABASE_URL=postgresql://...@192.168.170.20:5432/cexplorer_preprod
```

### DNS
Add A record: `explorer.nacho.builders` → same IP as `app.nacho.builders`

---

## Critical Files to Modify

| File | Change |
|------|--------|
| `src/middleware.ts` | Add explorer hostname routing |
| `src/lib/cardano/dbsync.ts` | Add preprod pool, export types |
| `tailwind.config.ts` | No changes needed (already has all colors) |

## New Files to Create

| Category | Files |
|----------|-------|
| Pages | ~15 page files in `src/app/explorer/` |
| Components | ~20 component files in `src/components/explorer/` |
| Library | 6 files in `src/lib/explorer/` |
| API Routes | 8 route files in `src/app/api/explorer/` |

---

## Verification

### Local Testing
1. Add `explorer.nacho.builders` to `/etc/hosts` pointing to `127.0.0.1`
2. Run `pnpm dev` and access `http://explorer.nacho.builders:3000`
3. Verify routing, search, and real-time updates

### Integration Testing
1. Test DB-Sync queries against both mainnet and preprod databases
2. Verify caching with Redis (check hit rates)
3. Test SSE block feed stays connected

### Production Deployment
1. Build locally: `pnpm build`
2. rsync `.next/` to server
3. Add Kong route for new domain
4. Configure DNS and SSL (Let's Encrypt)
5. Verify all pages load with production data

---

## Summary

NACHO Explorer will be an **innovative, user-friendly** Cardano blockchain explorer that:

**Brand & Design:**
- Fresh **lime color scheme** (#84cc16) - vibrant complement to STAKE (cyan) and API (purple)
- **Dashboard-style** layout with charts and visual analytics throughout
- **Dark theme** consistent with the NACHO ecosystem

**Innovative Features:**
- **Visual transaction flows** - Sankey diagrams showing value movement
- **Address identicons** - Unique patterns for quick visual recognition
- **Human-readable summaries** - "Sent 500 ADA" not just raw data
- **Smart tooltips** - Explanations for technical terms on hover
- **Activity sparklines** - Mini charts showing trends inline

**Technical Foundation:**
- Runs at `explorer.nacho.builders` as part of the existing Next.js app
- Supports Mainnet and Preprod with network switcher
- Real-time block updates via SSE
- Covers blocks, transactions, addresses, pools, tokens, smart contracts, and **governance**
- Leverages existing DB-Sync, Redis, and Kong infrastructure

**Governance Features:**
- Full Voltaire (CIP-1694) governance support
- Live voting progress for DReps, SPOs, and Constitutional Committee
- DRep directory with profiles and voting history
- Governance action timeline and vote tracking
- Stake address DRep delegation display

**Developer Tools:**
- **Datum Inspector** - Decode and analyze smart contract datums
- **Contract Decoder** - Visualize Plutus script execution
- **Address Inspector** - Deep address analysis and conversion
- **Transaction Preview** - Simulate TXs before submitting, see balance changes, script execution, and error explanations

**Analytics & Rich Lists:**
- Network analytics dashboard with charts
- Top addresses (rich list) with wealth distribution
- Top staking accounts
- Whale alerts and large transaction tracking
- Exchange inflow/outflow metrics
- DeFi TVL tracking

**Mempool & Real-time:**
- Pending transaction dashboard
- TX tracking with confirmation notifications
- Mempool congestion metrics
- Fee estimation

**User Features:**
- **Portfolio Tracker** - Track multiple addresses with private labels
- **Time Travel** - View historical balances at any point
- **Staking Calculator** - Estimate future rewards
- **Watchlist & Alerts** - Email/browser/webhook notifications
- **Export & Tax Reports** - CSV/PDF compatible with tax software
- **QR Codes** - For addresses and transactions

**Ecosystem Integration:**
- **Embeddable Widgets** - Other sites can embed explorer components
- **Protocol Directory** - Verified list of Cardano dApps with TVL/volume
- **Price Integration** - USD values alongside ADA
- **Network Health** - Real-time monitoring dashboard
- **NACHO API Integration** - Cross-promotion with existing API platform

**Goal:** Make blockchain data accessible to everyone, not just developers.
