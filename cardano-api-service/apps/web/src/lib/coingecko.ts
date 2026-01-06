/**
 * CoinGecko Price Service
 *
 * Fetches ADA/USD exchange rate with Redis caching.
 * Designed for graceful failure - never blocks payment creation.
 */

import { getCache, setCache } from "./redis"

const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price"
const CACHE_KEY = "coingecko:ada_usd_rate"
const CACHE_TTL_SECONDS = 60 // 1 minute

interface PriceResponse {
  cardano?: {
    usd?: number
  }
}

/**
 * Fetch ADA/USD exchange rate from CoinGecko with caching
 *
 * @returns The current ADA/USD rate, or null if unavailable
 */
export async function getAdaUsdRate(): Promise<number | null> {
  try {
    // Check Redis cache first
    const cached = await getCache<{ rate: number; fetchedAt: string }>(CACHE_KEY)
    if (cached) {
      console.log(`[CoinGecko] Cache hit: ADA/USD = ${cached.rate}`)
      return cached.rate
    }

    // Fetch from CoinGecko API
    console.log("[CoinGecko] Cache miss, fetching fresh rate...")

    const response = await fetch(
      `${COINGECKO_API_URL}?ids=cardano&vs_currencies=usd`,
      {
        method: "GET",
        headers: {
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(10000),
      }
    )

    if (!response.ok) {
      console.warn(
        `[CoinGecko] API returned ${response.status}: ${response.statusText}`
      )
      return null
    }

    const data: PriceResponse = await response.json()

    if (!data.cardano?.usd) {
      console.warn("[CoinGecko] Invalid response structure:", data)
      return null
    }

    const rate = data.cardano.usd

    // Cache the result in Redis
    await setCache(
      CACHE_KEY,
      { rate, fetchedAt: new Date().toISOString() },
      CACHE_TTL_SECONDS
    )

    console.log(`[CoinGecko] Fresh rate fetched and cached: ADA/USD = ${rate}`)
    return rate
  } catch (error) {
    // Log but don't throw - price lookup failures should never block payments
    if (error instanceof Error) {
      console.error(`[CoinGecko] Error fetching price: ${error.message}`)
    } else {
      console.error("[CoinGecko] Unknown error fetching price")
    }
    return null
  }
}

/**
 * Calculate USD value from ADA amount and exchange rate
 *
 * @param adaAmount - Amount in ADA (not lovelace)
 * @param adaUsdRate - Exchange rate (ADA/USD)
 * @returns USD value rounded to 2 decimal places
 */
export function calculateUsdValue(adaAmount: number, adaUsdRate: number): number {
  return Math.round(adaAmount * adaUsdRate * 100) / 100
}
