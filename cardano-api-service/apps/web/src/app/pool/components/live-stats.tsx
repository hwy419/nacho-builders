"use client"

import { useEffect, useState, useCallback, useRef } from "react"

// Pulse animation for live indicator
const pulseKeyframes = `
@keyframes pulse {
  0%, 100% { opacity: 1; transform: scale(1); }
  50% { opacity: 0.5; transform: scale(1.2); }
}
`

// Animated value component that flashes when the value changes
function AnimatedValue({
  value,
  prefix = "",
  className = "",
  large = false
}: {
  value: number
  prefix?: string
  className?: string
  large?: boolean
}) {
  const [isAnimating, setIsAnimating] = useState(false)
  const prevValueRef = useRef(value)

  useEffect(() => {
    if (prevValueRef.current !== value) {
      setIsAnimating(true)
      prevValueRef.current = value
      const timer = setTimeout(() => setIsAnimating(false), 600)
      return () => clearTimeout(timer)
    }
  }, [value])

  return (
    <span
      className={className}
      style={{
        display: "inline-block",
        transition: "all 0.3s ease-out",
        fontSize: large ? "1.75rem" : undefined,
        fontWeight: large ? 700 : undefined,
        fontFamily: large ? "var(--font-mono, monospace)" : undefined,
        ...(isAnimating ? {
          color: "#00ffff",
          textShadow: "0 0 10px rgba(0, 255, 255, 0.8), 0 0 20px rgba(0, 255, 255, 0.4)",
          transform: "scale(1.05)",
        } : {}),
      }}
    >
      {prefix}{value.toLocaleString()}
    </span>
  )
}

// SSE hook for real-time tip updates
// - Epoch progress updates every 1 second with high precision
// - Slot updates every 1 second (interpolated, verified every 5 seconds)
// - Block updates when new block arrives (~20 seconds)
function useLiveTip() {
  const [slotNo, setSlotNo] = useState<number | null>(null)
  const [blockNo, setBlockNo] = useState<number | null>(null)
  const [epoch, setEpoch] = useState<number | null>(null)
  const [epochProgress, setEpochProgress] = useState<number | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const eventSourceRef = useRef<EventSource | null>(null)
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    let isMounted = true

    const connect = () => {
      // Connect to SSE endpoint for real-time tip updates
      const eventSource = new EventSource("/api/public/tip-stream")
      eventSourceRef.current = eventSource

      eventSource.onopen = () => {
        console.log("[Tip SSE] Connected")
        if (isMounted) setIsConnected(true)
      }

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data)
          // Update slot and epoch progress (always present, every 1 second)
          if (data.slotNo !== undefined) {
            setSlotNo(data.slotNo)
          }
          if (data.epoch !== undefined) {
            setEpoch(data.epoch)
          }
          if (data.epochProgress !== undefined) {
            setEpochProgress(data.epochProgress)
          }
          // Update block only when present (new block arrived)
          if (data.blockNo !== undefined) {
            setBlockNo(data.blockNo)
          }
        } catch (e) {
          console.error("[Tip SSE] Parse error:", e)
        }
      }

      eventSource.onerror = () => {
        console.log("[Tip SSE] Error/Disconnected, reconnecting in 3s...")
        eventSource.close()
        if (isMounted) {
          setIsConnected(false)
          reconnectTimeoutRef.current = setTimeout(connect, 3000)
        }
      }
    }

    connect()

    return () => {
      isMounted = false
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current)
      }
      if (eventSourceRef.current) {
        eventSourceRef.current.close()
      }
    }
  }, [])

  return { slotNo, blockNo, epoch, epochProgress, isConnected }
}

interface PoolStatus {
  pool: {
    activeStake: number
    delegators: number
    blocksMinted: number
    lifetimeBlocks: number
    margin: number
    pledge: number
  } | null
  relays: Array<{
    fqdn: string
    port: number
    name: string
    network: "mainnet" | "preprod"
    status: "online" | "offline" | "unknown"
    peerCount: number
    cpuPercent: number
    uptimeSeconds: number
  }>
  network: {
    tip: {
      blockNo: number
      slotNo: number
      hash: string
      time: string
    }
    epoch: number
    epochProgress: number
  }
  timestamp: string
}

function formatNumber(num: number): string {
  if (num >= 1_000_000) {
    return `${(num / 1_000_000).toFixed(2)}M`
  }
  if (num >= 1_000) {
    return `${(num / 1_000).toFixed(1)}K`
  }
  return num.toLocaleString()
}

