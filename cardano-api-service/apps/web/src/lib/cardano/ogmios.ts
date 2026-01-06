/**
 * Ogmios Client for Cardano Node Queries
 *
 * Connects to Ogmios (a lightweight bridge interface for cardano-node)
 * to query UTxOs and chain state.
 *
 * Ogmios endpoint is configured via OGMIOS_HOST and OGMIOS_PORT env vars.
 *
 * Caching: Uses Redis to cache responses for cacheable queries.
 * See docs/redis-cache-config.md for cache configuration details.
 */

import WebSocket from "ws"
import { getCache, setCache } from "@/lib/redis"

/**
 * Cache TTL configuration for Ogmios methods (in seconds)
 *
 * Methods not listed here are NOT cached (e.g., UTxO queries, submissions)
 * See docs/redis-cache-config.md for tuning guidelines
 */
const CACHE_CONFIG: Record<string, number> = {
  // Network queries
  "queryNetwork/tip": 10,                          // 10 seconds - changes every ~20s
  "queryNetwork/blockHeight": 10,                  // 10 seconds - same as tip
  "queryNetwork/genesisConfiguration": 86400,      // 24 hours - only changes at hard forks
  "queryNetwork/startTime": 86400,                 // 24 hours - static since chain start

  // Ledger state - epoch-based (change every 5 days)
  "queryLedgerState/epoch": 300,                   // 5 minutes
  "queryLedgerState/protocolParameters": 3600,     // 1 hour
  "queryLedgerState/stakePools": 3600,             // 1 hour
  "queryLedgerState/liveStakeDistribution": 1800,  // 30 minutes
  "queryLedgerState/rewardsProvenance": 3600,      // 1 hour
  "queryLedgerState/treasuryAndReserves": 3600,    // 1 hour
  "queryLedgerState/eraSummaries": 86400,          // 24 hours - only at era transitions

  // Ledger state - governance (changes via proposals)
  "queryLedgerState/constitution": 3600,           // 1 hour
  "queryLedgerState/constitutionalCommittee": 3600, // 1 hour

  // Ledger state - slower changing
  "queryLedgerState/rewardAccountSummaries": 300,  // 5 minutes
}

// Types for Ogmios responses
export interface UTxO {
  transaction: {
    id: string
  }
  index: number
  address: string
  value: {
    ada: {
      lovelace: bigint
    }
    [policyId: string]: {
      [assetName: string]: bigint
    } | { lovelace: bigint }
  }
  datumHash?: string
  datum?: string
  script?: unknown
}

export interface ChainTip {
  slot: number
  id: string
  height: number
}

interface OgmiosRequest {
  jsonrpc: "2.0"
  method: string
  params?: Record<string, unknown>
  id?: string | number | null
}

interface OgmiosResponse {
  jsonrpc: "2.0"
  method: string
  result?: unknown
  error?: {
    code: number
    message: string
    data?: unknown
  }
  id?: string | number | null
}

/**
 * Ogmios client for querying the Cardano blockchain
 */
export class OgmiosClient {
  private host: string
  private port: number
  private ws: WebSocket | null = null
  private requestId: number = 0
  private pendingRequests: Map<
    number,
    {
      resolve: (value: unknown) => void
      reject: (error: Error) => void
      timeout: NodeJS.Timeout
    }
  > = new Map()
  private reconnectAttempts: number = 0
  private maxReconnectAttempts: number = 5
  private reconnectDelay: number = 1000
  private isConnecting: boolean = false
  private connectionPromise: Promise<void> | null = null

  constructor(host?: string, port?: number) {
    // Default to caching proxy on gateway server for consistency
    // The proxy handles load balancing and caches stateless queries
    this.host = host || process.env.OGMIOS_HOST || "127.0.0.1"
    this.port = port || parseInt(process.env.OGMIOS_PORT || "3001", 10)
  }

  /**
   * Get the WebSocket URL for Ogmios
   */
  private getUrl(): string {
    return `ws://${this.host}:${this.port}`
  }

