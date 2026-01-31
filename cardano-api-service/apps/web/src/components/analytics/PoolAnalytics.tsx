"use client"

import Script from "next/script"
import { Suspense } from "react"
import {
  GA_MEASUREMENT_ID_POOL,
  TRACKING_DOMAINS,
  usePageTracking,
  useScrollTracking,
  useOutboundTracking,
} from "@/lib/analytics"

/**
 * Google Analytics component for the Pool Site (nacho.builders)
 *
 * Handles:
 * - Loading gtag.js script
 * - Page view tracking
 * - Scroll depth tracking (25%, 50%, 75%, 100%)
 * - Outbound link tracking (to app.nacho.builders)
 * - Cross-domain tracking configuration
 */
function PoolAnalyticsContent() {
  // Track page views on route changes
  usePageTracking("pool")

  // Track scroll depth
  useScrollTracking("pool")

  // Track outbound clicks
  useOutboundTracking("pool")

  // Don't render if no measurement ID
  if (!GA_MEASUREMENT_ID_POOL) {
    return null
  }

  return (
    <>
      {/* Load gtag.js - onLoad will configure after it's ready */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID_POOL}`}
        strategy="afterInteractive"
        onLoad={() => {
          // Initialize dataLayer and gtag function
          window.dataLayer = window.dataLayer || []
          window.gtag = function gtag() {
            // eslint-disable-next-line prefer-rest-params
            window.dataLayer.push(arguments)
          }
          window.gtag("js", new Date())

          // Configure GA4 with cross-domain tracking
          window.gtag("config", GA_MEASUREMENT_ID_POOL, {
            send_page_view: false,
            cookie_flags: "SameSite=None;Secure",
            linker: {
              domains: TRACKING_DOMAINS,
              accept_incoming: true,
            },
          })
        }}
      />
    </>
  )
}

/**
 * Wrapper with Suspense for hooks that use useSearchParams
 */
export function PoolAnalytics() {
  return (
    <Suspense fallback={null}>
      <PoolAnalyticsContent />
    </Suspense>
  )
}
