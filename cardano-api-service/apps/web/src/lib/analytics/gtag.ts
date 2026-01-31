/**
 * Core gtag Functions
 *
 * Low-level functions for interacting with Google Analytics.
 * These are wrapped by hooks and higher-level functions.
 */

import type { EventName } from "./events"
import type { SiteType, UserTier, CreditBucket } from "./constants"
import {
  GA_MEASUREMENT_ID_POOL,
  GA_MEASUREMENT_ID_DASHBOARD,
} from "./constants"

// Extend window type for gtag
declare global {
  interface Window {
    gtag: (
      command: "config" | "event" | "set" | "consent" | "js",
      targetId: string | Date,
      config?: Record<string, unknown>
    ) => void
    dataLayer: unknown[]
  }
}

// Simplified event params type for easier usage
export interface EventParams {
  event_name: EventName
  [key: string]: unknown
}

/**
 * Check if gtag is available
 */
export function isGtagAvailable(): boolean {
  return typeof window !== "undefined" && typeof window.gtag === "function"
}

/**
 * Get the appropriate measurement ID for the current site
 */
export function getMeasurementId(site: SiteType): string {
  return site === "pool" ? GA_MEASUREMENT_ID_POOL : GA_MEASUREMENT_ID_DASHBOARD
}

/**
 * Track a page view
 */
export function pageview(url: string, site: SiteType): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  window.gtag("config", measurementId, {
    page_path: url,
  })
}

/**
 * Track a custom event
 *
 * Tracks events with the specified parameters.
 */
export function trackEvent(
  event: EventParams,
  site: SiteType
): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  const { event_name, ...params } = event

  window.gtag("event", event_name, {
    ...params,
    site,
  })
}

/**
 * Set user properties
 *
 * These persist across sessions and can be used for segmentation.
 */
export function setUserProperties(
  site: SiteType,
  properties: {
    user_tier?: UserTier
    credit_balance_bucket?: CreditBucket
    api_keys_count?: number
    is_authenticated?: boolean
  }
): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  window.gtag("set", "user_properties", properties)
}

/**
 * Set user ID for cross-device tracking
 *
 * Should be called after successful authentication with a hashed user ID.
 * Never use PII directly as the user ID.
 */
export function setUserId(userId: string | null, site: SiteType): void {
  if (!isGtagAvailable()) return

  const measurementId = getMeasurementId(site)
  if (!measurementId) return

  window.gtag("config", measurementId, {
    user_id: userId,
  })
}

/**
 * Grant or deny analytics consent
 *
 * Used for GDPR compliance. Call with 'denied' before consent,
 * then 'granted' after user consents.
 */
export function setConsent(granted: boolean): void {
  if (!isGtagAvailable()) return

  window.gtag("consent", "update", {
    analytics_storage: granted ? "granted" : "denied",
  })
}

/**
 * Initialize dataLayer if it doesn't exist
 *
 * Called before gtag.js loads to ensure events are queued.
 */
export function initDataLayer(): void {
  if (typeof window === "undefined") return

  window.dataLayer = window.dataLayer || []
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  window.gtag = function (...args: any[]) {
    window.dataLayer.push(args)
  }
  window.gtag("js", new Date())
}
