/**
 * DB-Sync Payment Monitor Job
 *
 * Fast payment monitoring using DB-Sync PostgreSQL queries.
 * ~150x faster than Ogmios-based monitoring (175ms vs 27s per query).
 *
 * Should be triggered every 2 seconds for responsive payment detection.
 *
 * Process:
 * 1. Query all PENDING and CONFIRMING payments
 * 2. Check each payment address via DB-Sync SQL
 * 3. Update payment status when transaction is found
 * 4. Credit user account when confirmations reach threshold
 * 5. Mark expired payments as EXPIRED
 */

import { prisma } from "@/lib/db"
import { PaymentStatus } from "@prisma/client"
import {
  queryDBSyncTip,
  queryDBSyncUtxos,
  type DBSyncUTxO,
} from "@/lib/cardano/dbsync"
import { sendPaymentConfirmationEmail, sendAdminPaymentConfirmedEmail } from "@/lib/email"

// Number of confirmations required before crediting account
const REQUIRED_CONFIRMATIONS = 2

// Maximum number of payments to process in one run
const BATCH_SIZE = 100

export interface DBSyncMonitorResult {
  processed: number
  confirmed: number
  confirming: number
  expired: number
  failed: number
  durationMs: number
  errors: string[]
}

/**
 * Monitor and process pending payments using DB-Sync
 *
 * @returns Summary of processed payments
 */
