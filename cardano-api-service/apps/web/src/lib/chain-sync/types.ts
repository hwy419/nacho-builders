/**
 * TypeScript types for Ogmios Chain Sync protocol
 * Based on Ogmios v6 JSON-RPC specification
 */

// JSON-RPC 2.0 base types
export interface JsonRpcRequest {
  jsonrpc: "2.0"
  method: string
  params?: Record<string, unknown>
  id: number | string
}

export interface JsonRpcResponse<T = unknown> {
  jsonrpc: "2.0"
  result?: T
  error?: {
    code: number
    message: string
    data?: unknown
  }
  id: number | string
}

// Chain Sync specific types
export interface Point {
  slot: number
  id: string  // Block hash (hex)
}

export interface Origin {
  origin: "origin"
}

export type IntersectionPoint = Point | Origin

// Block types
export interface BlockHeader {
  slot: number
  height: number
  id: string  // Block hash
  ancestor: string  // Previous block hash
}

export interface TransactionOutput {
  address: string
  value: {
    ada: {
      lovelace: bigint | number
    }
    [assetId: string]: unknown
  }
  datum?: unknown
  datumHash?: string
  script?: unknown
}

export interface TransactionInput {
  transaction: {
    id: string
  }
  index: number
}

export interface Transaction {
  id: string
  spends?: string
  inputs?: TransactionInput[]
  outputs?: TransactionOutput[]
  fee?: {
    ada: {
      lovelace: bigint | number
    }
  }
  validityInterval?: {
    invalidBefore?: number
    invalidAfter?: number
  }
  metadata?: unknown
  // ... other fields
}

export interface Block {
  type: "praos" | "bft" | "ebb"
  era: "byron" | "shelley" | "allegra" | "mary" | "alonzo" | "babbage" | "conway"
  id: string
  ancestor: string
  height: number
  slot: number
  transactions?: Transaction[]
}

// Chain Sync responses
export interface FindIntersectionResult {
  intersection: Point | null
  tip: Point
}

export interface RollForward {
  direction: "forward"
  block: Block
  tip: Point
}

export interface RollBackward {
  direction: "backward"
  point: Point
  tip: Point
}

export type NextBlockResult = RollForward | RollBackward

// Payment monitoring types
export interface PendingPayment {
  id: string
  paymentAddress: string
  expectedLovelace: bigint
  status: "PENDING" | "CONFIRMING"
  blockHeight?: bigint
  txHash?: string
  confirmations: number
  createdAt: Date
  expiresAt: Date
}

export interface PaymentMatch {
  paymentId: string
  txHash: string
  blockHeight: number
  receivedLovelace: bigint
  isNewTransaction: boolean
}

// Monitor state
export interface ChainSyncState {
  connected: boolean
  currentTip: Point | null
  lastProcessedSlot: number | null
  blocksProcessed: number
  paymentsDetected: number
  errors: number
  startedAt: Date | null
}
