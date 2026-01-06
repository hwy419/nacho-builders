import { router } from "../trpc"
import { adminRouter } from "./admin"
import { apiKeyRouter } from "./apiKey"
import { paymentRouter } from "./payment"

/**
 * Root router for the tRPC API
 * Add sub-routers here as the API grows
 */
export const appRouter = router({
  admin: adminRouter,
  apiKey: apiKeyRouter,
  payment: paymentRouter,
})

export type AppRouter = typeof appRouter
