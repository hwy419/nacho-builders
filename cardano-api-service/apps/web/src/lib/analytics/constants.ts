/**
 * Google Analytics 4 Configuration Constants
 *
 * Two data streams for cross-domain tracking:
 * - Pool site (nacho.builders): Landing page with delegation wizard
 * - Dashboard (app.nacho.builders): API service with auth, billing, API keys
 */

// GA4 Measurement IDs - Set in environment variables
export const GA_MEASUREMENT_ID_POOL = process.env.NEXT_PUBLIC_GA_ID_POOL || ""
export const GA_MEASUREMENT_ID_DASHBOARD =
  process.env.NEXT_PUBLIC_GA_ID_DASHBOARD || ""

// Site identifiers for custom dimension
export type SiteType = "pool" | "dashboard"

// Domains for cross-domain tracking
export const TRACKING_DOMAINS = ["nacho.builders", "app.nacho.builders"]

// User tiers for user property
export type UserTier = "free" | "paid" | "admin"

// Credit balance buckets for user property
export type CreditBucket = "0" | "1-100" | "101-1000" | "1001+"

export function getCreditBucket(credits: number): CreditBucket {
  if (credits === 0) return "0"
  if (credits <= 100) return "1-100"
  if (credits <= 1000) return "101-1000"
  return "1001+"
}

// Supported wallet types for tracking
export const SUPPORTED_WALLETS = [
  "eternl",
  "lace",
  "yoroi",
  "nami",
  "flint",
  "gerowallet",
  "typhoncip30",
  "nufi",
] as const

export type WalletType = (typeof SUPPORTED_WALLETS)[number] | "unknown"

// Scroll depth thresholds for pool page
export const SCROLL_THRESHOLDS = [25, 50, 75, 100] as const