  /**
   * Connect to Ogmios WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    if (this.isConnecting && this.connectionPromise) {
      return this.connectionPromise
    }

    this.isConnecting = true
    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        this.ws = new WebSocket(this.getUrl())

        this.ws.on("open", () => {
          console.log(`Connected to Ogmios at ${this.getUrl()}`)
          this.reconnectAttempts = 0
          this.isConnecting = false
          resolve()
        })

        this.ws.on("message", (data: Buffer) => {
          try {
            const response: OgmiosResponse = JSON.parse(data.toString())
            this.handleResponse(response)
          } catch (error) {
            console.error("Failed to parse Ogmios response:", error)
          }
        })

        this.ws.on("error", (error) => {
          console.error("Ogmios WebSocket error:", error)
          if (this.isConnecting) {
            this.isConnecting = false
            reject(error)
          }
        })

        this.ws.on("close", () => {
          console.log("Ogmios connection closed")
          this.ws = null
          this.handleReconnect()
        })
      } catch (error) {
        this.isConnecting = false
        reject(error)
      }
    })

    return this.connectionPromise
  }

  /**
   * Handle incoming response from Ogmios
   */
  private handleResponse(response: OgmiosResponse): void {
    if (response.id === undefined || response.id === null) {
      return
    }

    const pending = this.pendingRequests.get(response.id as number)
    if (!pending) {
      return
    }

    clearTimeout(pending.timeout)
    this.pendingRequests.delete(response.id as number)

    if (response.error) {
      pending.reject(
        new Error(`Ogmios error: ${response.error.message} (code: ${response.error.code})`)
      )
    } else {
      pending.resolve(response.result)
    }
  }

  /**
   * Handle reconnection logic
   */
  private async handleReconnect(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      console.error("Max reconnection attempts reached")
      // Reject all pending requests
      for (const [, pending] of this.pendingRequests) {
        clearTimeout(pending.timeout)
        pending.reject(new Error("Connection lost and max reconnection attempts reached"))
      }
      this.pendingRequests.clear()
      return
    }

