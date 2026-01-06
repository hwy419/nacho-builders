import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure } from "../trpc"
import { generateApiKey, hashApiKey } from "@/lib/utils"
import { kong } from "@/lib/kong"

// Available API endpoints
const AVAILABLE_APIS = ["v1/ogmios", "v1/submit", "v1/graphql"] as const

// Tier-specific limits (updated for generous self-hosted setup)
const TIER_LIMITS = {
  FREE: {
    rateLimitPerSecond: 100,      // 100 req/sec
    dailyRequestLimit: 100000,    // 100k requests/day
    websocketLimit: 5,            // 5 concurrent connections
    dataRetentionDays: 30,        // 30 days
    submitRateLimitHour: 10,      // 10 tx/hour
    allowedApis: ["v1/ogmios", "v1/graphql"] as string[],  // Submit is rate-limited, not blocked
  },
  PAID: {
    rateLimitPerSecond: 500,      // 500 req/sec
    dailyRequestLimit: null,      // Unlimited
    websocketLimit: 50,           // 50 concurrent connections
    dataRetentionDays: 90,        // 90 days
    submitRateLimitHour: null,    // Unlimited
    allowedApis: ["v1/ogmios", "v1/submit", "v1/graphql"] as string[],
  },
  // Secret ADMIN tier - never shown in UI, only assignable via database
  ADMIN: {
    rateLimitPerSecond: null,     // No rate limit
    dailyRequestLimit: null,      // Unlimited
    websocketLimit: null,         // Unlimited
    dataRetentionDays: 365,       // 1 year
    submitRateLimitHour: null,    // Unlimited
    allowedApis: ["v1/ogmios", "v1/submit", "v1/graphql"] as string[],
  },
} as const

