import { z } from "zod"
import { TRPCError } from "@trpc/server"
import { router, protectedProcedure, middleware } from "../trpc"

/**
 * Middleware that enforces ADMIN role
 */
const enforceAdmin = middleware(async ({ ctx, next }) => {
  // Fetch user role from database since session might not have the most up-to-date role
  const user = await ctx.prisma.user.findUnique({
    where: { id: ctx.session.user.id },
    select: { role: true },
  })

  if (!user || user.role !== "ADMIN") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "You must be an admin to access this resource",
    })
  }

  return next({
    ctx: {
      ...ctx,
      isAdmin: true,
    },
  })
})

/**
 * Admin procedure - requires authentication AND admin role
 */
const adminProcedure = protectedProcedure.use(enforceAdmin)

/**
 * Admin router with all administrative procedures
 */
export const adminRouter = router({
  /**
   * Get dashboard statistics
   */
  stats: adminProcedure.query(async ({ ctx }) => {
    const now = new Date()
    const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate())

    const [
      totalUsers,
      totalRevenue,
      totalApiCalls,
      apiCallsToday,
      activeKeys,
      pendingPayments,
    ] = await Promise.all([
      // Total users
      ctx.prisma.user.count(),

      // Total revenue (sum of confirmed payments in lovelace)
      ctx.prisma.payment.aggregate({
        where: { status: "CONFIRMED" },
        _sum: { amount: true },
      }),

      // Total API calls
      ctx.prisma.usageLog.count(),

      // API calls today
      ctx.prisma.usageLog.count({
        where: { timestamp: { gte: todayStart } },
      }),

      // Active API keys
      ctx.prisma.apiKey.count({
        where: { active: true },
      }),

      // Pending payments
      ctx.prisma.payment.count({
        where: { status: "PENDING" },
      }),
    ])

    return {
      totalUsers,
      totalRevenue: totalRevenue._sum.amount || BigInt(0),
      totalApiCalls,
      apiCallsToday,
      activeKeys,
      pendingPayments,
    }
  }),

  /**
   * List users with pagination and search
   */
  listUsers: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        search: z.string().optional(),
        status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
        role: z.enum(["USER", "ADMIN"]).optional(),
        sortBy: z.enum(["createdAt", "lastLoginAt", "credits"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, search, status, role, sortBy, sortOrder } = input
      const skip = (page - 1) * limit

      const where = {
        ...(search && {
          OR: [
            { email: { contains: search, mode: "insensitive" as const } },
            { name: { contains: search, mode: "insensitive" as const } },
          ],
        }),
        ...(status && { status }),
        ...(role && { role }),
      }

      const [users, total] = await Promise.all([
        ctx.prisma.user.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          select: {
            id: true,
            email: true,
            name: true,
            image: true,
            credits: true,
            role: true,
            status: true,
            createdAt: true,
            lastLoginAt: true,
            _count: {
              select: {
                apiKeys: true,
                payments: true,
              },
            },
          },
        }),
        ctx.prisma.user.count({ where }),
      ])

      return {
        users,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    }),

  /**
   * Get single user details with their keys and payments
   */
  getUser: adminProcedure
    .input(z.object({ userId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await ctx.prisma.user.findUnique({
        where: { id: input.userId },
        include: {
          apiKeys: {
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              name: true,
              keyPrefix: true,
              tier: true,
              active: true,
              createdAt: true,
              lastUsedAt: true,
              rateLimitPerSecond: true,
              websocketLimit: true,
            },
          },
          payments: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: {
              id: true,
              amount: true,
              credits: true,
              status: true,
              packageName: true,
              txHash: true,
              createdAt: true,
              confirmedAt: true,
            },
          },
          _count: {
            select: {
              usageLogs: true,
            },
          },
        },
      })

      if (!user) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "User not found",
        })
      }

      return user
    }),

  /**
   * Update user (adjust credits, change status, change role)
   */
  updateUser: adminProcedure
    .input(
      z.object({
        userId: z.string(),
        credits: z.number().optional(),
        creditsDelta: z.number().optional(), // Add/subtract credits
        status: z.enum(["ACTIVE", "SUSPENDED", "DELETED"]).optional(),
        role: z.enum(["USER", "ADMIN"]).optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { userId, credits, creditsDelta, status, role } = input

      // Build update data
      const updateData: Record<string, unknown> = {}

      if (credits !== undefined) {
        updateData.credits = credits
      } else if (creditsDelta !== undefined) {
        // Fetch current credits first
        const currentUser = await ctx.prisma.user.findUnique({
          where: { id: userId },
          select: { credits: true },
        })
        if (!currentUser) {
          throw new TRPCError({ code: "NOT_FOUND", message: "User not found" })
        }
        updateData.credits = Math.max(0, currentUser.credits + creditsDelta)
      }

      if (status !== undefined) {
        updateData.status = status
      }

      if (role !== undefined) {
        updateData.role = role
      }

      const user = await ctx.prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true,
          email: true,
          name: true,
          credits: true,
          status: true,
          role: true,
        },
      })

      return user
    }),

  /**
   * List all payments with filters
   */
  listPayments: adminProcedure
    .input(
      z.object({
        page: z.number().min(1).default(1),
        limit: z.number().min(1).max(100).default(20),
        status: z.enum(["PENDING", "CONFIRMING", "CONFIRMED", "EXPIRED", "FAILED"]).optional(),
        userId: z.string().optional(),
        dateFrom: z.coerce.date().optional(),
        dateTo: z.coerce.date().optional(),
        sortBy: z.enum(["createdAt", "amount", "credits"]).default("createdAt"),
        sortOrder: z.enum(["asc", "desc"]).default("desc"),
      })
    )
    .query(async ({ ctx, input }) => {
      const { page, limit, status, userId, dateFrom, dateTo, sortBy, sortOrder } = input
      const skip = (page - 1) * limit

      const where = {
        ...(status && { status }),
        ...(userId && { userId }),
        ...(dateFrom && { createdAt: { gte: dateFrom } }),
        ...(dateTo && { createdAt: { lte: dateTo } }),
      }

      const [payments, total] = await Promise.all([
        ctx.prisma.payment.findMany({
          where,
          skip,
          take: limit,
          orderBy: { [sortBy]: sortOrder },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                name: true,
              },
            },
          },
        }),
        ctx.prisma.payment.count({ where }),
      ])

      return {
        payments,
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
      }
    }),

  /**
   * Manually confirm a pending payment
   */
  confirmPayment: adminProcedure
    .input(
      z.object({
        paymentId: z.string(),
        txHash: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { paymentId, txHash } = input

      const payment = await ctx.prisma.payment.findUnique({
        where: { id: paymentId },
        include: { user: true },
      })

      if (!payment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" })
      }

      if (payment.status === "CONFIRMED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Payment already confirmed" })
      }

      // Update payment and add credits to user in a transaction
      const result = await ctx.prisma.$transaction([
        ctx.prisma.payment.update({
          where: { id: paymentId },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
            ...(txHash && { txHash }),
          },
        }),
        ctx.prisma.user.update({
          where: { id: payment.userId },
          data: {
            credits: { increment: payment.credits },
          },
        }),
      ])

      return result[0]
    }),

  /**
   * Get recent signups
   */
  recentSignups: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.user.findMany({
        take: input.limit,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          email: true,
          name: true,
          image: true,
          createdAt: true,
          role: true,
          status: true,
        },
      })
    }),

  /**
   * Get recent payments
   */
  recentPayments: adminProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ ctx, input }) => {
      return ctx.prisma.payment.findMany({
        take: input.limit,
        orderBy: { createdAt: "desc" },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              name: true,
            },
          },
        },
      })
    }),

  /**
   * List all system configuration
   */
  listSystemConfig: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.systemConfig.findMany({
      orderBy: { key: "asc" },
    })
  }),

  /**
   * Update system configuration
   */
  updateSystemConfig: adminProcedure
    .input(
      z.object({
        key: z.string(),
        value: z.string(),
        description: z.string().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { key, value, description } = input

      return ctx.prisma.systemConfig.upsert({
        where: { key },
        update: {
          value,
          ...(description && { description }),
          updatedBy: ctx.session.user.email || undefined,
        },
        create: {
          key,
          value,
          description,
          updatedBy: ctx.session.user.email || undefined,
        },
      })
    }),

  /**
   * List credit packages
   */
  listCreditPackages: adminProcedure.query(async ({ ctx }) => {
    return ctx.prisma.creditPackage.findMany({
      orderBy: { displayOrder: "asc" },
    })
  }),

  /**
   * Update credit package
   */
  updateCreditPackage: adminProcedure
    .input(
      z.object({
        id: z.string(),
        name: z.string().optional(),
        credits: z.number().optional(),
        adaPrice: z.number().optional(),
        bonusPercent: z.number().optional(),
        active: z.boolean().optional(),
        displayOrder: z.number().optional(),
        popular: z.boolean().optional(),
      })
    )
    .mutation(async ({ ctx, input }) => {
      const { id, ...data } = input

      // Convert adaPrice to Decimal if provided
      const updateData = {
        ...data,
        ...(data.adaPrice !== undefined && { adaPrice: data.adaPrice }),
      }

      return ctx.prisma.creditPackage.update({
        where: { id },
        data: updateData,
      })
    }),

  /**
   * Create credit package
   */
  createCreditPackage: adminProcedure
    .input(
      z.object({
        name: z.string(),
        credits: z.number(),
        adaPrice: z.number(),
        bonusPercent: z.number().default(0),
        active: z.boolean().default(true),
        displayOrder: z.number().default(0),
        popular: z.boolean().default(false),
      })
    )
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.creditPackage.create({
        data: input,
      })
    }),

  /**
   * Delete credit package
   */
  deleteCreditPackage: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return ctx.prisma.creditPackage.delete({
        where: { id: input.id },
      })
    }),
})
