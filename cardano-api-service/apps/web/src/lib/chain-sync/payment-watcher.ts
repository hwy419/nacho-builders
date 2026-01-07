/**
 * Payment Watcher for Chain Sync
 *
 * Manages pending payment addresses and matches them against incoming blocks.
 * Updates payment status in the database when transactions are detected.
 */

import { prisma } from "@/lib/db"
import type { Block, Point, PendingPayment, PaymentMatch } from "./types"
import { extractTransactionOutputs } from "./client"

const REQUIRED_CONFIRMATIONS = 2
const REFRESH_INTERVAL = 60000 // Refresh watched addresses every 60 seconds

export class PaymentWatcher {
  private watchedAddresses = new Map<string, PendingPayment>()
  private lastRefresh = 0
  private currentBlockHeight = 0

  /**
   * Load pending payments from the database
   */
  async loadPendingPayments(): Promise<void> {
    const now = Date.now()

    // Only refresh if enough time has passed
    if (now - this.lastRefresh < REFRESH_INTERVAL) {
      return
    }

    try {
      const payments = await prisma.payment.findMany({
        where: {
          status: { in: ["PENDING", "CONFIRMING"] },
          expiresAt: { gt: new Date() },
        },
        select: {
          id: true,
          paymentAddress: true,
          amount: true,
          status: true,
          blockHeight: true,
          txHash: true,
          confirmations: true,
          createdAt: true,
          expiresAt: true,
        },
      })

      // Clear and rebuild the map
      this.watchedAddresses.clear()

      for (const payment of payments) {
        this.watchedAddresses.set(payment.paymentAddress, {
          id: payment.id,
          paymentAddress: payment.paymentAddress,
          expectedLovelace: BigInt(payment.amount),
          status: payment.status as "PENDING" | "CONFIRMING",
          blockHeight: payment.blockHeight ? BigInt(payment.blockHeight) : undefined,
          txHash: payment.txHash || undefined,
          confirmations: payment.confirmations,
          createdAt: payment.createdAt,
          expiresAt: payment.expiresAt,
        })
      }

      this.lastRefresh = now
      console.log(`[PaymentWatcher] Watching ${this.watchedAddresses.size} payment addresses`)
    } catch (error) {
      console.error("[PaymentWatcher] Failed to load pending payments:", error)
    }
  }

  /**
   * Process a block and check for matching payments
   */
  processBlock(block: Block): PaymentMatch[] {
    this.currentBlockHeight = block.height
    const matches: PaymentMatch[] = []

    // Extract all transaction outputs from the block
    const outputs = extractTransactionOutputs(block)

    for (const output of outputs) {
      const payment = this.watchedAddresses.get(output.address)

      if (payment) {
        // Check if amount matches (>= expected)
        if (output.lovelace >= payment.expectedLovelace) {
          const isNewTransaction = payment.status === "PENDING"

          matches.push({
            paymentId: payment.id,
            txHash: output.txHash,
            blockHeight: block.height,
            receivedLovelace: output.lovelace,
            isNewTransaction,
          })

          // Update local state
          if (isNewTransaction) {
            payment.status = "CONFIRMING"
            payment.blockHeight = BigInt(block.height)
            payment.txHash = output.txHash
            payment.confirmations = 0
          }

          console.log(
            `[PaymentWatcher] Payment detected! ID: ${payment.id}, ` +
            `TX: ${output.txHash.slice(0, 16)}..., ` +
            `Amount: ${output.lovelace} lovelace`
          )
        }
      }
    }

    return matches
  }

  /**
   * Update confirmations for all CONFIRMING payments
   */
  getConfirmationUpdates(): Array<{
    paymentId: string
    confirmations: number
    isConfirmed: boolean
  }> {
    const updates: Array<{
      paymentId: string
      confirmations: number
      isConfirmed: boolean
    }> = []

    for (const payment of this.watchedAddresses.values()) {
      if (payment.status === "CONFIRMING" && payment.blockHeight) {
        const confirmations = this.currentBlockHeight - Number(payment.blockHeight)

        if (confirmations > payment.confirmations) {
          updates.push({
            paymentId: payment.id,
            confirmations,
            isConfirmed: confirmations >= REQUIRED_CONFIRMATIONS,
          })

          // Update local state
          payment.confirmations = confirmations
        }
      }
    }

    return updates
  }