export const apiKeyRouter = router({
  /**
   * List all API keys for the authenticated user
   * Returns key metadata without the actual key hash
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const apiKeys = await ctx.prisma.apiKey.findMany({
      where: { userId: ctx.session.user.id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true,
        name: true,
        keyPrefix: true,
        tier: true,
        isDefault: true,
        rateLimitPerSecond: true,
        dailyRequestLimit: true,
        websocketLimit: true,
        dataRetentionDays: true,
        submitRateLimitHour: true,
        allowedApis: true,
        ipWhitelist: true,
        active: true,
        expiresAt: true,
        createdAt: true,
        updatedAt: true,
        lastUsedAt: true,
        // Explicitly exclude keyHash
      },
    })

    return apiKeys
  }),

  /**
   * Get a single API key by ID
   * Verifies ownership before returning
   */
  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const apiKey = await ctx.prisma.apiKey.findUnique({
        where: { id: input.id },
        select: {
          id: true,
          userId: true,
          name: true,
          keyPrefix: true,
          tier: true,
          isDefault: true,
          rateLimitPerSecond: true,
          dailyRequestLimit: true,
          websocketLimit: true,
          dataRetentionDays: true,
          submitRateLimitHour: true,
          allowedApis: true,
          ipWhitelist: true,
          active: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
        },
      })

      if (!apiKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        })
      }

      // Verify ownership
      if (apiKey.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to access this API key",
        })
      }

      // Remove userId from response
      const { userId, ...keyData } = apiKey
      return keyData
    }),

  /**
   * Create a new API key
   * Returns the full key ONCE - it cannot be retrieved again
   * Note: Users get ONE free key auto-created on signup. Additional keys must be PAID.
   */
  create: protectedProcedure
    .input(
      z.object({
        name: z.string().min(1, "Name is required").max(100),
        tier: z.enum(["FREE", "PAID"]).default("PAID"),
        allowedApis: z.array(z.enum(AVAILABLE_APIS)).optional(),
        ipWhitelist: z.array(z.string().ip()).default([]),
        expiresAt: z.coerce.date().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const userId = ctx.session.user.id

      // Check if user already has a FREE key - only one allowed per user
      if (input.tier === "FREE") {
        const existingFreeKey = await ctx.prisma.apiKey.findFirst({
          where: { userId, tier: "FREE" },
        })

        if (existingFreeKey) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "You already have a free API key. Additional keys must be PAID tier.",
          })
        }
      }

      // If requesting PAID tier, check user credits
      if (input.tier === "PAID") {
        const user = await ctx.prisma.user.findUnique({
          where: { id: userId },
          select: { credits: true },
        })

        if (!user || user.credits < 100) {
          throw new TRPCError({
            code: "FORBIDDEN",
            message: "Insufficient credits for PAID tier API key. You need at least 100 credits.",
          })
        }
      }

      // Generate the API key
      const fullKey = generateApiKey()
      const keyHash = await hashApiKey(fullKey)
      const keyPrefix = fullKey.slice(0, 12)

      // Get tier-specific limits
      const limits = TIER_LIMITS[input.tier]

      // Use tier-specific allowedApis if not provided
      const allowedApis = input.allowedApis ?? [...limits.allowedApis]

      // Create Kong consumer and key credential
      let kongConsumerId: string | null = null
      let kongKeyId: string | null = null

      try {
        // Create a unique username for Kong
        const kongUsername = `user_${userId}_${Date.now()}`
        const consumer = await kong.createConsumer(kongUsername, userId)
        kongConsumerId = consumer.id

        // Create the key credential in Kong
        const keyCredential = await kong.createKeyCredential(consumer.id, fullKey)
        kongKeyId = keyCredential.id

        // Set rate limit for the consumer
        await kong.updateRateLimit(consumer.id, limits.rateLimitPerSecond)
      } catch (error) {
        // Clean up Kong consumer if key creation fails
        if (kongConsumerId) {
          try {
            await kong.deleteConsumer(kongConsumerId)
          } catch (e) {
            console.error("Failed to clean up Kong consumer:", e)
          }
        }
        console.error("Kong integration error:", error)
        // Continue without Kong integration for now (development mode)
      }

      // Create the API key in database
      const apiKey = await ctx.prisma.apiKey.create({
        data: {
          userId,
          name: input.name,
          keyHash,
          keyPrefix,
          tier: input.tier,
          isDefault: false, // Only auto-created keys are default
          rateLimitPerSecond: limits.rateLimitPerSecond,
          dailyRequestLimit: limits.dailyRequestLimit,
          websocketLimit: limits.websocketLimit,
          dataRetentionDays: limits.dataRetentionDays,
          submitRateLimitHour: limits.submitRateLimitHour,
          allowedApis,
          ipWhitelist: input.ipWhitelist,
          expiresAt: input.expiresAt,
          kongConsumerId,
          kongKeyId,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          tier: true,
          isDefault: true,
          rateLimitPerSecond: true,
          dailyRequestLimit: true,
          websocketLimit: true,
          dataRetentionDays: true,
          submitRateLimitHour: true,
          allowedApis: true,
          ipWhitelist: true,
          active: true,
          expiresAt: true,
          createdAt: true,
        },
      })

      // Return the full key ONLY ONCE
      return {
        ...apiKey,
        key: fullKey,
      }
    }),

  /**
   * Update an existing API key
   * Can update name, allowedApis, and ipWhitelist
   */
  update: protectedProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().min(1).max(100).optional(),
        allowedApis: z.array(z.enum(AVAILABLE_APIS)).optional(),
        ipWhitelist: z.array(z.string().ip()).optional(),
        active: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...updateData } = input

      // Verify ownership
      const existingKey = await ctx.prisma.apiKey.findUnique({
        where: { id },
        select: { userId: true },
      })

      if (!existingKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        })
      }

      if (existingKey.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to update this API key",
        })
      }

      // Update the API key
      const updatedKey = await ctx.prisma.apiKey.update({
        where: { id },
        data: updateData,
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          tier: true,
          isDefault: true,
          rateLimitPerSecond: true,
          dailyRequestLimit: true,
          websocketLimit: true,
          dataRetentionDays: true,
          submitRateLimitHour: true,
          allowedApis: true,
          ipWhitelist: true,
          active: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
          lastUsedAt: true,
        },
      })

      return updatedKey
    }),

  /**
   * Delete an API key
   * Removes from Kong and hard-deletes from database
   * Note: Default (auto-created) FREE keys cannot be deleted
   */
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get Kong IDs
      const existingKey = await ctx.prisma.apiKey.findUnique({
        where: { id: input.id },
        select: {
          userId: true,
          kongConsumerId: true,
          isDefault: true,
        },
      })

      if (!existingKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        })
      }

      if (existingKey.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to delete this API key",
        })
      }

      // Prevent deletion of default (auto-created) FREE key
      if (existingKey.isDefault) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Your default free API key cannot be deleted. You can regenerate it if needed.",
        })
      }

      // Delete from Kong first
      if (existingKey.kongConsumerId) {
        try {
          await kong.deleteConsumer(existingKey.kongConsumerId)
        } catch (error) {
          console.error("Failed to delete Kong consumer:", error)
          // Continue with database deletion anyway
        }
      }

      // Delete from database
      await ctx.prisma.apiKey.delete({
        where: { id: input.id },
      })

      return { success: true }
    }),

  /**
   * Regenerate an API key
   * Creates a new key, updates Kong, and returns the new key ONCE
   */
  regenerate: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // Verify ownership and get current key data
      const existingKey = await ctx.prisma.apiKey.findUnique({
        where: { id: input.id },
        select: {
          userId: true,
          kongConsumerId: true,
          tier: true,
          name: true,
          allowedApis: true,
          ipWhitelist: true,
          expiresAt: true,
          rateLimitPerSecond: true,
          websocketLimit: true,
          dataRetentionDays: true,
        },
      })

      if (!existingKey) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "API key not found",
        })
      }

      if (existingKey.userId !== ctx.session.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You don't have permission to regenerate this API key",
        })
      }

      // Generate new key
      const fullKey = generateApiKey()
      const keyHash = await hashApiKey(fullKey)
      const keyPrefix = fullKey.slice(0, 12)

      // Update Kong if consumer exists
      let kongKeyId: string | null = null
      if (existingKey.kongConsumerId) {
        try {
          // Delete old consumer and create new one with new key
          await kong.deleteConsumer(existingKey.kongConsumerId)

          const kongUsername = `user_${existingKey.userId}_${Date.now()}`
          const consumer = await kong.createConsumer(kongUsername, existingKey.userId)
          const keyCredential = await kong.createKeyCredential(consumer.id, fullKey)

          await kong.updateRateLimit(consumer.id, existingKey.rateLimitPerSecond)

          kongKeyId = keyCredential.id

          // Update Kong consumer ID in database
          await ctx.prisma.apiKey.update({
            where: { id: input.id },
            data: {
              kongConsumerId: consumer.id,
              kongKeyId: keyCredential.id,
            },
          })
        } catch (error) {
          console.error("Kong integration error during regenerate:", error)
          // Continue without Kong integration
        }
      }

      // Update the API key in database
      const updatedKey = await ctx.prisma.apiKey.update({
        where: { id: input.id },
        data: {
          keyHash,
          keyPrefix,
        },
        select: {
          id: true,
          name: true,
          keyPrefix: true,
          tier: true,
          isDefault: true,
          rateLimitPerSecond: true,
          dailyRequestLimit: true,
          websocketLimit: true,
          dataRetentionDays: true,
          submitRateLimitHour: true,
          allowedApis: true,
          ipWhitelist: true,
          active: true,
          expiresAt: true,
          createdAt: true,
          updatedAt: true,
        },
      })

      // Return the full key ONLY ONCE
      return {
        ...updatedKey,
        key: fullKey,
      }
    }),
})
