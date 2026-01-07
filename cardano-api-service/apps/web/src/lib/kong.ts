// Kong Admin API client for managing API keys

const KONG_ADMIN_URL = process.env.KONG_ADMIN_URL || "http://localhost:8001"

export interface KongConsumer {
  id: string
  username: string
  custom_id?: string
}

export interface KongKeyCredential {
  id: string
  key: string
  consumer: { id: string }
}

export class KongAdminClient {
  private baseUrl: string

  constructor(baseUrl: string = KONG_ADMIN_URL) {
    this.baseUrl = baseUrl
  }

  async createConsumer(username: string, customId?: string): Promise<KongConsumer> {
    const response = await fetch(`${this.baseUrl}/consumers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        username,
        custom_id: customId
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to create Kong consumer: ${response.statusText}`)
    }

    return response.json()
  }

  async createKeyCredential(consumerId: string, key: string): Promise<KongKeyCredential> {
    const response = await fetch(`${this.baseUrl}/consumers/${consumerId}/key-auth`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ key })
    })

    if (!response.ok) {
      throw new Error(`Failed to create Kong key: ${response.statusText}`)
    }

    return response.json()
  }

  async deleteConsumer(consumerId: string): Promise<void> {
    const response = await fetch(`${this.baseUrl}/consumers/${consumerId}`, {
      method: 'DELETE'
    })

    if (!response.ok && response.status !== 404) {
      throw new Error(`Failed to delete Kong consumer: ${response.statusText}`)
    }
  }

  async updateRateLimit(consumerId: string, requestsPerSecond: number): Promise<void> {
    // Update rate limit plugin for this consumer
    const response = await fetch(`${this.baseUrl}/consumers/${consumerId}/plugins`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'rate-limiting',
        config: {
          second: requestsPerSecond,
          policy: 'local',
          fault_tolerant: true
        }
      })
    })

    if (!response.ok) {
      throw new Error(`Failed to update rate limit: ${response.statusText}`)
    }
  }
}

export const kong = new KongAdminClient()





