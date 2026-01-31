"use client"

import { createContext, useContext, useCallback, type ReactNode } from "react"
import type { SiteType, EventParams } from "@/lib/analytics"
import { trackEvent as gtagTrackEvent } from "@/lib/analytics"

interface AnalyticsContextValue {
  trackEvent: (event: EventParams) => void
  site: SiteType
}

const AnalyticsContext = createContext<AnalyticsContextValue | null>(null)

interface AnalyticsProviderProps {
  children: ReactNode
  site: SiteType
}

/**
 * Analytics Provider Component
 *
 * Provides analytics context to child components.
 * Automatically includes site type in all tracked events.
 */
export function AnalyticsProvider({ children, site }: AnalyticsProviderProps) {
  const trackEvent = useCallback(
    (event: EventParams) => {
      gtagTrackEvent(event, site)
    },
    [site]
  )

  return (
    <AnalyticsContext.Provider value={{ trackEvent, site }}>
      {children}
    </AnalyticsContext.Provider>
  )
}

/**
 * Hook to access analytics context
 *
 * Returns tracking function and current site type.
 */
export function useAnalytics(): AnalyticsContextValue {
  const context = useContext(AnalyticsContext)

  if (!context) {
    // Return a no-op implementation if not in provider
    // This allows components to be used without requiring analytics
    return {
      trackEvent: () => {},
      site: "dashboard",
    }
  }

  return context
}
