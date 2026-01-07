/**
 * Next.js Instrumentation
 *
 * This file is called once when the Next.js server starts.
 * Used to initialize background services like the Chain Sync payment monitor.
 *
 * @see https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation
 */

export async function register() {
  // Only run on server, not edge runtime
  if (process.env.NEXT_RUNTIME === "nodejs") {
    console.log("[Instrumentation] Registering server-side services...")

    // Start Chain Sync payment monitor if enabled
    if (process.env.CHAIN_SYNC_ENABLED === "true") {
      console.log("[Instrumentation] Starting Chain Sync payment monitor...")

      // Dynamic import to avoid bundling issues
      const { startChainSyncMonitor } = await import("./lib/chain-sync")

      // Start the monitor (non-blocking)
      startChainSyncMonitor().catch((error) => {
        console.error(
          "[Instrumentation] Failed to start Chain Sync monitor:",
          error
        )
      })
    } else {
      console.log(
        "[Instrumentation] Chain Sync disabled (set CHAIN_SYNC_ENABLED=true to enable)"
      )
    }
  }
}
