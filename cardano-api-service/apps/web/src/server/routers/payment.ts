/**
 * Payment Router - tRPC procedures for Cardano payment handling
 *
 * Provides endpoints for:
 * - Creating new payments with HD-derived addresses
 * - Checking payment status via Ogmios
 * - Listing user payment history
 * - Getting available credit packages
 */

import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure, publicProcedure } from "../trpc"
import { prisma } from "@/lib/db"
import { getAdaUsdRate, calculateUsdValue } from "@/lib/coingecko"
import { PaymentStatus } from "@prisma/client"
import { sendAdminPaymentPendingEmail } from "@/lib/email"

// Dynamic import to avoid bundling WASM files during build
async function generateUniquePaymentAddress(userId: string) {
  const { generateUniquePaymentAddress: generate } = await import("@/lib/cardano/hdwallet")
  return generate(userId)
}

/**
 * Calculate credits including any bonus for a package
 */
function calculateCreditsWithBonus(baseCredits: number, bonusPercent: number): number {
  const bonus = Math.floor(baseCredits * (bonusPercent / 100))
  return baseCredits + bonus
}

export const paymentRouter = router({
  /**
   * Get available credit packages
   */
  getPackages: publicProcedure.query(async () => {
    const packages = await prisma.creditPackage.findMany({
      where: { active: true },
      orderBy: { displayOrder: "asc" },
    })

    return packages.map((pkg) => ({
      id: pkg.id,
      name: pkg.name,
      credits: pkg.credits,
      adaPrice: Number(pkg.adaPrice),
      bonusPercent: pkg.bonusPercent,
      popular: pkg.popular,
      totalCredits: calculateCreditsWithBonus(pkg.credits, pkg.bonusPercent),
    }))
  }),

  /**
   * Create a new payment request
   * Generates a unique HD-derived address for the payment
   */
  create: protectedProcedure
    .input(
      z.object({
        packageId: z.string().optional(),
        packageName: z.string().optional(),
        adaAmount: z.number().positive().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Get package details or use custom amount
      let credits: number
      let adaAmount: number
      let bonusPercent: number = 0
      let packageName: string | null = null

      if (input.packageId) {
        const pkg = await prisma.creditPackage.findUnique({
          where: { id: input.packageId },
        })

        if (!pkg || !pkg.active) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Credit package not found or inactive",
          })
        }

        credits = pkg.credits
        adaAmount = Number(pkg.adaPrice)
        bonusPercent = pkg.bonusPercent
        packageName = pkg.name
      } else if (input.packageName) {
        const pkg = await prisma.creditPackage.findUnique({
          where: { name: input.packageName },
        })

        if (!pkg || !pkg.active) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Credit package not found or inactive",
          })
        }

        credits = pkg.credits
        adaAmount = Number(pkg.adaPrice)
        bonusPercent = pkg.bonusPercent
        packageName = pkg.name
      } else if (input.adaAmount) {
        // Custom amount - calculate credits at base rate (10,000 credits per ADA)
        adaAmount = input.adaAmount
        credits = Math.floor(adaAmount * 10000)
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Must provide packageId, packageName, or adaAmount",
        })
      }

      // Check for existing pending payment for this user
      const existingPending = await prisma.payment.findFirst({
        where: {
          userId,
          status: PaymentStatus.PENDING,
          expiresAt: { gt: new Date() },
        },
      })

      if (existingPending) {
        // Return the existing pending payment
        return {
          id: existingPending.id,
          paymentAddress: existingPending.paymentAddress,
          amount: Number(existingPending.amount),
          adaAmount: Number(existingPending.amount) / 1_000_000,
          credits: existingPending.credits,
          bonusPercent: existingPending.bonusPercent,
          packageName: existingPending.packageName,
          expiresAt: existingPending.expiresAt,
          status: existingPending.status,
          isExisting: true,
        }
      }

      // Generate unique payment address
      const { address, addressIndex } = await generateUniquePaymentAddress(userId)

      // Convert ADA to lovelace
      const lovelaceAmount = BigInt(Math.floor(adaAmount * 1_000_000))

      // Calculate total credits with bonus
      const totalCredits = calculateCreditsWithBonus(credits, bonusPercent)

      // Calculate price per credit
      const pricePerCredit = adaAmount / totalCredits

      // Fetch current ADA/USD exchange rate (non-blocking)
      const adaUsdRate = await getAdaUsdRate()
      const usdValue = adaUsdRate ? calculateUsdValue(adaAmount, adaUsdRate) : null

      // Create payment record with 24-hour expiry
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000)

      const payment = await prisma.payment.create({
        data: {
          userId,
          amount: lovelaceAmount,
          credits: totalCredits,
          pricePerCredit,
          adaUsdRate,
          usdValue,
          packageName,
          bonusPercent,
          paymentAddress: address,
          addressIndex,
          expiresAt,
          status: PaymentStatus.PENDING,
        },
      })

      // Send admin notification for new payment (non-blocking)
      sendAdminPaymentPendingEmail(
        ctx.session.user.email!,
        Number(lovelaceAmount) / 1_000_000,
        totalCredits,
        address
      ).catch((err) => {
        console.error("Failed to send admin payment pending email:", err)
      })

      return {
        id: payment.id,
        paymentAddress: payment.paymentAddress,
        amount: Number(payment.amount),
        adaAmount: Number(payment.amount) / 1_000_000,
        credits: payment.credits,
        bonusPercent: payment.bonusPercent,
        packageName: payment.packageName,
        expiresAt: payment.expiresAt,
        status: payment.status,
        isExisting: false,
      }
    }),

  /**
   * Check the status of a payment
   *
   * Reads current status from database. Blockchain monitoring is handled by:
   * - Chain Sync monitor (real-time, updates DB when payments detected)
   * - Cron job (backup, processes payments older than 30 minutes)
   */
  checkStatus: protectedProcedure
    .input(
      z.object({
        paymentId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      const payment = await prisma.payment.findFirst({
        where: {
          id: input.paymentId,
          userId,
        },
      })

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found",
        })
      }

      // Check if expired (for PENDING payments only)
      if (payment.status === PaymentStatus.PENDING && payment.expiresAt < new Date()) {
        await prisma.payment.update({
          where: { id: payment.id },
          data: {
            status: PaymentStatus.EXPIRED,
            statusMessage: "Payment window expired",
          },
        })

        return {
          id: payment.id,
          status: PaymentStatus.EXPIRED,
          txHash: null,
          confirmations: 0,
          confirmedAt: null,
          credits: payment.credits,
        }
      }

      // Return current status from database
      // Chain Sync monitor and cron job handle blockchain monitoring
      return {
        id: payment.id,
        status: payment.status,
        txHash: payment.txHash,
        confirmations: payment.confirmations,
        confirmedAt: payment.confirmedAt,
        credits: payment.credits,
      }
    }),

  /**
   * Get a specific payment by ID
   */
  get: protectedProcedure
    .input(
      z.object({
        paymentId: z.string(),
      })
    )
    .query(async ({ ctx, input }) => {
      const payment = await prisma.payment.findFirst({
        where: {
          id: input.paymentId,
          userId: ctx.session.user.id,
        },
      })

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Payment not found",
        })
      }

      return {
        id: payment.id,
        paymentAddress: payment.paymentAddress,
        amount: Number(payment.amount),
        adaAmount: Number(payment.amount) / 1_000_000,
        credits: payment.credits,
        bonusPercent: payment.bonusPercent,
        packageName: payment.packageName,
        expiresAt: payment.expiresAt,
        status: payment.status,
        txHash: payment.txHash,
        confirmations: payment.confirmations,
        confirmedAt: payment.confirmedAt,
        createdAt: payment.createdAt,
      }
    }),

  /**
   * List user's payment history
   */
  list: protectedProcedure
    .input(
      z
        .object({
          limit: z.number().min(1).max(100).default(20),
          cursor: z.string().optional(),
          status: z.nativeEnum(PaymentStatus).optional(),
        })
        .optional()
    )
    .query(async ({ ctx, input }) => {
      const limit = input?.limit ?? 20
      const cursor = input?.cursor
      const status = input?.status

      const payments = await prisma.payment.findMany({
        where: {
          userId: ctx.session.user.id,
          ...(status && { status }),
        },
        orderBy: { createdAt: "desc" },
        take: limit + 1,
        ...(cursor && {
          cursor: { id: cursor },
          skip: 1,
        }),
      })

      let nextCursor: string | undefined
      if (payments.length > limit) {
        const nextItem = payments.pop()
        nextCursor = nextItem?.id
      }

      return {
        payments: payments.map((p) => ({
          id: p.id,
          amount: Number(p.amount),
          adaAmount: Number(p.amount) / 1_000_000,
          credits: p.credits,
          packageName: p.packageName,
          bonusPercent: p.bonusPercent,
          status: p.status,
          txHash: p.txHash,
          confirmations: p.confirmations,
          createdAt: p.createdAt,
          confirmedAt: p.confirmedAt,
        })),
        nextCursor,
      }
    }),

  /**
   * Cancel a pending payment
   */
  cancel: protectedProcedure
    .input(
      z.object({
        paymentId: z.string(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const payment = await prisma.payment.findFirst({
        where: {
          id: input.paymentId,
          userId: ctx.session.user.id,
          status: PaymentStatus.PENDING,
        },
      })

      if (!payment) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Pending payment not found",
        })
      }

      await prisma.payment.update({
        where: { id: payment.id },
        data: {
          status: PaymentStatus.EXPIRED,
          statusMessage: "Cancelled by user",
        },
      })

      return { success: true }
    }),
})