    this.reconnectAttempts++
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1)
    console.log(`Attempting to reconnect in ${delay}ms (attempt ${this.reconnectAttempts})`)

    await new Promise((resolve) => setTimeout(resolve, delay))

    try {
      await this.connect()
    } catch (error) {
      console.error("Reconnection failed:", error)
    }
  }

  /**
   * Generate a cache key for an Ogmios request
   */
  private getCacheKey(method: string, params?: Record<string, unknown>): string {
    const paramsStr = params ? JSON.stringify(params) : "{}"
    return `ogmios:${method}:${paramsStr}`
  }

  /**
   * Send a request to Ogmios and wait for response
   *
   * For cacheable methods, checks Redis cache first and caches successful responses.
   */
  private async request<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    // Check if this method is cacheable
    const ttl = CACHE_CONFIG[method]

    // If cacheable, try cache first
    if (ttl) {
      const cacheKey = this.getCacheKey(method, params)
      const cached = await getCache<T>(cacheKey)
      if (cached !== null) {
        return cached
      }
    }

    // Cache miss or non-cacheable - query Ogmios
    await this.connect()

    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to Ogmios")
    }

    const id = ++this.requestId

    const request: OgmiosRequest = {
      jsonrpc: "2.0",
      method,
      id,
    }

    if (params) {
      request.params = params
    }

    return new Promise((resolve, reject) => {
      // UTxO queries can take 60+ seconds for addresses with large balances
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        reject(new Error(`Request timeout for method: ${method}`))
      }, 90000)

      this.pendingRequests.set(id, {
        resolve: async (value: unknown) => {
          // Cache successful responses for cacheable methods
          if (ttl && value !== null && value !== undefined) {
            const cacheKey = this.getCacheKey(method, params)
            await setCache(cacheKey, value, ttl)
          }
          resolve(value as T)
        },
        reject,
        timeout,
      })

      this.ws!.send(JSON.stringify(request))
    })
  }

  /**
   * Query UTxOs at a specific address
   *
   * @param address - Bech32 Cardano address
   * @returns Array of UTxOs at the address
   */
  async queryUtxos(address: string): Promise<UTxO[]> {
    const result = await this.request<UTxO[]>("queryLedgerState/utxo", {
      addresses: [address],
    })
    return result || []
  }

  /**
   * Query UTxOs at multiple addresses
   *
   * @param addresses - Array of bech32 Cardano addresses
   * @returns Array of UTxOs at the addresses
   */
  async queryUtxosByAddresses(addresses: string[]): Promise<UTxO[]> {
    const result = await this.request<UTxO[]>("queryLedgerState/utxo", {
      addresses,
    })
    return result || []
  }

  /**
   * Query the current chain tip
   *
   * @returns Current chain tip with slot and block height
   */
  async queryTip(): Promise<ChainTip> {
    const result = await this.request<ChainTip>("queryNetwork/tip", {})
    return result
  }

  /**
   * Get the current block height
   *
   * @returns Current block height
   */
  async getBlockHeight(): Promise<number> {
    const tip = await this.queryTip()
    return tip.height
  }

  /**
   * Calculate the total ADA (in lovelace) at an address
   *
   * @param address - Bech32 Cardano address
   * @returns Total lovelace at the address
   */
  async getAddressBalance(address: string): Promise<bigint> {
    const utxos = await this.queryUtxos(address)
    // Note: lovelace comes as number from JSON parsing, convert to BigInt
    return utxos.reduce((total, utxo) => {
      const lovelace = utxo.value?.ada?.lovelace
      return total + (lovelace !== undefined ? BigInt(lovelace) : BigInt(0))
    }, BigInt(0))
  }

  /**
   * Check if a specific amount has been received at an address
   *
   * @param address - Bech32 Cardano address
   * @param expectedLovelace - Expected amount in lovelace
   * @returns Object with found status, txHash if found, and actual amount
   */
  async checkPaymentReceived(
    address: string,
    expectedLovelace: bigint
  ): Promise<{
    found: boolean
    txHash?: string
    actualAmount: bigint
    utxos: UTxO[]
  }> {
    const utxos = await this.queryUtxos(address)

    if (utxos.length === 0) {
      return {
        found: false,
        actualAmount: BigInt(0),
        utxos: [],
      }
    }

    // Calculate total received
    // Note: lovelace comes as number from JSON parsing, convert to BigInt
    const totalReceived = utxos.reduce((total, utxo) => {
      const lovelace = utxo.value?.ada?.lovelace
      return total + (lovelace !== undefined ? BigInt(lovelace) : BigInt(0))
    }, BigInt(0))

    // Check if we received at least the expected amount
    // We use >= to handle cases where slightly more was sent
    if (totalReceived >= expectedLovelace) {
      // Return the first UTxO's transaction as the payment tx
      return {
        found: true,
        txHash: utxos[0].transaction.id,
        actualAmount: totalReceived,
        utxos,
      }
    }

    return {
      found: false,
      actualAmount: totalReceived,
      utxos,
    }
  }

  /**
   * Disconnect from Ogmios
   */
  disconnect(): void {
    if (this.ws) {
      this.ws.close()
      this.ws = null
    }

    // Clear all pending requests
    for (const [, pending] of this.pendingRequests) {
      clearTimeout(pending.timeout)
      pending.reject(new Error("Connection closed"))
    }
    this.pendingRequests.clear()
  }
}

// Singleton instance for reuse
let ogmiosClient: OgmiosClient | null = null

/**
 * Get or create the Ogmios client singleton
 */
export function getOgmiosClient(): OgmiosClient {
  if (!ogmiosClient) {
    ogmiosClient = new OgmiosClient()
  }
  return ogmiosClient
}

/**
 * Query UTxOs at an address using the singleton client
 */
export async function queryUtxos(address: string): Promise<UTxO[]> {
  const client = getOgmiosClient()
  return client.queryUtxos(address)
}

/**
 * Query the current chain tip using the singleton client
 */
export async function queryTip(): Promise<ChainTip> {
  const client = getOgmiosClient()
  return client.queryTip()
}

/**
 * Check if a payment was received at an address
 */
export async function checkPaymentReceived(
  address: string,
  expectedLovelace: bigint
): Promise<{
  found: boolean
  txHash?: string
  actualAmount: bigint
  utxos: UTxO[]
}> {
  const client = getOgmiosClient()
  return client.checkPaymentReceived(address, expectedLovelace)
}
