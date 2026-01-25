/**
 * Prometheus Client for Relay Metrics
 *
 * Queries Prometheus for Cardano relay node health metrics.
 * Prometheus server: 192.168.160.2:9090
 */

// Prometheus server configuration
const PROMETHEUS_URL = process.env.PROMETHEUS_URL || 'http://192.168.160.2:9090'

// Relay configuration - maps Prometheus instance names to their public FQDN/port
const RELAY_CONFIG = [
  { instance: 'cardano-relay1', fqdn: 'nacho.builders', port: 6001, name: 'Relay 1', network: 'mainnet' as const },
  { instance: 'cardano-relay2', fqdn: 'nacho.builders', port: 6002, name: 'Relay 2', network: 'mainnet' as const },
  { instance: 'cardano-preprod', fqdn: 'nacho.builders', port: 6003, name: 'Preprod', network: 'preprod' as const },
]

export interface RelayStatus {
  fqdn: string
  port: number
  name: string
  network: 'mainnet' | 'preprod'
  status: 'online' | 'offline' | 'unknown'
  peerCount: number
  cpuPercent: number
  uptimeSeconds: number
}

export interface RelayMetrics {
  relays: RelayStatus[]
  timestamp: Date
}

/**
 * Query Prometheus for a specific metric
 */
async function queryPrometheus(query: string): Promise<unknown> {
  try {
    const url = `${PROMETHEUS_URL}/api/v1/query?query=${encodeURIComponent(query)}`
    const response = await fetch(url, {
      method: 'GET',
      headers: { 'Accept': 'application/json' },
      // Short timeout for internal network
      signal: AbortSignal.timeout(5000),
    })

    if (!response.ok) {
      console.error(`Prometheus query failed: ${response.status}`)
      return null
    }

    const data = await response.json()
    return data
  } catch (error) {
    console.error('Prometheus query error:', error)
    return null
  }
}

/**
 * Check if a relay node is up
 */
async function getRelayUp(instance: string): Promise<boolean> {
  const result = await queryPrometheus(`up{instance="${instance}",job="cardano-node"}`) as {
    status: string
    data?: { result?: Array<{ value?: [number, string] }> }
  } | null

  if (!result || result.status !== 'success' || !result.data?.result?.length) {
    return false
  }

  // Check if the cardano-node job is up
  return result.data.result.some((r) => r.value?.[1] === '1')
}

/**
 * Get peer count for a relay node from Cardano node metrics
 * Uses ActivePeers or hot which shows the total number of active peer connections
 * Note: Metric names vary by node version - some have _int suffix, some don't
 */
async function getRelayPeerCount(instance: string): Promise<number> {
  // Try different possible metric names - prefer ActivePeers (total active connections)
  // Include both with and without _int suffix for compatibility
  const metrics = [
    `cardano_node_metrics_peerSelection_ActivePeers_int{instance="${instance}"}`,
    `cardano_node_metrics_peerSelection_Hot_int{instance="${instance}"}`,
    `cardano_node_metrics_peerSelection_hot{instance="${instance}"}`,
    `cardano_node_metrics_peerSelection_EstablishedPeers{instance="${instance}"}`,
    `cardano_node_metrics_peersFromNodeKernel_int{instance="${instance}"}`,
  ]

  for (const query of metrics) {
    const result = await queryPrometheus(query) as {
      status: string
      data?: { result?: Array<{ value?: [number, string] }> }
    } | null

    if (result?.status === 'success' && result.data?.result?.length) {
      const value = result.data.result[0]?.value?.[1]
      if (value) {
        return parseInt(value) || 0
      }
    }
  }

  return 0
}

/**
 * Get CPU usage percentage for a relay node
 *
 * Uses rate() over 1 minute for CPU seconds
 */
async function getRelayCpuPercent(instance: string): Promise<number> {
  // Query for idle CPU, then calculate usage
  const query = `100 - (avg by (instance) (rate(node_cpu_seconds_total{mode="idle",instance="${instance}"}[1m])) * 100)`

  const result = await queryPrometheus(query) as {
    status: string
    data?: { result?: Array<{ value?: [number, string] }> }
  } | null

  if (result?.status === 'success' && result.data?.result?.length) {
    const value = result.data.result[0]?.value?.[1]
    if (value) {
      return Math.round(parseFloat(value) * 10) / 10 // Round to 1 decimal
    }
  }

  return 0
}

/**
 * Get system uptime for a relay node in seconds
 * Uses node_exporter's node_time_seconds and node_boot_time_seconds
 */
async function getRelayUptime(instance: string): Promise<number> {
  const query = `node_time_seconds{instance="${instance}"} - node_boot_time_seconds{instance="${instance}"}`

  const result = await queryPrometheus(query) as {
    status: string
    data?: { result?: Array<{ value?: [number, string] }> }
  } | null

  if (result?.status === 'success' && result.data?.result?.length) {
    const value = result.data.result[0]?.value?.[1]
    if (value) {
      return Math.floor(parseFloat(value))
    }
  }

  return 0
}

/**
 * Get all relay metrics
 */
export async function getRelayMetrics(): Promise<RelayMetrics> {
  const relays: RelayStatus[] = []

  for (const relay of RELAY_CONFIG) {
    // Query all metrics in parallel for this relay
    const [isUp, peerCount, cpuPercent, uptimeSeconds] = await Promise.all([
      getRelayUp(relay.instance),
      getRelayPeerCount(relay.instance),
      getRelayCpuPercent(relay.instance),
      getRelayUptime(relay.instance),
    ])

    relays.push({
      fqdn: relay.fqdn,
      port: relay.port,
      name: relay.name,
      network: relay.network,
      status: isUp ? 'online' : 'offline',
      peerCount,
      cpuPercent,
      uptimeSeconds,
    })
  }

  return {
    relays,
    timestamp: new Date(),
  }
}

/**
 * Get a quick health check for all relays
 */
export async function getRelayHealth(): Promise<{
  allHealthy: boolean
  onlineCount: number
  totalCount: number
}> {
  const metrics = await getRelayMetrics()
  const onlineCount = metrics.relays.filter((r) => r.status === 'online').length

  return {
    allHealthy: onlineCount === metrics.relays.length,
    onlineCount,
    totalCount: metrics.relays.length,
  }
}
