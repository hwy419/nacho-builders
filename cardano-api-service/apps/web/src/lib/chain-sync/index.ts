/**
 * Chain Sync Payment Monitor
 *
 * Main entry point for the Chain Sync-based payment monitoring system.
 * Uses the platform's own Ogmios API to monitor the Cardano blockchain
 * in real-time for incoming payments.
 *
 * This serves as a showcase of what customers can build with the API.
 */

import { ChainSyncClient } from "./client"
import { PaymentWatcher, PaymentUpdater } from "./payment-watcher"
import type { ChainSyncState, RollForward, RollBackward } from "./types"

// Configuration
const WEBSITE_API_KEY = process.env.WEBSITE_API_KEY
const OGMIOS_URL = process.env.OGMIOS_URL || "wss://api.nacho.builders/v1/ogmios"
const ADDRESS_REFRESH_INTERVAL = 60000 // Refresh watched addresses every 60 seconds
const STATS_LOG_INTERVAL = 300000 // Log stats every 5 minutes

/**
 * Main Chain Sync Payment Monitor
 *
 * Connects to Ogmios via the platform's API and monitors the blockchain
 * for payments to watched addresses. Automatically handles reconnection
 * and chain rollbacks.
 */
export class ChainSyncPaymentMonitor {
  private client: ChainSyncClient
  private watcher: PaymentWatcher
  private updater: PaymentUpdater
  private isRunning = false
  private state: ChainSyncState = {
    connected: false,
    currentTip: null,
    lastProcessedSlot: null,
    blocksProcessed: 0,
    paymentsDetected: 0,
    errors: 0,
    startedAt: null,
  }

  constructor() {
    if (!WEBSITE_API_KEY) {
      throw new Error("WEBSITE_API_KEY environment variable is required")
    }

    this.client = new ChainSyncClient({
      apiKey: WEBSITE_API_KEY,
      ogmiosUrl: OGMIOS_URL,
      onDisconnect: () => this.handleDisconnect(),
      onReconnect: () => this.handleReconnect(),
    })

    this.watcher = new PaymentWatcher()
    this.updater = new PaymentUpdater()
  }

  /**
   * Start the payment monitor
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      console.log("[ChainSyncMonitor] Already running")
      return
    }

    console.log("[ChainSyncMonitor] Starting payment monitor...")
    this.isRunning = true
    this.state.startedAt = new Date()

    try {
      // Connect to Ogmios
      await this.client.connect()
      this.state.connected = true

      // Get current chain tip
      const tip = await this.client.queryTip()
      console.log(`[ChainSyncMonitor] Current chain tip: slot ${tip.slot}`)

      // Find intersection at current tip (start from now, not genesis)
      const intersection = await this.client.findIntersection([
        { slot: tip.slot, id: tip.id },
      ])

      if (intersection.intersection) {
        console.log(
          `[ChainSyncMonitor] Starting from slot ${intersection.intersection.slot}`
        )
        this.state.currentTip = intersection.tip
      } else {
        console.log("[ChainSyncMonitor] Starting from origin")
      }

      // Load initial pending payments
      await this.watcher.loadPendingPayments()
      console.log(
        `[ChainSyncMonitor] Watching ${this.watcher.getWatchedCount()} payment addresses`
      )

      // Start the main sync loop
      this.runSyncLoop()

      // Start periodic stats logging
      this.startStatsLogging()
    } catch (error) {
      console.error("[ChainSyncMonitor] Failed to start:", error)
      this.state.errors++
      this.isRunning = false
      throw error
    }
  }

  /**
   * Stop the payment monitor
   */
  stop(): void {
    console.log("[ChainSyncMonitor] Stopping payment monitor...")
    this.isRunning = false
    this.client.close()
    this.state.connected = false
  }

  /**
   * Get current monitor state
   */
  getState(): ChainSyncState {
    return { ...this.state }
  }

  /**
   * Main sync loop - processes blocks as they arrive
   */
  private async runSyncLoop(): Promise<void> {
    while (this.isRunning) {
      try {
        // Ensure we're connected
        if (!this.client.isConnected()) {
          console.log("[ChainSyncMonitor] Reconnecting...")
          await this.reconnectAndResync()
          continue
        }

        // Refresh watched addresses periodically
        await this.watcher.loadPendingPayments()

        // Request next block
        const result = await this.client.nextBlock()

        if (result.direction === "forward") {
          await this.handleRollForward(result as RollForward)
        } else {
          await this.handleRollBackward(result as RollBackward)
        }
      } catch (error) {
        const errorMessage = (error as Error).message || "Unknown error"
        console.error("[ChainSyncMonitor] Error in sync loop:", errorMessage)
        this.state.errors++

        // On timeout or connection errors, reconnect and re-sync
        if (errorMessage.includes("timeout") || errorMessage.includes("Not connected")) {
          console.log("[ChainSyncMonitor] Connection issue detected, will reconnect...")
          this.client.close()
          await this.sleep(2000)
        } else {
          // For other errors, just wait and retry
          await this.sleep(5000)
        }
      }
    }

    console.log("[ChainSyncMonitor] Sync loop ended")
  }

  /**
   * Reconnect to Ogmios and re-establish sync from last known point
   */
  private async reconnectAndResync(): Promise<void> {
    try {
      await this.client.connect()
      this.state.connected = true

      // Get current chain tip
      const tip = await this.client.queryTip()
      console.log(`[ChainSyncMonitor] Reconnected, chain tip: slot ${tip.slot}, height ${tip.height}`)

      // Find intersection - start from current tip to avoid re-processing old blocks
      // This means we might miss blocks during the disconnection, but the cron job
      // will catch any payments older than 30 minutes
      const intersection = await this.client.findIntersection([
        { slot: tip.slot, id: tip.id },
      ])

      if (intersection.intersection) {
        console.log(
          `[ChainSyncMonitor] Re-syncing from slot ${intersection.intersection.slot}`
        )
        this.state.currentTip = intersection.tip
      }

      // Force refresh watched addresses after reconnect
      this.watcher.forceRefresh()
      await this.watcher.loadPendingPayments()
    } catch (error) {
      console.error("[ChainSyncMonitor] Reconnection failed:", error)
      this.state.connected = false
      await this.sleep(5000)
    }
  }

