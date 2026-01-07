/**
 * Chain Sync Client for Ogmios
 *
 * Connects to Ogmios via WebSocket and provides Chain Sync protocol methods.
 * Uses the platform's own API endpoint with WEBSITE tier API key.
 */

import WebSocket from "ws"
import type {
  JsonRpcRequest,
  JsonRpcResponse,
  Point,
  IntersectionPoint,
  FindIntersectionResult,
  NextBlockResult,
  Block,
} from "./types"

const RECONNECT_DELAYS = [1000, 2000, 5000, 10000, 30000, 60000] // Exponential backoff
const LATENCY_CHECK_INTERVAL = 30000 // Check latency every 30 seconds

export class ChainSyncClient {
  private ws: WebSocket | null = null
  private apiKey: string
  private ogmiosUrl: string
  private requestId = 0
  private pendingRequests = new Map<number, {
    resolve: (value: unknown) => void
    reject: (error: Error) => void
    timeout: NodeJS.Timeout
  }>()
  private reconnectAttempt = 0
  private isClosing = false
  private onDisconnect?: () => void
  private onReconnect?: () => void
  private latencyCheckInterval: NodeJS.Timeout | null = null
  private lastLatency: number | null = null

  constructor(options: {
    apiKey: string
    ogmiosUrl?: string
    onDisconnect?: () => void
    onReconnect?: () => void
  }) {
    this.apiKey = options.apiKey
    // Default to production API endpoint
    this.ogmiosUrl = options.ogmiosUrl || "wss://api.nacho.builders/v1/ogmios"
    this.onDisconnect = options.onDisconnect
    this.onReconnect = options.onReconnect
  }

  /**
   * Connect to Ogmios WebSocket
   */
  async connect(): Promise<void> {
    if (this.ws?.readyState === WebSocket.OPEN) {
      return
    }

    return new Promise((resolve, reject) => {
      console.log(`[ChainSync] Connecting to ${this.ogmiosUrl}...`)

      this.ws = new WebSocket(this.ogmiosUrl, {
        headers: {
          apikey: this.apiKey,
        },
      })

      const connectTimeout = setTimeout(() => {
        this.ws?.terminate()
        reject(new Error("Connection timeout"))
      }, 30000)

      this.ws.on("open", () => {
        clearTimeout(connectTimeout)
        console.log("[ChainSync] Connected to Ogmios")
        this.reconnectAttempt = 0
        if (this.onReconnect && this.reconnectAttempt > 0) {
          this.onReconnect()
        }
        this.startLatencyMonitor()
        resolve()
      })

      this.ws.on("message", (data) => {
        this.handleMessage(data.toString())
      })

      this.ws.on("error", (error) => {
        console.error("[ChainSync] WebSocket error:", error.message)
      })

      this.ws.on("close", (code, reason) => {
        console.log(`[ChainSync] Connection closed: ${code} - ${reason}`)

        // Reject all pending requests
        for (const [id, pending] of this.pendingRequests) {
          clearTimeout(pending.timeout)
          pending.reject(new Error("Connection closed"))
          this.pendingRequests.delete(id)
        }

        if (!this.isClosing) {
          this.onDisconnect?.()
          this.scheduleReconnect()
        }
      })
    })
  }

  /**
   * Close the connection
   */
  close(): void {
    this.isClosing = true
    this.stopLatencyMonitor()
    this.ws?.close()
    this.ws = null
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return this.ws?.readyState === WebSocket.OPEN
  }

  /**
   * Find intersection with the chain
   * Used to determine where to start syncing from
   */
  async findIntersection(points: IntersectionPoint[]): Promise<FindIntersectionResult> {
    const result = await this.sendRequest<FindIntersectionResult>("findIntersection", {
      points: points.map(p => {
        if ("origin" in p) return "origin"
        return { slot: p.slot, id: p.id }
      }),
    })
    return result
  }

  /**
   * Request the next block in the chain
   * Returns RollForward (new block) or RollBackward (chain reorg)
   */
  async nextBlock(): Promise<NextBlockResult> {
    const result = await this.sendRequest<NextBlockResult>("nextBlock")
    return result
  }

  /**
   * Query the current chain tip with block height
   */
  async queryTip(): Promise<Point & { height: number }> {
    // Ogmios returns tip (slot, id) and blockHeight separately
    const [tip, height] = await Promise.all([
      this.sendRequest<{ slot: number; id: string }>("queryNetwork/tip"),
      this.sendRequest<number>("queryNetwork/blockHeight"),
    ])
    return {
      slot: tip.slot,
      id: tip.id,
      height,
    }
  }

  /**
   * Get the last measured latency in ms
   */
  getLatency(): number | null {
    return this.lastLatency
  }

