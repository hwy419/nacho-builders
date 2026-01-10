"use client"

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession } from "next-auth/react"
import Link from "next/link"
import { cn } from "@/lib/utils"
import {
  Play,
  Square,
  Pause,
  RotateCcw,
  Trash2,
  Key,
  Loader2,
  ChevronDown,
  Copy,
  Check,
} from "lucide-react"

// ============================================================================
// Types
// ============================================================================

interface Point {
  slot: number
  id: string
}

interface BlockInfo {
  height: number
  slot: number
  hash: string
  txCount: number
  era: string
  rawJson?: object
}

type ConsoleEntryBase =
  | { type: "info"; message: string }
  | { type: "success"; message: string }
  | { type: "waiting"; message: string }
  | { type: "block"; block: BlockInfo }
  | { type: "rollback"; point: Point; message: string }
  | { type: "error"; message: string }

type ConsoleEntry = ConsoleEntryBase & { timestamp: Date }

interface JsonRpcMessage {
  direction: "sent" | "received"
  message: object
  timestamp: Date
}

type ConnectionStatus =
  | "disconnected"
  | "connecting"
  | "querying-tip"
  | "finding-intersection"
  | "syncing"
  | "paused"
  | "error"

type Network = "mainnet" | "preprod"

// ============================================================================
// Constants
// ============================================================================

const STORAGE_KEY = "nacho-playground-apikey"

const STATUS_CONFIG: Record<
  ConnectionStatus,
  { label: string; color: string; icon: string; pulse?: boolean }
> = {
  disconnected: { label: "Disconnected", color: "text-red-500", icon: "○" },
  connecting: {
    label: "Connecting...",
    color: "text-yellow-500",
    icon: "◐",
    pulse: true,
  },
  "querying-tip": {
    label: "Querying tip...",
    color: "text-yellow-500",
    icon: "◐",
    pulse: true,
  },
  "finding-intersection": {
    label: "Finding intersection...",
    color: "text-yellow-500",
    icon: "◐",
    pulse: true,
  },
  syncing: { label: "Connected", color: "text-green-500", icon: "●" },
  paused: { label: "Paused", color: "text-blue-500", icon: "◉" },
  error: { label: "Error", color: "text-red-500", icon: "✗" },
}

// ============================================================================
// Component
// ============================================================================

