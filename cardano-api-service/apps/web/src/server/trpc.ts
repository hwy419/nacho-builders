import { initTRPC, TRPCError } from "@trpc/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/db"

/**
 * Context creation for tRPC
 * This is called for each request and provides session and prisma to all procedures
 */
export async function createTRPCContext() {
  const session = await getServerSession(authOptions)

  return {
    session,
    prisma,
  }
}

export type Context = Awaited<ReturnType<typeof createTRPCContext>>

/**
 * Initialize tRPC - using plain JSON (no superjson transformer)
 * Note: Date fields will be serialized as ISO strings
 */
const t = initTRPC.context<Context>().create({
  errorFormatter({ shape }) {
    return shape
  },
})

/**
 * Router and procedure helpers
 */
export const router = t.router
export const middleware = t.middleware

/**
 * Public procedure - accessible to anyone
 */
export const publicProcedure = t.procedure

/**
 * Middleware that enforces authentication
 */
const enforceUserIsAuthenticated = t.middleware(async ({ ctx, next }) => {
  if (!ctx.session?.user) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "You must be logged in to access this resource",
    })
  }

  return next({
    ctx: {
      // Infers the session as non-null
      session: ctx.session,
    },
  })
})

/**
 * Protected procedure - requires authentication
 */
export const protectedProcedure = t.procedure.use(enforceUserIsAuthenticated)
