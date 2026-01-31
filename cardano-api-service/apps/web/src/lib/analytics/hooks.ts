/**
 * React Hooks for Analytics
 *
 * Convenient hooks for tracking events from React components.
 */

"use client"

import { useCallback, useEffect, useRef } from "react"
import { usePathname, useSearchParams } from "next/navigation"
import type { SiteType } from "./constants"
import { SCROLL_THRESHOLDS } from "./constants"
import { trackEvent, pageview, type EventParams } from "./gtag"

/**
 * Hook to track page views on route changes
 *
 * Should be used once at the app level (in the provider or layout).
 */
export function usePageTracking(site: SiteType): void {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!pathname) return

    const url = searchParams?.toString()
      ? `${pathname}?${searchParams.toString()}`
      : pathname

    pageview(url, site)
  }, [pathname, searchParams, site])
}

/**
 * Hook to get an event tracking function
 *
 * Returns a memoized function that tracks events for the specified site.
 */
export function useTrackEvent(site: SiteType) {
  return useCallback(
    (event: EventParams) => {
      trackEvent(event, site)
    },
    [site]
  )
}

/**
 * Hook to track scroll depth
 *
 * Tracks when user scrolls past 25%, 50%, 75%, and 100% of page.
 * Each threshold is only tracked once per page load.
 */
export function useScrollTracking(site: SiteType): void {
  const trackedThresholds = useRef<Set<number>>(new Set())
  const track = useTrackEvent(site)

  useEffect(() => {
    // Reset tracked thresholds on mount (new page)
    trackedThresholds.current = new Set()

    const handleScroll = () => {
      const scrollHeight = document.documentElement.scrollHeight
      const clientHeight = document.documentElement.clientHeight
      const scrollTop = window.scrollY

      // Calculate scroll percentage
      const scrollableHeight = scrollHeight - clientHeight
      if (scrollableHeight <= 0) return

      const scrollPercentage = Math.round(
        (scrollTop / scrollableHeight) * 100
      )

      // Check each threshold
      for (const threshold of SCROLL_THRESHOLDS) {
        if (
          scrollPercentage >= threshold &&
          !trackedThresholds.current.has(threshold)
        ) {
          trackedThresholds.current.add(threshold)
          track({
            event_name: "scroll_depth",
            depth_threshold: threshold,
          })
        }
      }
    }

    // Throttle scroll handler
    let ticking = false
    const throttledHandler = () => {
      if (!ticking) {
        window.requestAnimationFrame(() => {
          handleScroll()
          ticking = false
        })
        ticking = true
      }
    }

    window.addEventListener("scroll", throttledHandler, { passive: true })

    // Initial check in case page loads already scrolled
    handleScroll()

    return () => {
      window.removeEventListener("scroll", throttledHandler)
    }
  }, [track])
}

/**
 * Hook to track CTA clicks
 *
 * Returns a click handler that tracks CTA interactions.
 */
export function useCTATracking(site: SiteType) {
  const track = useTrackEvent(site)

  return useCallback(
    (location: "hero" | "nav" | "footer" | "benefits", text: string) => {
      track({
        event_name: "cta_click",
        cta_location: location,
        cta_text: text,
      })
    },
    [track]
  )
}

/**
 * Hook to track navigation clicks
 */
export function useNavTracking(site: SiteType) {
  const track = useTrackEvent(site)

  return useCallback(
    (navItem: string, isMobile: boolean = false) => {
      track({
        event_name: "navigation_click",
        nav_item: navItem,
        is_mobile: isMobile,
      })
    },
    [track]
  )
}

/**
 * Hook to track outbound link clicks
 *
 * Automatically detects clicks on links that leave the current domain.
 */
export function useOutboundTracking(site: SiteType): void {
  const track = useTrackEvent(site)

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      const target = e.target as HTMLElement
      const link = target.closest("a")

      if (!link) return

      const href = link.getAttribute("href")
      if (!href) return

      // Check if it's an outbound link
      try {
        const url = new URL(href, window.location.origin)
        const currentHost = window.location.hostname

        // Track if going to app.nacho.builders from pool site (or vice versa)
        // or any other external domain
        if (url.hostname !== currentHost) {
          track({
            event_name: "outbound_click",
            destination_url: url.href,
            link_text: link.textContent?.trim() || "",
          })
        }
      } catch {
        // Invalid URL, ignore
      }
    }

    document.addEventListener("click", handleClick)

    return () => {
      document.removeEventListener("click", handleClick)
    }
  }, [track])
}