export function ChainSyncDemo() {
  const { data: session, status: sessionStatus } = useSession()

  // Connection state
  const [connectionStatus, setConnectionStatus] =
    useState<ConnectionStatus>("disconnected")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)
  const [latency, setLatency] = useState<number | null>(null)

  // Network and API key
  const [network, setNetwork] = useState<Network>("preprod")
  const [apiKey, setApiKey] = useState("")
  const [showKeyInput, setShowKeyInput] = useState(false)

  // Console output
  const [consoleEntries, setConsoleEntries] = useState<ConsoleEntry[]>([])
  const [jsonRpcMessages, setJsonRpcMessages] = useState<JsonRpcMessage[]>([])

  // Stats
  const [blocksReceived, setBlocksReceived] = useState(0)
  const [rollbackCount, setRollbackCount] = useState(0)
  const [syncStartTime, setSyncStartTime] = useState<Date | null>(null)

  // UI state
  const [autoScroll, setAutoScroll] = useState(true)
  const [copiedHash, setCopiedHash] = useState<string | null>(null)

  // Refs
  const wsRef = useRef<WebSocket | null>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const jsonRef = useRef<HTMLDivElement>(null)
  const requestIdRef = useRef(0)
  const pendingRequestsRef = useRef<
    Map<
      number,
      {
        resolve: (value: unknown) => void
        reject: (error: Error) => void
        startTime: number
      }
    >
  >(new Map())
  const isPausedRef = useRef(false)

  // Load API key from localStorage
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY)
    if (saved) {
      setApiKey(saved)
    }
  }, [])

  // Auto-scroll effect
  useEffect(() => {
    if (autoScroll && consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
    if (autoScroll && jsonRef.current) {
      jsonRef.current.scrollTop = jsonRef.current.scrollHeight
    }
  }, [consoleEntries, jsonRpcMessages, autoScroll])

  // Cleanup WebSocket on unmount
  useEffect(() => {
    return () => {
      wsRef.current?.close()
    }
  }, [])

  // ============================================================================
  // Helpers
  // ============================================================================

  const addConsoleEntry = useCallback((entry: ConsoleEntryBase) => {
    setConsoleEntries((prev) => [
      ...prev,
      { ...entry, timestamp: new Date() } as ConsoleEntry,
    ])
  }, [])

  const addJsonRpcMessage = useCallback(
    (direction: "sent" | "received", message: object) => {
      setJsonRpcMessages((prev) => [
        ...prev,
        { direction, message, timestamp: new Date() },
      ])
    },
    []
  )

  const saveApiKey = (key: string) => {
    setApiKey(key)
    localStorage.setItem(STORAGE_KEY, key)
    setShowKeyInput(false)
  }

  const copyHash = async (hash: string) => {
    await navigator.clipboard.writeText(hash)
    setCopiedHash(hash)
    setTimeout(() => setCopiedHash(null), 2000)
  }

  // ============================================================================
  // WebSocket Operations
  // ============================================================================

  const sendRequest = useCallback(
    (method: string, params?: object): Promise<unknown> => {
      return new Promise((resolve, reject) => {
        if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) {
          reject(new Error("WebSocket not connected"))
          return
        }

        const id = ++requestIdRef.current
        const request = {
          jsonrpc: "2.0",
          method,
          ...(params && { params }),
          id,
        }

        pendingRequestsRef.current.set(id, {
          resolve,
          reject,
          startTime: performance.now(),
        })

        addJsonRpcMessage("sent", request)
        wsRef.current.send(JSON.stringify(request))

        // Timeout after 30s (180s for nextBlock)
        const timeout = method === "nextBlock" ? 180000 : 30000
        setTimeout(() => {
          if (pendingRequestsRef.current.has(id)) {
            pendingRequestsRef.current.delete(id)
            reject(new Error(`Request timeout for ${method}`))
          }
        }, timeout)
      })
    },
    [addJsonRpcMessage]
  )

  const requestNextBlock = useCallback(() => {
    if (
      !wsRef.current ||
      wsRef.current.readyState !== WebSocket.OPEN ||
      isPausedRef.current
    ) {
      return
    }

    const id = ++requestIdRef.current
    const request = {
      jsonrpc: "2.0",
      method: "nextBlock",
      id,
    }

    addJsonRpcMessage("sent", request)
    wsRef.current.send(JSON.stringify(request))
  }, [addJsonRpcMessage])

  const handleMessage = useCallback(
    async (event: MessageEvent) => {
      // Handle Blob data (some browsers send WebSocket messages as Blobs)
      let rawData: string
      if (event.data instanceof Blob) {
        rawData = await event.data.text()
      } else {
        rawData = event.data
      }
      const data = JSON.parse(rawData)
      addJsonRpcMessage("received", data)

      // Handle pending request responses
      if (data.id && pendingRequestsRef.current.has(data.id)) {
        const { resolve, reject, startTime } = pendingRequestsRef.current.get(
          data.id
        )!
        pendingRequestsRef.current.delete(data.id)

        const elapsed = Math.round(performance.now() - startTime)
        setLatency(elapsed)

        if (data.error) {
          reject(new Error(data.error.message))
        } else {
          resolve(data.result)
        }
        return
      }

      // Handle nextBlock streaming responses
      if (data.result?.direction === "forward") {
        const block = data.result.block
        addConsoleEntry({
          type: "block",
          block: {
            height: block.height,
            slot: block.slot,
            hash: block.id,
            txCount: block.transactions?.length ?? 0,
            era: block.era,
            rawJson: block,
          },
        })
        setBlocksReceived((prev) => prev + 1)

        if (!isPausedRef.current) {
          addConsoleEntry({ type: "waiting", message: "Waiting for next block..." })
          requestNextBlock()
        }
      } else if (data.result?.direction === "backward") {
        const point = data.result.point
        addConsoleEntry({
          type: "rollback",
          point,
          message: `Chain reorganization - rolling back to slot ${point.slot}`,
        })
        setRollbackCount((prev) => prev + 1)

        if (!isPausedRef.current) {
          addConsoleEntry({ type: "waiting", message: "Waiting for next block..." })
          requestNextBlock()
        }
      }
    },
    [addConsoleEntry, addJsonRpcMessage, requestNextBlock]
  )

  // ============================================================================
  // Connection Controls
  // ============================================================================

  const connect = async () => {
    if (!apiKey) {
      setShowKeyInput(true)
      setErrorMessage("Please enter your API key first")
      return
    }

    setErrorMessage(null)
    setConnectionStatus("connecting")
    isPausedRef.current = false

    const endpoint =
      network === "preprod"
        ? `wss://api.nacho.builders/v1/preprod/ogmios?apikey=${apiKey}`
        : `wss://api.nacho.builders/v1/ogmios?apikey=${apiKey}`

    addConsoleEntry({
      type: "info",
      message: `Connecting to ${network === "preprod" ? "Preprod" : "Mainnet"} Ogmios...`,
    })

    try {
      // Create WebSocket
      const ws = new WebSocket(endpoint)
      wsRef.current = ws

      await new Promise<void>((resolve, reject) => {
        ws.onopen = () => resolve()
        ws.onerror = () => reject(new Error("Connection failed"))
        setTimeout(() => reject(new Error("Connection timeout")), 10000)
      })

      addConsoleEntry({ type: "success", message: "WebSocket connection established" })

      // Set up message handler
      ws.onmessage = handleMessage
      ws.onclose = () => {
        setConnectionStatus("disconnected")
        addConsoleEntry({ type: "info", message: "Connection closed" })
      }
      ws.onerror = () => {
        setConnectionStatus("error")
        setErrorMessage("WebSocket error")
      }

      // Query chain tip
      setConnectionStatus("querying-tip")
      addConsoleEntry({ type: "info", message: "Querying chain tip..." })
      const tip = (await sendRequest("queryNetwork/tip")) as {
        slot: number
        id: string
      }
      addConsoleEntry({
        type: "success",
        message: `Chain tip: slot ${tip.slot.toLocaleString()}, hash ${tip.id.slice(0, 8)}...`,
      })

      // Find intersection
      setConnectionStatus("finding-intersection")
      addConsoleEntry({ type: "info", message: "Finding intersection at tip..." })
      const intersection = (await sendRequest("findIntersection", {
        points: [{ slot: tip.slot, id: tip.id }],
      })) as { intersection: Point; tip: Point }
      addConsoleEntry({
        type: "success",
        message: "Intersection found!",
      })
      addConsoleEntry({
        type: "info",
        message: `Starting sync from slot ${tip.slot.toLocaleString()}`,
      })

      // Start syncing
      setConnectionStatus("syncing")
      setSyncStartTime(new Date())
      addConsoleEntry({ type: "waiting", message: "Waiting for next block..." })
      requestNextBlock()
    } catch (err) {
      setConnectionStatus("error")
      setErrorMessage(err instanceof Error ? err.message : "Connection failed")
      addConsoleEntry({
        type: "error",
        message: err instanceof Error ? err.message : "Connection failed",
      })
    }
  }

  const disconnect = () => {
    addConsoleEntry({ type: "info", message: "Closing WebSocket connection..." })
    wsRef.current?.close()
    wsRef.current = null
    setConnectionStatus("disconnected")
    isPausedRef.current = false
  }

  const pauseSync = () => {
    isPausedRef.current = true
    setConnectionStatus("paused")
    addConsoleEntry({
      type: "info",
      message: "Sync paused - connection remains open",
    })
  }

  const resumeSync = () => {
    isPausedRef.current = false
    setConnectionStatus("syncing")
    addConsoleEntry({ type: "info", message: "Resuming sync..." })
    addConsoleEntry({ type: "waiting", message: "Waiting for next block..." })
    requestNextBlock()
  }

  const clearConsole = () => {
    setConsoleEntries([])
    setJsonRpcMessages([])
    setBlocksReceived(0)
    setRollbackCount(0)
    setSyncStartTime(null)
  }

  // ============================================================================
  // Render Helpers
  // ============================================================================

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-US", {
      hour12: false,
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    })
  }

  const formatUptime = () => {
    if (!syncStartTime) return null
    const seconds = Math.floor((Date.now() - syncStartTime.getTime()) / 1000)
    const mins = Math.floor(seconds / 60)
    const secs = seconds % 60
    return `${mins}m ${secs}s`
  }

  const truncateHash = (hash: string) => {
    return `${hash.slice(0, 8)}...${hash.slice(-6)}`
  }

  // ============================================================================
  // Render
  // ============================================================================

  // Loading state
  if (sessionStatus === "loading") {
    return (
      <div className="my-6 p-6 bg-bg-secondary border border-border rounded-lg">
        <div className="flex items-center justify-center gap-2 text-text-secondary">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading...</span>
        </div>
      </div>
    )
  }

  // Not logged in
  if (!session) {
    return (
      <div className="my-6 p-6 bg-bg-secondary border border-accent/30 rounded-lg text-center">
        <h4 className="text-lg font-semibold text-text-primary mb-2">
          🔗 Chain Sync Demo
        </h4>
        <p className="text-text-secondary mb-4">
          Sign in to connect to the Cardano blockchain and watch blocks stream in
          real-time
        </p>
        <Link
          href="/login"
          className="inline-flex items-center gap-2 px-4 py-2 bg-accent hover:bg-accent-hover text-white rounded-lg transition-colors"
        >
          Sign In to Try
        </Link>
      </div>
    )
  }

  const statusConfig = STATUS_CONFIG[connectionStatus]
  const isConnected = ["syncing", "paused"].includes(connectionStatus)
  const isConnecting = [
    "connecting",
    "querying-tip",
    "finding-intersection",
  ].includes(connectionStatus)

  return (
    <div className="my-6 border border-border rounded-lg overflow-hidden bg-bg-secondary">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-bg-tertiary border-b border-border">
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold text-text-primary">
            🔗 Chain Sync Demo
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Network Selector */}
          <div className="relative">
            <select
              value={network}
              onChange={(e) => setNetwork(e.target.value as Network)}
              disabled={isConnected || isConnecting}
              className={cn(
                "appearance-none pl-3 pr-8 py-1.5 text-xs rounded-md border border-border",
                "bg-bg-primary text-text-primary",
                "focus:outline-none focus:ring-2 focus:ring-accent/50",
                (isConnected || isConnecting) && "opacity-50 cursor-not-allowed"
              )}
            >
              <option value="preprod">Preprod</option>
              <option value="mainnet">Mainnet</option>
            </select>
            <ChevronDown className="absolute right-2 top-1/2 -translate-y-1/2 h-3 w-3 text-text-muted pointer-events-none" />
          </div>

          {/* API Key Button */}
          <button
            onClick={() => setShowKeyInput(!showKeyInput)}
            className={cn(
              "flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md transition-colors border",
              apiKey
                ? "text-green-500 bg-green-500/10 border-green-500/30"
                : "text-yellow-500 bg-yellow-500/10 border-yellow-500/30"
            )}
          >
            <Key className="h-3 w-3" />
            {apiKey ? `${apiKey.slice(0, 12)}...` : "Set API Key"}
          </button>

          {/* Status Indicator */}
          <div
            className={cn(
              "flex items-center gap-1.5 px-2 py-1 text-xs",
              statusConfig.color,
              statusConfig.pulse && "animate-pulse"
            )}
          >
            <span>{statusConfig.icon}</span>
            <span>{statusConfig.label}</span>
            {latency !== null && isConnected && (
              <span className="text-text-muted ml-1">• {latency}ms</span>
            )}
          </div>

          {/* Control Buttons */}
          <div className="flex items-center gap-1">
            {!isConnected && !isConnecting && (
              <button
                onClick={connect}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <Play className="h-3 w-3" />
                Open Connection
              </button>
            )}

            {connectionStatus === "syncing" && (
              <button
                onClick={pauseSync}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-blue-600 hover:bg-blue-700 text-white transition-colors"
              >
                <Pause className="h-3 w-3" />
                Pause
              </button>
            )}

            {connectionStatus === "paused" && (
              <button
                onClick={resumeSync}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-green-600 hover:bg-green-700 text-white transition-colors"
              >
                <RotateCcw className="h-3 w-3" />
                Resume
              </button>
            )}

            {isConnected && (
              <button
                onClick={disconnect}
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md bg-red-600 hover:bg-red-700 text-white transition-colors"
              >
                <Square className="h-3 w-3" />
                Close
              </button>
            )}

            <button
              onClick={clearConsole}
              className="flex items-center gap-1.5 px-2 py-1.5 text-xs rounded-md bg-bg-primary hover:bg-bg-tertiary text-text-secondary transition-colors border border-border"
              title="Clear console"
            >
              <Trash2 className="h-3 w-3" />
            </button>
          </div>
        </div>
      </div>

      {/* API Key Input */}
      {showKeyInput && (
        <div className="px-4 py-3 bg-bg-primary border-b border-border">
          <div className="flex gap-2">
            <input
              type="password"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="Enter your API key (napi_...)"
              className={cn(
                "flex-1 px-3 py-2 font-mono text-sm rounded-md",
                "bg-bg-secondary border border-border",
                "focus:outline-none focus:ring-2 focus:ring-accent/50",
                "text-text-primary placeholder:text-text-muted"
              )}
            />
            <button
              onClick={() => saveApiKey(apiKey)}
              className="px-3 py-2 text-sm bg-accent hover:bg-accent-hover text-white rounded-md transition-colors"
            >
              Save
            </button>
          </div>
          <p className="mt-2 text-xs text-text-muted">
            Get your API key from{" "}
            <Link href="/api-keys" className="text-accent hover:underline">
              API Keys
            </Link>
            . Your key is stored locally in your browser.
          </p>
        </div>
      )}

      {/* Error Message */}
      {errorMessage && (
        <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/30 text-red-500 text-sm">
          {errorMessage}
        </div>
      )}

      {/* Main Content - Side by Side */}
      <div className="grid md:grid-cols-2 divide-x divide-border">
        {/* Left Panel - Console Output */}
        <div className="flex flex-col">
          <div className="px-3 py-2 bg-bg-tertiary border-b border-border">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
              Console Output
            </span>
          </div>
          <div
            ref={consoleRef}
            className="h-80 overflow-y-auto p-3 font-mono text-xs bg-[#0a0a0f]"
          >
            {consoleEntries.length === 0 ? (
              <div className="text-text-muted text-center py-8">
                Click "Open Connection" to connect to the Cardano blockchain and
                start syncing.
              </div>
            ) : (
              <div className="space-y-1">
                {consoleEntries.map((entry, i) => (
                  <div key={i} className="flex items-start gap-2">
                    <span className="text-text-muted shrink-0">
                      {formatTime(entry.timestamp)}
                    </span>
                    {entry.type === "info" && (
                      <>
                        <span className="text-text-muted">→</span>
                        <span className="text-text-secondary">{entry.message}</span>
                      </>
                    )}
                    {entry.type === "success" && (
                      <>
                        <span className="text-green-500">✓</span>
                        <span className="text-green-400">{entry.message}</span>
                      </>
                    )}
                    {entry.type === "waiting" && (
                      <>
                        <span className="text-yellow-500 animate-pulse">⏳</span>
                        <span className="text-yellow-400">{entry.message}</span>
                      </>
                    )}
                    {entry.type === "block" && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-cyan-500">█</span>
                          <span className="text-text-primary">
                            Block #{entry.block.height.toLocaleString()}
                          </span>
                          <span className="text-text-muted">│</span>
                          <span
                            className={cn(
                              "px-1.5 py-0.5 rounded text-xs",
                              entry.block.txCount > 0
                                ? "bg-green-500/20 text-green-400"
                                : "bg-bg-tertiary text-text-muted"
                            )}
                          >
                            {entry.block.txCount} tx
                            {entry.block.txCount !== 1 ? "s" : ""}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 pl-5">
                          <span className="text-text-muted text-xs">slot:</span>
                          <span className="text-text-secondary font-mono text-xs">
                            {entry.block.slot.toLocaleString()}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 pl-5">
                          <span className="text-text-muted text-xs">hash:</span>
                          <button
                            onClick={() => copyHash(entry.block.hash)}
                            className="text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-mono text-xs"
                            title="Click to copy hash"
                          >
                            {truncateHash(entry.block.hash)}
                            {copiedHash === entry.block.hash ? (
                              <Check className="h-3 w-3" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-50" />
                            )}
                          </button>
                        </div>
                      </div>
                    )}
                    {entry.type === "rollback" && (
                      <div className="flex flex-col gap-1">
                        <div className="flex items-center gap-2">
                          <span className="text-yellow-500">⚠</span>
                          <span className="text-yellow-400">Chain reorganization</span>
                        </div>
                        <div className="flex items-center gap-2 pl-5">
                          <span className="text-yellow-400">
                            rolling back to slot {entry.point.slot.toLocaleString()}
                          </span>
                        </div>
                      </div>
                    )}
                    {entry.type === "error" && (
                      <>
                        <span className="text-red-500">✗</span>
                        <span className="text-red-400">{entry.message}</span>
                      </>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - JSON-RPC Messages */}
        <div className="flex flex-col">
          <div className="px-3 py-2 bg-bg-tertiary border-b border-border">
            <span className="text-xs font-medium text-text-muted uppercase tracking-wider">
              JSON-RPC Messages
            </span>
          </div>
          <div
            ref={jsonRef}
            className="h-80 overflow-y-auto p-3 font-mono text-xs bg-[#0a0a0f]"
          >
            {jsonRpcMessages.length === 0 ? (
              <div className="text-text-muted text-center py-8">
                WebSocket messages will appear here as they are sent and received.
              </div>
            ) : (
              <div className="space-y-2">
                {jsonRpcMessages.map((msg, i) => (
                  <div key={i}>
                    <div className="flex items-center gap-2 text-text-muted mb-0.5">
                      <span>{formatTime(msg.timestamp)}</span>
                      <span
                        className={
                          msg.direction === "sent"
                            ? "text-blue-400"
                            : "text-green-400"
                        }
                      >
                        {msg.direction === "sent" ? "→ SENT" : "← RECV"}
                      </span>
                    </div>
                    <pre className="text-text-secondary whitespace-pre-wrap break-all pl-4 border-l-2 border-border">
                      {JSON.stringify(msg.message, null, 2)}
                    </pre>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2 bg-bg-tertiary border-t border-border text-xs text-text-muted">
        <div className="flex items-center gap-3">
          <span>{blocksReceived} blocks</span>
          {rollbackCount > 0 && (
            <span className="text-yellow-500">{rollbackCount} rollback{rollbackCount !== 1 ? "s" : ""}</span>
          )}
          {syncStartTime && <span>• Syncing for {formatUptime()}</span>}
        </div>
        <div>
          FREE tier: uses daily quota (100k/day)
        </div>
      </div>
    </div>
  )
}
