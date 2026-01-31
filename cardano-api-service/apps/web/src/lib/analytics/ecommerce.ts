/**
 * Enhanced Ecommerce Events for GA4
 *
 * Tracks credit package purchases using GA4's standard ecommerce events.
 * Uses ADA as a custom currency.
 */

import { isGtagAvailable, getMeasurementId } from "./gtag"
import type { SiteType } from "./constants"

// Credit package item structure for ecommerce
interface CreditPackageItem {
  item_id: string
  item_name: string
  item_category: "credits"
  price: number // ADA price
  quantity: number // Always 1 for packages
  item_variant?: string // Bonus percentage if applicable
}

/**
 * Format a credit package for ecommerce tracking
 */
function formatPackageItem(pkg: {
  name: string
  adaPrice: number
  credits: number
  bonusPercent?: number
}): CreditPackageItem {
  return {
    item_id: `credits_${pkg.name.toLowerCase().replace(/\s+/g, "_")}`,
    item_name: `${pkg.name} Credit Package`,
    item_category: "credits",
    price: pkg.adaPrice,
    quantity: 1,
    ...(pkg.bonusPercent && pkg.bonusPercent > 0
      ? { item_variant: `+${pkg.bonusPercent}% bonus` }
      : {}),
  }
}

/**
 * Track when a credit package is viewed
 *
 * GA4 standard event: view_item
 */
export function trackViewItem(
  pkg: {
    name: string
    adaPrice: number
    credits: number
    bonusPercent?: number
  },
  site: SiteType
): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  window.gtag("event", "view_item", {
    currency: "ADA",
    value: pkg.adaPrice,
    items: [formatPackageItem(pkg)],
    // Custom parameters
    site,
    credits_amount: pkg.credits,
  })
}

/**
 * Track when checkout begins
 *
 * GA4 standard event: begin_checkout
 */
export function trackBeginCheckout(
  pkg: {
    name: string
    adaPrice: number
    credits: number
    bonusPercent?: number
  },
  site: SiteType
): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  window.gtag("event", "begin_checkout", {
    currency: "ADA",
    value: pkg.adaPrice,
    items: [formatPackageItem(pkg)],
    // Custom parameters
    site,
    credits_amount: pkg.credits,
  })
}

/**
 * Track when a purchase is completed
 *
 * GA4 standard event: purchase
 */
export function trackPurchase(
  pkg: {
    name: string
    adaPrice: number
    credits: number
    bonusPercent?: number
  },
  transactionId: string,
  site: SiteType
): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  window.gtag("event", "purchase", {
    transaction_id: transactionId,
    currency: "ADA",
    value: pkg.adaPrice,
    items: [formatPackageItem(pkg)],
    // Custom parameters
    site,
    credits_amount: pkg.credits,
    tx_hash: transactionId,
  })
}

/**
 * Track when a purchase fails or expires
 *
 * Custom event (no standard GA4 equivalent)
 */
export function trackPurchaseFailed(
  pkg: {
    name: string
    adaPrice: number
    credits: number
  },
  reason: "expired" | "failed",
  site: SiteType
): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  window.gtag("event", "purchase_error", {
    currency: "ADA",
    value: pkg.adaPrice,
    items: [formatPackageItem(pkg)],
    // Custom parameters
    site,
    error_type: reason,
    credits_amount: pkg.credits,
  })
}
