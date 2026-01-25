/**
 * Server-Sent Events endpoint for real-time chain tip updates
 *
 * - Slot & Epoch progress: Calculated from system time, updates every 1 second
 * - Block: Received via WebSocket chain sync from Ogmios (real-time)
 */

import { NextRequest } from "next/server"
import WebSocket from "ws"

// Ogmios WebSocket endpoint on relay
const OGMIOS_WS_URL = process.env.OGMIOS_WS_URL || "ws://192.168.160.11:1337"

// Cardano mainnet Shelley era constants
const SHELLEY_START_SLOT = 4492800
const SHELLEY_START_TIME = 1596059091 // Unix timestamp (2020-07-29T21:44:51Z)
const EPOCH_LENGTH_SLOTS = 432000 // 5 days in slots (1 slot = 1 second)
const SHELLEY_START_EPOCH = 208

interface TipData {
  slotNo: number
  epoch: number
  epochProgress: number
  blockNo?: number
}

interface OgmiosPoint {
  slot: number
  id: string
}

/**
 * Calculate current slot from system time
 */
function getCurrentSlot(): number {
  const now = Math.floor(Date.now() / 1000)
  return SHELLEY_START_SLOT + (now - SHELLEY_START_TIME)
}

/**
 * Calculate epoch and progress from slot
 */
function getEpochInfo(slot: number): { epoch: number; epochProgress: number } {
  const slotsSinceShelley = slot - SHELLEY_START_SLOT
  const epochsSinceShelley = Math.floor(slotsSinceShelley / EPOCH_LENGTH_SLOTS)
  const epoch = SHELLEY_START_EPOCH + epochsSinceShelley
  const slotsIntoCurrentEpoch = slotsSinceShelley % EPOCH_LENGTH_SLOTS
  const epochProgress = (slotsIntoCurrentEpoch / EPOCH_LENGTH_SLOTS) * 100
  return { epoch, epochProgress }
}

export async function GET(request: NextRequest) {
  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    async start(controller) {
      let isRunning = true
      let currentBlockNo: number | null = null
      let ws: WebSocket | null = null
      let tickInterval: NodeJS.Timeout | null = null
      let currentTip: OgmiosPoint | null = null

      // Handle client disconnect
      request.signal.addEventListener("abort", () => {
        isRunning = false
        if (tickInterval) clearInterval(tickInterval)
        if (ws) {
          ws.close()
          ws = null
        }
        controller.close()
      })

      // Connect to Ogmios via WebSocket for chain sync
      const connectWebSocket = () => {
        if (!isRunning) return

        ws = new WebSocket(OGMIOS_WS_URL)

        ws.on("open", () => {
          console.log("[tip-stream] WebSocket connected to Ogmios")
          // Query block height and tip in parallel
          ws?.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "queryNetwork/blockHeight",
            id: "query-block-height"
          }))
          ws?.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "queryNetwork/tip",
            id: "query-tip"
          }))
        })

        ws.on("message", (data) => {
          try {
            const msg = JSON.parse(data.toString())

            // Handle queryNetwork/blockHeight response
            if (msg.id === "query-block-height" && msg.result !== undefined) {
              currentBlockNo = msg.result
              console.log(`[tip-stream] Current block height: ${currentBlockNo}`)

              // Send update with current block
              const slotNo = getCurrentSlot()
              const { epoch, epochProgress } = getEpochInfo(slotNo)
              const tipData: TipData = { slotNo, epoch, epochProgress, blockNo: currentBlockNo ?? undefined }
              try {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify(tipData)}\n\n`))
              } catch {
                return
              }
            }

            // Handle queryNetwork/tip response - get slot and id for chain sync
            if (msg.id === "query-tip" && msg.result) {
              currentTip = { slot: msg.result.slot, id: msg.result.id }
              console.log(`[tip-stream] Current tip slot: ${currentTip.slot}`)

              // Find intersection at the current tip to start chain sync
              ws?.send(JSON.stringify({
                jsonrpc: "2.0",
                method: "findIntersection",
                params: { points: [currentTip] },
                id: "find-intersection"
              }))
            }

            // Handle findIntersection response - start chain sync from tip
            if (msg.id === "find-intersection" && msg.result) {
              console.log("[tip-stream] Chain sync starting from tip")
              // Request next block (will wait for a new block since we're at tip)
              ws?.send(JSON.stringify({
                jsonrpc: "2.0",
                method: "nextBlock",
                id: "next-block"
              }))
            }

            // Handle nextBlock response - new block arrived
            if (msg.id === "next-block" && msg.result) {
              if (msg.result.direction === "forward" && msg.result.block) {
                const block = msg.result.block
                currentBlockNo = block.height
                console.log(`[tip-stream] New block: ${currentBlockNo}`)

                // Send immediate update with new block
                const slotNo = getCurrentSlot()
                const { epoch, epochProgress } = getEpochInfo(slotNo)
                const tipData: TipData = { slotNo, epoch, epochProgress, blockNo: currentBlockNo }

                try {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify(tipData)}\n\n`))
                } catch {
                  // Stream closed
                  return
                }
              }

              // Request next block (continuous chain sync)
              if (isRunning && ws?.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                  jsonrpc: "2.0",
                  method: "nextBlock",
                  id: "next-block"
                }))
              }
            }
          } catch (e) {
            console.error("[tip-stream] WebSocket message error:", e)
          }
        })

        ws.on("error", (error) => {
          console.error("[tip-stream] WebSocket error:", error.message)
        })

        ws.on("close", () => {
          console.log("[tip-stream] WebSocket closed, reconnecting in 3s...")
          ws = null
          if (isRunning) {
            setTimeout(connectWebSocket, 3000)
          }
        })
      }

      // Start WebSocket connection
      connectWebSocket()

      // Send initial data and start 1-second tick for slot/epoch updates
      const slotNo = getCurrentSlot()
      const { epoch, epochProgress } = getEpochInfo(slotNo)
      const initialData: TipData = { slotNo, epoch, epochProgress }
      controller.enqueue(encoder.encode(`data: ${JSON.stringify(initialData)}\n\n`))

      // Update slot/epoch every second (block updates come from chain sync)
      tickInterval = setInterval(() => {
        if (!isRunning) {
          if (tickInterval) clearInterval(tickInterval)
          return
        }

        try {
          const slotNo = getCurrentSlot()
          const { epoch, epochProgress } = getEpochInfo(slotNo)
          // Include current block number if we have it
          const data: TipData = { slotNo, epoch, epochProgress }
          if (currentBlockNo !== null) {
            data.blockNo = currentBlockNo
          }
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(data)}\n\n`))
        } catch {
          // Stream closed
          if (tickInterval) clearInterval(tickInterval)
        }
      }, 1000)
    },
  })

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    },
  })
}

export const dynamic = "force-dynamic"
