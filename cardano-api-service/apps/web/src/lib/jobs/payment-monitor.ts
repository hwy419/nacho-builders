/**
 * Payment Monitor Job
 *
 * Background job that monitors pending payments via Ogmios.
 * Should be triggered periodically (e.g., every minute via cron)
 *
 * Process:
 * 1. Query all PENDING and CONFIRMING payments that haven't expired
 * 2. Check each payment address for UTxOs via Ogmios
 * 3. Update payment status when transaction is found
 * 4. Credit user account when confirmations reach threshold
 * 5. Mark expired payments as EXPIRED
 */

import { prisma } from "@/lib/db"
import { PaymentStatus } from "@prisma/client"
import { getOgmiosClient, type UTxO } from "@/lib/cardano/ogmios"
import { sendPaymentConfirmationEmail } from "@/lib/email"

// Number of confirmations required before crediting account
const REQUIRED_CONFIRMATIONS = 2

// Maximum number of payments to process in one run
const BATCH_SIZE = 50

// Grace period for Chain Sync - only process payments older than this via cron
// When Chain Sync is enabled, it handles newer payments in real-time
// Reduced to 5 minutes to catch any payments missed during Chain Sync reconnections
const CHAIN_SYNC_GRACE_PERIOD = 5 * 60 * 1000 // 5 minutes

export interface MonitorResult {
  processed: number
  confirmed: number
  confirming: number
  expired: number
  failed: number
  errors: string[]
}

/**
 * Monitor and process pending payments
 *
 * @returns Summary of processed payments
 */
export async function monitorPendingPayments(): Promise<MonitorResult> {
  const result: MonitorResult = {
    processed: 0,
    confirmed: 0,
    confirming: 0,
    expired: 0,
    failed: 0,
    errors: [],
  }

  const now = new Date()

  try {
    // Build where clause - if Chain Sync is enabled, only process older payments
    // Chain Sync handles newer payments in real-time
    const chainSyncEnabled = process.env.CHAIN_SYNC_ENABLED === "true"
    const graceDate = new Date(Date.now() - CHAIN_SYNC_GRACE_PERIOD)

    // Get payments that need checking (include user info for email notifications)
    const payments = await prisma.payment.findMany({
      where: {
        status: {
          in: [PaymentStatus.PENDING, PaymentStatus.CONFIRMING],
        },
        // When Chain Sync is enabled, only process payments older than 30 minutes
        // This serves as a backup for any payments missed by Chain Sync
        ...(chainSyncEnabled && {
          createdAt: { lt: graceDate },
        }),
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
      return result
    }

    if (chainSyncEnabled) {
      console.log(`[PaymentMonitor] Processing ${payments.length} payments older than 30 minutes (Chain Sync backup mode)`)
    }

    // Get Ogmios client
    const ogmios = getOgmiosClient()

    // Get current block height once for all payments
    let currentHeight: number
    try {
      const tip = await ogmios.queryTip()
      currentHeight = tip.height
    } catch (error) {
      result.errors.push(`Failed to get chain tip: ${error instanceof Error ? error.message : 'Unknown error'}`)
      return result
    }

    // Collect all unique addresses to query at once
    const addresses = [...new Set(payments.map((p) => p.paymentAddress))]

    // Query all addresses at once for efficiency
    let utxosByAddress: Map<string, UTxO[]>
    try {
      const allUtxos = await ogmios.queryUtxosByAddresses(addresses)
      utxosByAddress = new Map()

      for (const utxo of allUtxos) {
        const existing = utxosByAddress.get(utxo.address) || []
        existing.push(utxo)
        utxosByAddress.set(utxo.address, existing)
      }
    } catch (error) {
      result.errors.push(`Failed to query UTxOs: ${error instanceof Error ? error.message : 'Unknown error'}`)
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

        // Get UTxOs for this payment address
        const utxos = utxosByAddress.get(payment.paymentAddress) || []

        if (utxos.length === 0) {
          // No UTxOs found - payment not yet received
          continue
        }

        // Calculate total received at this address
        // Note: lovelace comes as number from JSON parsing, convert to BigInt
        // Use optional chaining for safety
        const totalReceived = utxos.reduce(
          (sum, utxo) => {
            const lovelace = utxo.value?.ada?.lovelace
            return sum + (lovelace !== undefined ? BigInt(lovelace) : BigInt(0))
          },
          BigInt(0)
        )

        // Check if we received at least the expected amount
        if (totalReceived < payment.amount) {
          // Partial payment received - might want to handle this specially
          continue
        }

        // Payment found - get the transaction hash
        const txHash = utxos[0].transaction.id

        // Determine confirmation status
        let newStatus: PaymentStatus
        let confirmations: number

        if (!payment.blockHeight) {
          // First time detecting this payment
          newStatus = PaymentStatus.CONFIRMING
          confirmations = 0

          await prisma.payment.update({
            where: { id: payment.id },
            data: {
              status: newStatus,
              txHash,
              blockHeight: BigInt(currentHeight),
              confirmations,
              statusMessage: "Payment detected, waiting for confirmations",
            },
          })
          result.confirming++
        } else {
          // Already detected - check confirmations
          confirmations = currentHeight - Number(payment.blockHeight)

          if (confirmations >= REQUIRED_CONFIRMATIONS) {
            // Fully confirmed - credit the user
            newStatus = PaymentStatus.CONFIRMED

            await prisma.$transaction([
              // Update payment status
              prisma.payment.update({
                where: { id: payment.id },
                data: {
                  status: newStatus,
                  txHash,
                  confirmations,
                  confirmedAt: new Date(),
                  statusMessage: "Payment confirmed and credits added",
                },
              }),
              // Credit the user's account
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

            result.confirmed++
          } else {
            // Still confirming
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

        // Update payment with error status if it's a persistent failure
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

    return result
  } catch (error) {
    result.errors.push(`Monitor job error: ${error instanceof Error ? error.message : 'Unknown error'}`)
    return result
  }
}

/**
 * Expire old pending payments that have passed their expiry time
 *
 * @returns Number of payments expired
 */
export async function expireOldPayments(): Promise<number> {
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
 * Get statistics about pending payments
 */
export async function getPaymentStats(): Promise<{
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
