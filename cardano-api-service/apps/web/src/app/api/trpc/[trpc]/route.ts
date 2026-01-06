import { fetchRequestHandler } from "@trpc/server/adapters/fetch"
import { appRouter } from "@/server/routers/_app"
import { createTRPCContext } from "@/server/trpc"

/**
 * tRPC API handler for Next.js App Router
 * All tRPC requests are handled through this route
 */
const handler = async (req: Request) => {
  // Debug: Log request details for POST requests
  if (req.method === "POST") {
    const url = new URL(req.url)
    console.log(`tRPC POST: ${url.pathname}${url.search}`)
    console.log("Content-Type:", req.headers.get("content-type"))

    // Clone request to read body without consuming it
    const clonedReq = req.clone()
    try {
      const body = await clonedReq.text()
      console.log("Request body:", body.slice(0, 500))
    } catch (e) {
      console.log("Could not read body:", e)
    }
  }

  return fetchRequestHandler({
    endpoint: "/api/trpc",
    req,
    router: appRouter,
    createContext: createTRPCContext,
    onError: ({ path, error }) => {
      console.error(`tRPC failed on ${path ?? "<no-path>"}: ${error.message}`)
      if (error.cause) {
        console.error("Cause:", error.cause)
      }
    },
  })
}

export { handler as GET, handler as POST }