function formatAda(lovelace: number): string {
  return `₳ ${formatNumber(lovelace)}`
}

function formatUptime(seconds: number): string {
  if (seconds <= 0) return "—"

  const days = Math.floor(seconds / 86400)
  const hours = Math.floor((seconds % 86400) / 3600)
  const minutes = Math.floor((seconds % 3600) / 60)

  if (days > 0) {
    return `${days}d ${hours}h`
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`
  }
  return `${minutes}m`
}

export function LiveStats() {
  const [data, setData] = useState<PoolStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null)

  // Real-time tip updates via SSE
  // Epoch progress and slot update every 1 second, block updates when new block arrives
  const { slotNo: liveSlotNo, blockNo: liveBlockNo, epoch: liveEpoch, epochProgress: liveEpochProgress, isConnected: isLive } = useLiveTip()

  const fetchData = useCallback(async () => {
    try {
      const response = await fetch("/api/public/pool-status")
      if (!response.ok) {
        throw new Error("Failed to fetch pool status")
      }
      const result = await response.json()
      setData(result)
      setLastUpdated(new Date())
      setError(null)
    } catch (err) {
      console.error("Error fetching pool status:", err)
      setError("Failed to load live stats")
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    // Refresh pool/relay stats every 10 seconds (tip comes via WebSocket)
    const interval = setInterval(fetchData, 10000)
    return () => clearInterval(interval)
  }, [fetchData])

  // Use live values from SSE if available, otherwise fall back to polled data
  const currentBlockNo = liveBlockNo ?? data?.network.tip.blockNo ?? 0
  const currentSlotNo = liveSlotNo ?? data?.network.tip.slotNo ?? 0
  const currentEpoch = liveEpoch ?? data?.network.epoch ?? 0
  const currentEpochProgress = liveEpochProgress ?? data?.network.epochProgress ?? 0

  if (loading && !data) {
    return <LiveStatsSkeleton />
  }

  if (error && !data) {
    return (
      <div className="pool-stats-section">
        <div className="pool-container">
          <div className="pool-card" style={{ textAlign: "center", padding: "2rem" }}>
            <p style={{ color: "var(--nacho-error)" }}>{error}</p>
            <button
              className="pool-btn pool-btn-secondary"
              onClick={fetchData}
              style={{ marginTop: "1rem" }}
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!data) return null

  return (
    <div className="pool-stats-section">
      <style dangerouslySetInnerHTML={{ __html: pulseKeyframes }} />
      <div className="pool-container">
        {/* Network Status - Block & Slot Row */}
        <div className="pool-network-bar" style={{ marginBottom: "0.75rem" }}>
          <div className="pool-block-slot-row">
            <div className="pool-block-slot-item">
              <div className="pool-block-slot-label">Block</div>
              <div style={{ color: "var(--nacho-foreground)" }}>
                <AnimatedValue value={currentBlockNo} prefix="#" large />
              </div>
            </div>
            <div className="pool-block-slot-divider" />
            <div className="pool-block-slot-item">
              <div className="pool-block-slot-label">Slot</div>
              <div style={{ color: "var(--nacho-foreground)" }}>
                <AnimatedValue value={currentSlotNo} large />
              </div>
            </div>
            <div className="pool-live-indicator">
              {isLive && (
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: "0.25rem",
                    fontWeight: 600,
                    color: "#ff4444",
                  }}
                >
                  <span
                    style={{
                      width: "8px",
                      height: "8px",
                      borderRadius: "50%",
                      backgroundColor: "#ff4444",
                      animation: "pulse 1.5s ease-in-out infinite",
                    }}
                  />
                  LIVE
                </span>
              )}
              <span>
                {lastUpdated?.toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </span>
            </div>
          </div>
        </div>

        {/* Epoch Progress Row */}
        <div className="pool-network-bar" style={{ marginBottom: "1.5rem" }}>
          <div style={{ padding: "1rem 1.5rem" }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: "0.5rem",
              }}
            >
              <span
                style={{
                  fontSize: "0.875rem",
                  color: "var(--nacho-muted)",
                  textTransform: "uppercase",
                  letterSpacing: "0.05em",
                }}
              >
                Epoch {currentEpoch}
              </span>
              <span
                style={{
                  fontSize: "1.125rem",
                  fontWeight: 600,
                  color: "var(--nacho-primary)",
                  fontFamily: "var(--font-mono, monospace)",
                }}
              >
                {currentEpochProgress.toFixed(4)}%
              </span>
            </div>
            <div className="pool-epoch-bar" style={{ height: "8px" }}>
              <div
                className="pool-epoch-bar-fill"
                style={{
                  width: `${currentEpochProgress}%`,
                  transition: "width 0.3s ease-out",
                }}
              />
            </div>
          </div>
        </div>

        {/* Pool Stats */}
        {data.pool && (
          <div className="pool-stats-grid" style={{ marginBottom: "1.5rem" }}>
            <div className="pool-card">
              <div className="pool-card-label">Active Stake</div>
              <div className="pool-card-value text-primary">
                {formatAda(data.pool.activeStake)}
              </div>
            </div>
            <div className="pool-card">
              <div className="pool-card-label">Delegators</div>
              <div className="pool-card-value">{data.pool.delegators}</div>
            </div>
            <div className="pool-card">
              <div className="pool-card-label">Blocks (Epoch)</div>
              <div className="pool-card-value">{data.pool.blocksMinted}</div>
            </div>
            <div className="pool-card">
              <div className="pool-card-label">Lifetime Blocks</div>
              <div className="pool-card-value">{data.pool.lifetimeBlocks}</div>
            </div>
            <div className="pool-card">
              <div className="pool-card-label">Margin</div>
              <div className="pool-card-value">{data.pool.margin}%</div>
            </div>
            <div className="pool-card">
              <div className="pool-card-label">Pledge</div>
              <div className="pool-card-value">{formatAda(data.pool.pledge)}</div>
            </div>
          </div>
        )}

        {/* Relay Status */}
        <h3
          style={{
            fontSize: "0.875rem",
            color: "var(--nacho-muted)",
            textTransform: "uppercase",
            letterSpacing: "0.05em",
            marginBottom: "1rem",
          }}
        >
          Relay Status
        </h3>
        <div className="pool-relays-grid">
          {data.relays.map((relay) => (
            <div key={`${relay.fqdn}:${relay.port}`} className="pool-relay-card">
              <div
                className={`pool-relay-status ${relay.status}`}
                title={relay.status}
              />
              <div className="pool-relay-info">
                <div className="pool-relay-fqdn">
                  <span>{relay.fqdn}:{relay.port}</span>
                  <span className={`pool-relay-network-badge ${relay.network}`}>
                    {relay.network}
                  </span>
                </div>
                <div className="pool-relay-stats">
                  <span>{relay.peerCount} peers</span>
                  <span>CPU {relay.cpuPercent}%</span>
                  <span>Up {formatUptime(relay.uptimeSeconds)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

function LiveStatsSkeleton() {
  return (
    <div className="pool-stats-section">
      <div className="pool-container">
        {/* Network Bar Skeleton */}
        <div className="pool-network-bar">
          <div className="pool-network-bar-inner">
            <div className="pool-skeleton" style={{ width: "100px", height: "24px" }} />
            <div className="pool-skeleton" style={{ width: "120px", height: "24px" }} />
            <div className="pool-skeleton" style={{ width: "200px", height: "24px" }} />
          </div>
        </div>

        {/* Stats Grid Skeleton */}
        <div className="pool-stats-grid" style={{ marginBottom: "1.5rem" }}>
          {[...Array(6)].map((_, i) => (
            <div key={i} className="pool-card">
              <div
                className="pool-skeleton"
                style={{ width: "80px", height: "12px", marginBottom: "0.5rem" }}
              />
              <div className="pool-skeleton" style={{ width: "100%", height: "28px" }} />
            </div>
          ))}
        </div>

        {/* Relays Skeleton */}
        <div
          className="pool-skeleton"
          style={{ width: "120px", height: "14px", marginBottom: "1rem" }}
        />
        <div className="pool-relays-grid">
          {[...Array(2)].map((_, i) => (
            <div key={i} className="pool-relay-card">
              <div
                className="pool-skeleton"
                style={{ width: "12px", height: "12px", borderRadius: "50%" }}
              />
              <div className="pool-relay-info">
                <div
                  className="pool-skeleton"
                  style={{ width: "150px", height: "16px", marginBottom: "0.25rem" }}
                />
                <div className="pool-skeleton" style={{ width: "100px", height: "12px" }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