  /**
   * Handle a chain rollback
   * Reset confirmations for affected payments
   */
  async handleRollback(point: Point): Promise<void> {
    const rollbackHeight = point.slot // Ogmios returns slot, but we track by block height

    console.log(`[PaymentWatcher] Handling rollback to slot ${rollbackHeight}`)

    // For each CONFIRMING payment, check if it was affected
    for (const payment of this.watchedAddresses.values()) {
      if (payment.status === "CONFIRMING" && payment.blockHeight) {
        // Note: This is approximate - we're comparing slot to block height
        // In a production system, you'd want to track slots more precisely
        if (Number(payment.blockHeight) > rollbackHeight) {
          console.log(
            `[PaymentWatcher] Rollback affects payment ${payment.id}, ` +
            `resetting from block ${payment.blockHeight}`
          )

          // Reset the payment to PENDING state
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: "PENDING",
              blockHeight: null,
              txHash: null,
              confirmations: 0,
            },
          })

          // Update local state
          payment.status = "PENDING"
          payment.blockHeight = undefined
          payment.txHash = undefined
          payment.confirmations = 0
        }
      }
    }
  }

  /**
   * Get count of watched addresses
   */
  getWatchedCount(): number {
    return this.watchedAddresses.size
  }

  /**
   * Force refresh of watched addresses
   */
  forceRefresh(): void {
    this.lastRefresh = 0
  }
}

/**
 * Payment Updater - handles database updates for payment status
 */
export class PaymentUpdater {
  /**
   * Mark a payment as CONFIRMING (first detection)
   */
  async markConfirming(
    paymentId: string,
    txHash: string,
    blockHeight: number
  ): Promise<void> {
    try {
      await prisma.payment.update({
        where: { id: paymentId },
        data: {
          status: "CONFIRMING",
          txHash,
          blockHeight: BigInt(blockHeight),
          confirmations: 0,
        },
      })
      console.log(`[PaymentUpdater] Payment ${paymentId} marked as CONFIRMING`)
    } catch (error) {
      console.error(`[PaymentUpdater] Failed to mark payment ${paymentId} as CONFIRMING:`, error)
      throw error
    }
  }

  /**
   * Update confirmation count for a payment
   */
  async updateConfirmations(paymentId: string, confirmations: number): Promise<void> {
    try {
      await prisma.payment.update({
        where: { id: paymentId },
        data: { confirmations },
      })
    } catch (error) {
      console.error(`[PaymentUpdater] Failed to update confirmations for ${paymentId}:`, error)
    }
  }

  /**
   * Mark a payment as CONFIRMED and credit the user
   * Uses a transaction to ensure atomicity
   */
  async markConfirmed(paymentId: string): Promise<void> {
    try {
      // Use a transaction to atomically update payment and credit user
      await prisma.$transaction(async (tx) => {
        // Get the payment details
        const payment = await tx.payment.findUnique({
          where: { id: paymentId },
          select: {
            id: true,
            userId: true,
            credits: true,
            status: true,
          },
        })

        if (!payment) {
          throw new Error(`Payment ${paymentId} not found`)
        }

        if (payment.status === "CONFIRMED") {
          console.log(`[PaymentUpdater] Payment ${paymentId} already confirmed, skipping`)
          return
        }

        // Update payment status
        await tx.payment.update({
          where: { id: paymentId },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        })

        // Credit the user
        await tx.user.update({
          where: { id: payment.userId },
          data: {
            credits: {
              increment: payment.credits,
            },
          },
        })

        console.log(
          `[PaymentUpdater] Payment ${paymentId} CONFIRMED! ` +
          `Credited ${payment.credits} credits to user ${payment.userId}`
        )
      })
    } catch (error) {
      console.error(`[PaymentUpdater] Failed to confirm payment ${paymentId}:`, error)
      throw error
    }
  }
}
