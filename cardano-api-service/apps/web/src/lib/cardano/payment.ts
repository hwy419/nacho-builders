/**
 * Payment utilities for Cardano payments
 *
 * This module provides helper functions for payment calculations.
 * HD wallet derivation is handled by hdwallet.ts
 * Blockchain queries are handled by ogmios.ts
 */

import { prisma } from "../db"
import { generateUniquePaymentAddress } from "./hdwallet"
import { PaymentStatus } from "@prisma/client"

/**
 * Credit package configuration
 */
export interface CreditPackage {
  name: string
  ada: number
  credits: number
  bonus: number
}

/**
 * Default credit packages (should match database)
 */
export const DEFAULT_PACKAGES: CreditPackage[] = [
  { name: "Small", ada: 5, credits: 50000, bonus: 0 },
  { name: "Medium", ada: 18, credits: 200000, bonus: 10 },
  { name: "Large", ada: 40, credits: 500000, bonus: 15 },
  { name: "Bulk", ada: 75, credits: 1000000, bonus: 20 },
]

/**
 * Calculate total credits including bonus
 */
export function calculateCreditsWithBonus(baseCredits: number, bonusPercent: number): number {
  const bonus = Math.floor(baseCredits * (bonusPercent / 100))
  return baseCredits + bonus
}

/**
 * Calculate credits for a given ADA amount
 *
 * @param adaAmount - Amount in ADA
 * @param packageName - Optional package name for bonus calculation
 * @returns Total credits including any bonus
 */
export async function calculateCreditsForADA(
  adaAmount: number,
  packageName?: string
): Promise<number> {
  // Try to get package from database first
  if (packageName) {
    const pkg = await prisma.creditPackage.findUnique({
      where: { name: packageName },
    })

    if (pkg && adaAmount >= Number(pkg.adaPrice)) {
      return calculateCreditsWithBonus(pkg.credits, pkg.bonusPercent)
    }
  }

  // Fall back to default packages
  const defaultPkg = DEFAULT_PACKAGES.find(
    (p) => p.name === packageName && adaAmount >= p.ada
  )

  if (defaultPkg) {
    return calculateCreditsWithBonus(defaultPkg.credits, defaultPkg.bonus)
  }

  // Base rate calculation (10,000 credits per ADA)
  return Math.floor(adaAmount * 10000)
}

/**
 * Get bonus percentage for a package
 */
export function getBonusPercent(packageName?: string): number | null {
  if (!packageName) return null

  const pkg = DEFAULT_PACKAGES.find((p) => p.name === packageName)
  return pkg?.bonus ?? null
}

/**
 * Create a new payment request
 *
 * @param userId - User ID creating the payment
 * @param adaAmount - Amount in ADA
 * @param packageName - Optional package name
 * @returns Payment record
 */
export async function createPayment(
  userId: string,
  adaAmount: number,
  packageName?: string
) {
  // Generate unique payment address
  const { address, addressIndex } = await generateUniquePaymentAddress(userId)

  // Calculate credits
  const credits = await calculateCreditsForADA(adaAmount, packageName)

  // Get bonus percent
  const bonusPercent = getBonusPercent(packageName)

  // Calculate price per credit
  const pricePerCredit = adaAmount / credits

  // Convert to lovelace
  const lovelaceAmount = BigInt(Math.floor(adaAmount * 1_000_000))

  // Create payment record
  const payment = await prisma.payment.create({
    data: {
      userId,
      amount: lovelaceAmount,
      credits,
      pricePerCredit,
      packageName: packageName || null,
      bonusPercent,
      paymentAddress: address,
      addressIndex,
      status: PaymentStatus.PENDING,
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
    },
  })

  return payment
}

/**
 * Convert lovelace to ADA
 */
export function lovelaceToADA(lovelace: bigint | number): number {
  const amount = typeof lovelace === "bigint" ? Number(lovelace) : lovelace
  return amount / 1_000_000
}

/**
 * Convert ADA to lovelace
 */
export function adaToLovelace(ada: number): bigint {
  return BigInt(Math.floor(ada * 1_000_000))
}

/**
 * Format lovelace amount as ADA string
 */
export function formatADAAmount(lovelace: bigint | number): string {
  const ada = lovelaceToADA(lovelace)
  return new Intl.NumberFormat("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(ada)
}