  /**
   * Handle a new block (RollForward)
   */
  private async handleRollForward(result: RollForward): Promise<void> {
    const block = result.block

    // Update state
    this.state.currentTip = result.tip
    this.state.lastProcessedSlot = block.slot
    this.state.blocksProcessed++

    // Log block processing (every 10th block to avoid spam)
    if (this.state.blocksProcessed % 10 === 0 || this.state.blocksProcessed <= 3) {
      console.log(
        `[ChainSyncMonitor] Block ${block.height} (slot ${block.slot}), ` +
        `${block.transactions?.length || 0} txs, ` +
        `watching ${this.watcher.getWatchedCount()} addresses`
      )
    }

    // Skip if no transactions or no watched addresses
    if (!block.transactions?.length || this.watcher.getWatchedCount() === 0) {
      return
    }

    // Process block for payment matches
    const matches = this.watcher.processBlock(block)

    // Handle new transaction detections
    for (const match of matches) {
      if (match.isNewTransaction) {
        try {
          await this.updater.markConfirming(
            match.paymentId,
            match.txHash,
            match.blockHeight
          )
          this.state.paymentsDetected++
        } catch (error) {
          console.error(
            `[ChainSyncMonitor] Failed to mark payment ${match.paymentId} as confirming:`,
            error
          )
          this.state.errors++
        }
      }
    }

    // Update confirmation counts for all CONFIRMING payments
    const confirmationUpdates = this.watcher.getConfirmationUpdates()

    for (const update of confirmationUpdates) {
      try {
        if (update.isConfirmed) {
          // Mark as fully confirmed and credit user
          await this.updater.markConfirmed(update.paymentId)
          console.log(
            `[ChainSyncMonitor] Payment ${update.paymentId} fully confirmed with ${update.confirmations} confirmations`
          )
        } else {
          // Just update confirmation count
          await this.updater.updateConfirmations(
            update.paymentId,
            update.confirmations
          )
        }
      } catch (error) {
        console.error(
          `[ChainSyncMonitor] Failed to update confirmations for ${update.paymentId}:`,
          error
        )
        this.state.errors++
      }
    }
  }

  /**
   * Handle a chain rollback (RollBackward)
   */
  private async handleRollBackward(result: RollBackward): Promise<void> {
    console.log(
      `[ChainSyncMonitor] Rollback detected to slot ${result.point.slot}`
    )

    // Update state
    this.state.currentTip = result.tip
    this.state.lastProcessedSlot = result.point.slot

    // Handle rollback in payment watcher
    try {
      await this.watcher.handleRollback(result.point)
    } catch (error) {
      console.error("[ChainSyncMonitor] Failed to handle rollback:", error)
      this.state.errors++
    }
  }

  /**
   * Handle WebSocket disconnection
   */
  private handleDisconnect(): void {
    console.log("[ChainSyncMonitor] Disconnected from Ogmios")
    this.state.connected = false
  }

  /**
   * Handle WebSocket reconnection
   */
  private handleReconnect(): void {
    console.log("[ChainSyncMonitor] Reconnected to Ogmios")
    this.state.connected = true
    this.watcher.forceRefresh()
  }

  /**
   * Start periodic stats logging
   */
  private startStatsLogging(): void {
    setInterval(() => {
      if (this.isRunning) {
        console.log(
          `[ChainSyncMonitor] Stats: ` +
            `connected=${this.state.connected}, ` +
            `blocks=${this.state.blocksProcessed}, ` +
            `payments=${this.state.paymentsDetected}, ` +
            `errors=${this.state.errors}, ` +
            `watching=${this.watcher.getWatchedCount()} addresses`
        )
      }
    }, STATS_LOG_INTERVAL)
  }

  /**
   * Sleep helper
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms))
  }
}

// Singleton instance
let monitorInstance: ChainSyncPaymentMonitor | null = null

/**
 * Start the Chain Sync payment monitor
 * Called from instrumentation.ts on server startup
 */
export async function startChainSyncMonitor(): Promise<void> {
  if (!process.env.WEBSITE_API_KEY) {
    console.log(
      "[ChainSyncMonitor] WEBSITE_API_KEY not set, skipping Chain Sync monitor"
    )
    return
  }

  if (!process.env.CHAIN_SYNC_ENABLED || process.env.CHAIN_SYNC_ENABLED !== "true") {
    console.log(
      "[ChainSyncMonitor] Chain Sync disabled (set CHAIN_SYNC_ENABLED=true to enable)"
    )
    return
  }

  if (monitorInstance) {
    console.log("[ChainSyncMonitor] Monitor already running")
    return
  }

  try {
    monitorInstance = new ChainSyncPaymentMonitor()
    await monitorInstance.start()
  } catch (error) {
    console.error("[ChainSyncMonitor] Failed to start monitor:", error)
    monitorInstance = null
  }
}

/**
 * Stop the Chain Sync payment monitor
 */
export function stopChainSyncMonitor(): void {
  if (monitorInstance) {
    monitorInstance.stop()
    monitorInstance = null
  }
}

/**
 * Get monitor state (for health checks)
 */
export function getChainSyncMonitorState(): ChainSyncState | null {
  return monitorInstance?.getState() ?? null
}
