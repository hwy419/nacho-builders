/**
 * Redis Client for Ogmios API Caching
 *
 * Provides a singleton Redis client for caching Ogmios responses
 * to reduce load on relay nodes.
 *
 * Configuration:
 * - REDIS_URL: Redis connection URL (default: redis://127.0.0.1:6379)
 *
 * See docs/redis-cache-config.md for cache configuration details.
 */

import Redis from "ioredis"

const globalForRedis = globalThis as unknown as {
  redis: Redis | undefined
}

/**
 * Create a new Redis client with appropriate settings
 */
function createRedisClient(): Redis {
  const url = process.env.REDIS_URL || "redis://127.0.0.1:6379"

  const client = new Redis(url, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    enableOfflineQueue: false,
    connectTimeout: 5000,
    retryStrategy(times) {
      // Exponential backoff with max 3 second delay
      const delay = Math.min(times * 100, 3000)
      return delay
    },
  })

  client.on("error", (err) => {
    // Log but don't crash - cache failures should be non-fatal
    console.error("Redis connection error:", err.message)
  })

  client.on("connect", () => {
    console.log("Redis connected successfully")
  })

  return client
}

// Singleton pattern - reuse connection across requests
export const redis = globalForRedis.redis ?? createRedisClient()

if (process.env.NODE_ENV !== "production") {
  globalForRedis.redis = redis
}

/**
 * Get a cached value by key
 *
 * @param key - Cache key
 * @returns Parsed cached value or null if not found/error
 */
export async function getCache<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key)
    if (!data) return null
    return JSON.parse(data) as T
  } catch (err) {
    // Cache read failures are non-fatal - just return null
    console.error("Redis getCache error:", err)
    return null
  }
}

/**
 * Set a cached value with TTL
 *
 * @param key - Cache key
 * @param value - Value to cache (will be JSON stringified)
 * @param ttlSeconds - Time to live in seconds
 */
export async function setCache(
  key: string,
  value: unknown,
  ttlSeconds: number
): Promise<void> {
  try {
    await redis.setex(key, ttlSeconds, JSON.stringify(value))
  } catch (err) {
    // Cache write failures are non-fatal - just log
    console.error("Redis setCache error:", err)
  }
}

/**
 * Delete a cached value
 *
 * @param key - Cache key to delete
 */
export async function deleteCache(key: string): Promise<void> {
  try {
    await redis.del(key)
  } catch (err) {
    console.error("Redis deleteCache error:", err)
  }
}

/**
 * Check if Redis is connected and healthy
 *
 * @returns true if Redis is available
 */
export async function isRedisHealthy(): Promise<boolean> {
  try {
    const result = await redis.ping()
    return result === "PONG"
  } catch {
    return false
  }
}
