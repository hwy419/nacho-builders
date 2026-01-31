"use client"

import { useState, useMemo } from "react"
import Link from "next/link"
import { trpc } from "@/lib/trpc"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { AlertModal } from "@/components/ui/modal"
import { Copy, Check, Eye, Trash2, Plus, AlertCircle, Info, Shield, Zap, Crown } from "lucide-react"
import { formatDate } from "@/lib/utils"
import { useAnalytics } from "@/components/analytics"

export default function ApiKeysPage() {
  const [deleteKeyId, setDeleteKeyId] = useState<string | null>(null)
  const [deleteKeyTier, setDeleteKeyTier] = useState<"free" | "paid" | "admin">("free")
  const [copiedKeyId, setCopiedKeyId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const { trackEvent } = useAnalytics()

  // Fetch API keys
  const { data: rawApiKeys, isLoading, refetch } = trpc.apiKey.list.useQuery()

  // Normalize data to ensure it's always an array
  const apiKeys = useMemo(() => {
    if (!rawApiKeys) return []
    if (Array.isArray(rawApiKeys)) return rawApiKeys
    // Handle edge case where data might be wrapped in an object
    if (typeof rawApiKeys === 'object' && 'data' in rawApiKeys) {
      return Array.isArray((rawApiKeys as { data: unknown }).data)
        ? (rawApiKeys as { data: unknown[] }).data
        : []
    }
    return []
  }, [rawApiKeys])

  // Delete mutation
  const deleteMutation = trpc.apiKey.delete.useMutation({
    onSuccess: () => {
      setDeleteKeyId(null)
      refetch()
    },
    onError: (err) => {
      setError(err.message)
      setDeleteKeyId(null)
    },
  })

  const handleCopyKeyPrefix = async (keyPrefix: string, keyId: string, keyTier: string) => {
    await navigator.clipboard.writeText(keyPrefix)
    setCopiedKeyId(keyId)
    setTimeout(() => setCopiedKeyId(null), 2000)

    // Track API key copy
    trackEvent({
      event_name: "api_key_copied",
      key_tier: keyTier.toLowerCase() as "free" | "paid" | "admin",
    })
  }

  const handleDelete = () => {
    if (deleteKeyId) {
      // Track delete before mutation
      trackEvent({
        event_name: "api_key_deleted",
        key_tier: deleteKeyTier,
      })
      deleteMutation.mutate({ id: deleteKeyId })
    }
  }

  const handleDeleteClick = (keyId: string, keyTier: string) => {
    setDeleteKeyId(keyId)
    setDeleteKeyTier(keyTier.toLowerCase() as "free" | "paid" | "admin")
  }

  if (isLoading) {
    return (
      <div className="space-y-8">
        {/* Header skeleton */}
        <div className="flex items-center justify-between">
          <div className="space-y-2">
            <div className="h-10 w-48 bg-bg-tertiary rounded animate-pulse" />
            <div className="h-5 w-64 bg-bg-tertiary rounded animate-pulse" />
          </div>
          <div className="h-10 w-32 bg-bg-tertiary rounded animate-pulse" />
        </div>

        {/* Cards skeleton */}
        <div className="space-y-4">
          {[1, 2].map((i) => (
            <div key={i} className="h-40 bg-bg-tertiary rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-4xl font-bold mb-2">API Keys</h1>
          <p className="text-text-secondary">
            Manage your API access keys and permissions
          </p>
        </div>
        <Link href="/api-keys/new">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            New API Key
          </Button>
        </Link>
      </div>

      {/* Error message */}
      {error && (
        <div className="flex items-center gap-2 p-4 rounded-lg bg-error/10 border border-error/20 text-error">
          <AlertCircle className="w-5 h-5 flex-shrink-0" />
          <p className="text-sm">{error}</p>
          <button
            onClick={() => setError(null)}
            className="ml-auto text-error hover:text-error/80"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Info Banner */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-4">
          <div className="flex gap-3">
            <Info className="w-5 h-5 text-accent flex-shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="text-sm text-text-primary">
                <strong>Your account includes one free API key</strong> with generous limits (100 req/s, 100k/day).
              </p>
              <p className="text-sm text-text-muted">
                Need higher limits or unlimited requests? Create a <strong>PAID key</strong> using your credits.
                <Link href="/billing" className="text-accent hover:text-accent-hover ml-1">
                  Buy credits →
                </Link>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* API Keys List */}
      <div className="space-y-4">
        {apiKeys.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <div className="text-6xl mb-4">🔑</div>
              <h3 className="text-xl font-semibold mb-2">No API Keys Yet</h3>
              <p className="text-text-secondary mb-6">Create your first API key to get started</p>
              <Link href="/api-keys/new">
                <Button>Create API Key</Button>
              </Link>
            </CardContent>
          </Card>
        ) : (
          apiKeys.map((key) => (
            <Card key={key.id} className="card-hover">
              <CardContent className="p-6">
                <div className="flex items-start justify-between">
                  <div className="flex-1 space-y-4">
                    {/* Key Name and Status */}
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="text-xl font-semibold">{key.name}</h3>
                      {key.tier === "ADMIN" ? (
                        <Badge variant="admin" className="flex items-center gap-1">
                          <Crown className="w-3 h-3" />
                          ADMIN
                        </Badge>
                      ) : key.tier === "PAID" ? (
                        <Badge variant="paid" className="flex items-center gap-1">
                          <Zap className="w-3 h-3" />
                          PAID
                        </Badge>
                      ) : (
                        <Badge variant="free" className="flex items-center gap-1">
                          <Shield className="w-3 h-3" />
                          FREE KEY
                        </Badge>
                      )}
                      {key.isDefault && (
                        <span className="text-xs text-text-muted">(Default key - can be disabled but not deleted)</span>
                      )}
                      {!key.active && (
                        <Badge variant="error">Inactive</Badge>
                      )}
                    </div>

                    {/* API Key Display */}
                    <div className="flex items-center gap-2">
                      <code className="api-key flex-1 px-3 py-2 rounded bg-bg-tertiary border border-border-default font-mono text-sm">
                        {key.keyPrefix}{"*".repeat(24)}
                      </code>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleCopyKeyPrefix(key.keyPrefix, key.id, key.tier)}
                        title="Copy key prefix"
                      >
                        {copiedKeyId === key.id ? (
                          <Check className="w-4 h-4 text-success" />
                        ) : (
                          <Copy className="w-4 h-4" />
                        )}
                      </Button>
                    </div>

                    {/* Limits Summary */}
                    <div className="flex items-center gap-4 text-sm">
                      <span className="font-medium text-text-primary">
                        {key.rateLimitPerSecond} req/s
                      </span>
                      <span className="text-text-muted">•</span>
                      <span className="font-medium text-text-primary">
                        {key.dailyRequestLimit ? `${(key.dailyRequestLimit / 1000).toFixed(0)}k/day` : "Unlimited"}
                      </span>
                      <span className="text-text-muted">•</span>
                      <span className="text-text-secondary">
                        {key.websocketLimit} WebSockets
                      </span>
                      <span className="text-text-muted">•</span>
                      <span className="text-text-secondary">
                        {key.dataRetentionDays}d retention
                      </span>
                    </div>

                    {/* Credit Usage Note for PAID keys */}
                    {key.tier === "PAID" && (
                      <div className="text-xs text-accent">
                        Uses credits: 1 credit per API request
                      </div>
                    )}

                    {/* ADMIN keys - no limits */}
                    {key.tier === "ADMIN" && (
                      <div className="text-xs text-amber-400">
                        Unlimited access • No credits used
                      </div>
                    )}

                    {/* Submit API limit for FREE keys */}
                    {key.tier === "FREE" && key.submitRateLimitHour && (
                      <div className="text-xs text-warning">
                        Submit API limited to {key.submitRateLimitHour} tx/hour
                      </div>
                    )}

                    {/* Allowed APIs */}
                    {Array.isArray(key.allowedApis) && key.allowedApis.length > 0 && (
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm text-text-muted">APIs:</span>
                        {key.allowedApis.map((api) => (
                          <Badge key={api} variant="outline" className="text-xs">
                            {api}
                          </Badge>
                        ))}
                      </div>
                    )}

                    {/* Metadata */}
                    <div className="flex items-center gap-6 text-sm text-text-muted">
                      <div>Created {formatDate(key.createdAt)}</div>
                      {key.lastUsedAt && (
                        <div>Last used {formatDate(key.lastUsedAt)}</div>
                      )}
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 ml-4">
                    <Link href={`/api-keys/${key.id}`}>
                      <Button variant="ghost" size="icon" title="View & Edit">
                        <Eye className="w-4 h-4" />
                      </Button>
                    </Link>
                    {!key.isDefault && (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-error hover:bg-error/10"
                        onClick={() => handleDeleteClick(key.id, key.tier)}
                        title="Delete"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))
        )}
      </div>

      {/* Delete Confirmation Modal */}
      <AlertModal
        isOpen={!!deleteKeyId}
        onClose={() => setDeleteKeyId(null)}
        onConfirm={handleDelete}
        title="Delete API Key"
        description="Are you sure you want to delete this API key? This action cannot be undone and will immediately revoke access for any applications using this key."
        confirmText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />
    </div>
  )
}