export async function monitorPendingPaymentsDBSync(): Promise<DBSyncMonitorResult> {
  const startTime = Date.now()
  const result: DBSyncMonitorResult = {
    processed: 0,
    confirmed: 0,
    confirming: 0,
    expired: 0,
    failed: 0,
    durationMs: 0,
    errors: [],
  }

  const now = new Date()

  try {
    // Get payments that need checking (include user info for email notifications)
    const payments = await prisma.payment.findMany({
      where: {
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.CONFIRMING],
        },
      },
      include: {
        user: {
          select: { email: true, name: true },
        },
      },
      take: BATCH_SIZE,
      orderBy: { createdAt: "asc" }, // Process oldest first
    })

    if (payments.length === 0) {
      result.durationMs = Date.now() - startTime
      return result
    }

    // Get current block height from DB-Sync
    let currentTip
    try {
      currentTip = await queryDBSyncTip()
    } catch (error) {
      result.errors.push(`Failed to get DB-Sync tip: ${error instanceof Error ? error.message : 'Unknown error'}`)
      result.durationMs = Date.now() - startTime
      return result
    }

    // Process each payment
    for (const payment of payments) {
      result.processed++

      try {
        // Check if payment has expired (only for PENDING)
        if (payment.status === PaymentStatus.PENDING && payment.expiresAt < now) {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: PaymentStatus.EXPIRED,
              statusMessage: "Payment window expired",
            },
          })
          result.expired++
          continue
        }

        // Query UTxOs at this payment address via DB-Sync
        const utxos = await queryDBSyncUtxos(payment.paymentAddress)

        if (utxos.length === 0) {
          // No UTxOs found - payment not yet received
          continue
        }

        // Calculate total received at this address
        const totalReceived = utxos.reduce(
          (sum, utxo) => sum + utxo.value,
          BigInt(0)
        )

        // Check if we received at least the expected amount
        if (totalReceived < payment.amount) {
          // Partial payment received - might want to handle this specially
          continue
        }

        // Payment found - get the transaction details from the first UTxO
        const txUtxo = utxos[0] // Sorted by block_no DESC, so first is most recent
        const txHash = txUtxo.txHash
        const txBlockNo = txUtxo.blockNo

        // Calculate confirmations using actual block height
        const confirmations = currentTip.blockNo - txBlockNo

        if (payment.status === PaymentStatus.PENDING) {
          // First time detecting this payment - mark as CONFIRMING
          if (confirmations >= REQUIRED_CONFIRMATIONS) {
            // Already has enough confirmations - go straight to CONFIRMED
            await prisma.$transaction([
              prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: PaymentStatus.CONFIRMED,
                  txHash,
                  blockHeight: BigInt(txBlockNo),
                  confirmations,
                  confirmedAt: new Date(),
                  statusMessage: "Payment confirmed and credits added",
                },
              }),
              prisma.user.update({
                where: { id: payment.userId },
                data: {
                  credits: { increment: payment.credits },
                },
              }),
            ])

            // Send confirmation email (non-blocking)
            const adaAmount = Number(payment.amount) / 1_000_000
            sendPaymentConfirmationEmail(
              payment.user.email,
              payment.user.name,
              payment.credits,
              adaAmount,
              txHash
            ).catch((err) => {
              console.error(`Failed to send confirmation email for payment ${payment.id}:`, err)
            })

            // Send admin notification (non-blocking)
            sendAdminPaymentConfirmedEmail(
              payment.user.email,
              adaAmount,
              payment.credits,
              txHash
            ).catch((err) => {
              console.error("Failed to send admin payment confirmed email:", err)
            })

            console.log(`[DBSyncMonitor] Payment ${payment.id} instantly CONFIRMED with ${confirmations} confirmations`)
            result.confirmed++
          } else {
            // Needs more confirmations
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                status: PaymentStatus.CONFIRMING,
                txHash,
                blockHeight: BigInt(txBlockNo),
                confirmations,
                statusMessage: `Payment detected, waiting for confirmations (${confirmations}/${REQUIRED_CONFIRMATIONS})`,
              },
            })
            console.log(`[DBSyncMonitor] Payment ${payment.id} detected at block ${txBlockNo}, ${confirmations} confirmations`)
            result.confirming++
          }
        } else if (payment.status === PaymentStatus.CONFIRMING) {
          // Already detected - check if we have enough confirmations now
          if (confirmations >= REQUIRED_CONFIRMATIONS) {
            // Fully confirmed - credit the user
            await prisma.$transaction([
              prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: PaymentStatus.CONFIRMED,
                  txHash,
                  confirmations,
                  confirmedAt: new Date(),
                  statusMessage: "Payment confirmed and credits added",
                },
              }),
              prisma.user.update({
                where: { id: payment.userId },
                data: {
                  credits: { increment: payment.credits },
                },
              }),
            ])

            // Send confirmation email (non-blocking)
            const adaAmount = Number(payment.amount) / 1_000_000
            sendPaymentConfirmationEmail(
              payment.user.email,
              payment.user.name,
              payment.credits,
              adaAmount,
              txHash
            ).catch((err) => {
              console.error(`Failed to send confirmation email for payment ${payment.id}:`, err)
            })

            // Send admin notification (non-blocking)
            sendAdminPaymentConfirmedEmail(
              payment.user.email,
              adaAmount,
              payment.credits,
              txHash
            ).catch((err) => {
              console.error("Failed to send admin payment confirmed email:", err)
            })

            console.log(`[DBSyncMonitor] Payment ${payment.id} CONFIRMED with ${confirmations} confirmations`)
            result.confirmed++
          } else {
            // Still confirming - update count
            await prisma.payment.update({
              where: { id: payment.id },
              data: {
                confirmations,
                statusMessage: `Waiting for confirmations (${confirmations}/${REQUIRED_CONFIRMATIONS})`,
              },
            })
            result.confirming++
          }
        }
      } catch (error) {
        result.failed++
        result.errors.push(
          `Error processing payment ${payment.id}: ${error instanceof Error ? error.message : 'Unknown error'}`
        )

        // Update payment with error status
        try {
          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              statusMessage: `Processing error: ${error instanceof Error ? error.message : 'Unknown error'}`,
            },
          })
        } catch {
          // Ignore update errors
        }
      }
    }

    result.durationMs = Date.now() - startTime
    return result
  } catch (error) {
    result.errors.push(`Monitor job error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    result.durationMs = Date.now() - startTime
    return result
  }
}

/**
 * Expire old pending payments
 */
export async function expireOldPaymentsDBSync(): Promise<number> {
  const result = await prisma.payment.updateMany({
    where: {
      status: PaymentStatus.PENDING,
      expiresAt: { lt: new Date() },
    },
    data: {
      status: PaymentStatus.EXPIRED,
      statusMessage: "Payment window expired",
    },
  })

  return result.count
}

/**
 * Get payment statistics
 */
export async function getPaymentStatsDBSync(): Promise<{
  pending: number
  confirming: number
  totalPendingAda: number
}> {
  const [pending, confirming, totalPending] = await Promise.all([
    prisma.payment.count({
      where: { status: PaymentStatus.PENDING },
    }),
    prisma.payment.count({
      where: { status: PaymentStatus.CONFIRMING },
    }),
    prisma.payment.aggregate({
      where: {
        status: { in: [PaymentStatus.PENDING, PaymentStatus.CONFIRMING] },
      },
      _sum: { amount: true },
    }),
  ])

  return {
    pending,
    confirming,
    totalPendingAda: totalPending._sum.amount
      ? Number(totalPending._sum.amount) / 1_000_000
      : 0,
  }
}
