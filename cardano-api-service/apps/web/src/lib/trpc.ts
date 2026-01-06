"use client"

import { createTRPCReact } from "@trpc/react-query"
import type { AppRouter } from "@/server/routers/_app"

/**
 * tRPC React hooks for client-side usage
 *
 * Usage in components:
 *   import { trpc } from "@/lib/trpc"
 *
 *   // Query example
 *   const { data, isLoading } = trpc.user.getProfile.useQuery()
 *
 *   // Mutation example
 *   const mutation = trpc.apiKey.create.useMutation()
 *   mutation.mutate({ name: "My API Key" })
 */
export const trpc = createTRPCReact<AppRouter>()
