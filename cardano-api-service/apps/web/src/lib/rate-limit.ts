/**
 * Simple IP-based rate limiter for public API endpoints
 *
 * Uses in-memory storage with automatic cleanup.
 * For production scale, consider using Redis-based rate limiting.
 */

interface RateLimitEntry {
  count: number
  resetTime: number
}

// In-memory storage for rate limit tracking
const rateLimitStore = new Map<string, RateLimitEntry>()

// Cleanup old entries every minute
const CLEANUP_INTERVAL = 60 * 1000
let cleanupTimer: NodeJS.Timeout | null = null

function startCleanup() {
  if (cleanupTimer) return
  cleanupTimer = setInterval(() => {
    const now = Date.now()
    for (const [key, entry] of rateLimitStore) {
      if (entry.resetTime < now) {
        rateLimitStore.delete(key)
      }
    }
  }, CLEANUP_INTERVAL)
  // Don't block process exit
  cleanupTimer.unref()
}

/**
 * Check rate limit for an IP address
 *
 * @param ip - Client IP address
 * @param limit - Maximum requests per window
 * @param windowMs - Time window in milliseconds (default: 60 seconds)
 * @returns Object with allowed status and remaining requests
 */
export function checkRateLimit(
  ip: string,
  limit: number = 100,
  windowMs: number = 60 * 1000
): { allowed: boolean; remaining: number; resetIn: number } {
  startCleanup()

  const now = Date.now()
  const key = `rate:${ip}`

  let entry = rateLimitStore.get(key)

  // Create new entry if none exists or window has expired
  if (!entry || entry.resetTime < now) {
    entry = {
      count: 0,
      resetTime: now + windowMs,
    }
    rateLimitStore.set(key, entry)
  }

  // Increment request count
  entry.count++

  const remaining = Math.max(0, limit - entry.count)
  const resetIn = Math.max(0, entry.resetTime - now)

  return {
    allowed: entry.count <= limit,
    remaining,
    resetIn,
  }
}

/**
 * Get client IP from request headers
 *
 * Handles X-Forwarded-For and other proxy headers
 */
export function getClientIp(headers: Headers): string {
  // Check X-Forwarded-For first (set by nginx/load balancers)
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    // X-Forwarded-For can contain multiple IPs, take the first one
    return forwardedFor.split(',')[0].trim()
  }

  // Check X-Real-IP (common nginx header)
  const realIp = headers.get('x-real-ip')
  if (realIp) {
    return realIp.trim()
  }

  // Fallback to a default for local development
  return '127.0.0.1'
}

/**
 * Rate limit headers for HTTP responses
 */
export function rateLimitHeaders(
  limit: number,
  remaining: number,
  resetIn: number
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(remaining),
    'X-RateLimit-Reset': String(Math.ceil(resetIn / 1000)),
  }
}