  /**
   * Start periodic latency monitoring
   */
  private startLatencyMonitor(): void {
    this.stopLatencyMonitor()

    // Check latency immediately
    this.checkLatency()

    // Then check periodically
    this.latencyCheckInterval = setInterval(() => {
      this.checkLatency()
    }, LATENCY_CHECK_INTERVAL)
  }

  /**
   * Stop latency monitoring
   */
  private stopLatencyMonitor(): void {
    if (this.latencyCheckInterval) {
      clearInterval(this.latencyCheckInterval)
      this.latencyCheckInterval = null
    }
  }

  /**
   * Measure round-trip latency using queryNetwork/tip
   */
  private async checkLatency(): Promise<void> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      return
    }

    const start = Date.now()
    try {
      await this.sendRequest<{ slot: number; id: string }>("queryNetwork/tip")
      this.lastLatency = Date.now() - start
      console.log(`[ChainSync] Latency: ${this.lastLatency}ms`)
    } catch (error) {
      console.error(`[ChainSync] Latency check failed: ${(error as Error).message}`)
      this.lastLatency = null
    }
  }

  /**
   * Send a JSON-RPC request and wait for response
   */
  private async sendRequest<T>(method: string, params?: Record<string, unknown>): Promise<T> {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
      throw new Error("Not connected to Ogmios")
    }

    const id = ++this.requestId
    const startTime = Date.now()
    const request: JsonRpcRequest = {
      jsonrpc: "2.0",
      method,
      id,
    }
    if (params) {
      request.params = params
    }

    // nextBlock waits for the next block to be minted (~20s average, but can be longer)
    // Use a longer timeout for it to avoid false timeouts during low block production
    const timeoutMs = method === "nextBlock" ? 180000 : 30000 // 3 min for nextBlock, 30s for others

    return new Promise((resolve, reject) => {
      // Set timeout for this request
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id)
        const elapsed = Date.now() - startTime
        console.warn(`[ChainSync] ${method} timed out after ${elapsed}ms`)
        reject(new Error(`Request timeout: ${method}`))
      }, timeoutMs)

      this.pendingRequests.set(id, {
        resolve: (value: unknown) => {
          resolve(value as T)
        },
        reject: (error: Error) => {
          const elapsed = Date.now() - startTime
          console.error(`[ChainSync] ${method} failed after ${elapsed}ms: ${error.message}`)
          reject(error)
        },
        timeout,
      })

      try {
        this.ws!.send(JSON.stringify(request))
      } catch (error) {
        clearTimeout(timeout)
        this.pendingRequests.delete(id)
        const elapsed = Date.now() - startTime
        console.error(`[ChainSync] ${method} send failed after ${elapsed}ms`)
        reject(error)
      }
    })
  }

  /**
   * Handle incoming WebSocket messages
   */
  private handleMessage(data: string): void {
    try {
      const response: JsonRpcResponse = JSON.parse(data)

      if (response.id !== undefined) {
        const pending = this.pendingRequests.get(response.id as number)
        if (pending) {
          clearTimeout(pending.timeout)
          this.pendingRequests.delete(response.id as number)

          if (response.error) {
            pending.reject(new Error(`${response.error.message} (${response.error.code})`))
          } else {
            pending.resolve(response.result)
          }
        }
      }
    } catch (error) {
      console.error("[ChainSync] Failed to parse message:", error)
    }
  }

  /**
   * Schedule a reconnection attempt with exponential backoff
   */
  private scheduleReconnect(): void {
    const delay = RECONNECT_DELAYS[Math.min(this.reconnectAttempt, RECONNECT_DELAYS.length - 1)]
    this.reconnectAttempt++

    console.log(`[ChainSync] Reconnecting in ${delay / 1000}s (attempt ${this.reconnectAttempt})...`)

    setTimeout(async () => {
      if (!this.isClosing) {
        try {
          await this.connect()
        } catch (error) {
          console.error("[ChainSync] Reconnection failed:", error)
          this.scheduleReconnect()
        }
      }
    }, delay)
  }
}

/**
 * Parse transaction outputs from a block to extract payment information
 */
export function extractTransactionOutputs(block: Block): Array<{
  txHash: string
  outputIndex: number
  address: string
  lovelace: bigint
}> {
  const outputs: Array<{
    txHash: string
    outputIndex: number
    address: string
    lovelace: bigint
  }> = []

  if (!block.transactions) {
    return outputs
  }

  for (const tx of block.transactions) {
    if (!tx.outputs) continue

    for (let i = 0; i < tx.outputs.length; i++) {
      const output = tx.outputs[i]
      if (output.address && output.value?.ada?.lovelace) {
        outputs.push({
          txHash: tx.id,
          outputIndex: i,
          address: output.address,
          lovelace: BigInt(output.value.ada.lovelace),
        })
      }
    }
  }

  return outputs
}
