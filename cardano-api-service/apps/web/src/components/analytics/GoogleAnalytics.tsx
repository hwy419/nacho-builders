"use client"

import Script from "next/script"
import { Suspense, useEffect } from "react"
import { useSession } from "next-auth/react"
import {
  GA_MEASUREMENT_ID_DASHBOARD,
  TRACKING_DOMAINS,
  usePageTracking,
  setUserProperties,
  setUserId,
  getCreditBucket,
} from "@/lib/analytics"

/**
 * Google Analytics component for the Dashboard (app.nacho.builders)
 *
 * Handles:
 * - Loading gtag.js script
 * - Page view tracking
 * - User properties from session
 * - Cross-domain tracking configuration
 */
function GoogleAnalyticsContent() {
  const { data: session, status } = useSession()

  // Track page views on route changes
  usePageTracking("dashboard")

  // Set user properties when session changes
  useEffect(() => {
    if (status === "loading") return

    if (session?.user) {
      // Set user ID (hashed or obfuscated for privacy)
      setUserId(session.user.id || null, "dashboard")

      // Set user properties
      const credits = session.user.credits ?? 0
      const role = session.user.role?.toLowerCase() as
        | "free"
        | "paid"
        | "admin"
        | undefined

      setUserProperties("dashboard", {
        is_authenticated: true,
        user_tier: role || "free",
        credit_balance_bucket: getCreditBucket(credits),
      })
    } else {
      // User not authenticated
      setUserId(null, "dashboard")
      setUserProperties("dashboard", {
        is_authenticated: false,
      })
    }
  }, [session, status])

  // Don't render if no measurement ID
  if (!GA_MEASUREMENT_ID_DASHBOARD) {
    return null
  }

  return (
    <>
      {/* Load gtag.js - onLoad will configure after it's ready */}
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_MEASUREMENT_ID_DASHBOARD}`}
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
          window.gtag("config", GA_MEASUREMENT_ID_DASHBOARD, {
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
 * Wrapper with Suspense for useSearchParams
 */
export function GoogleAnalytics() {
  return (
    <Suspense fallback={null}>
      <GoogleAnalyticsContent />
    </Suspense>
  )
}
