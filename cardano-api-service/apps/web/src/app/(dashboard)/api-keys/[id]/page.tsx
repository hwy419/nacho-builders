"use client"

import { useState, useEffect } from "react"
import { useRouter, useParams } from "next/navigation"
import Link from "next/link"
import { trpc } from "@/lib/trpc"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Modal, AlertModal } from "@/components/ui/modal"
import {
  ArrowLeft,
  Copy,
  Check,
  AlertCircle,
  RefreshCw,
  Trash2,
  Save,
  Shield,
  Zap,
  Crown,
  Info
} from "lucide-react"
import { formatDate } from "@/lib/utils"

const AVAILABLE_APIS = [
  { id: "v1/ogmios", name: "Ogmios WebSocket", description: "Real-time blockchain data via WebSocket" },
  { id: "v1/submit", name: "Transaction Submit", description: "Submit transactions to the network" },
  { id: "v1/graphql", name: "GraphQL API", description: "Query blockchain data with GraphQL" },
] as const

type ApiId = (typeof AVAILABLE_APIS)[number]["id"]

export default function ApiKeyDetailPage() {
  const router = useRouter()
  const params = useParams()
  const keyId = params.id as string

  // Form state
  const [name, setName] = useState("")
  const [selectedApis, setSelectedApis] = useState<ApiId[]>([])
  const [ipWhitelist, setIpWhitelist] = useState("")
  const [active, setActive] = useState(true)
  const [hasChanges, setHasChanges] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // Modal states
  const [showDeleteModal, setShowDeleteModal] = useState(false)
  const [showRegenerateModal, setShowRegenerateModal] = useState(false)
  const [showNewKeyModal, setShowNewKeyModal] = useState(false)
  const [regeneratedKey, setRegeneratedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  // Fetch API key data
  const { data: apiKey, isLoading, refetch } = trpc.apiKey.get.useQuery(
    { id: keyId },
    { enabled: !!keyId }
  )

  // Mutations
  const updateMutation = trpc.apiKey.update.useMutation({
    onSuccess: () => {
      setHasChanges(false)
      refetch()
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const deleteMutation = trpc.apiKey.delete.useMutation({
    onSuccess: () => {
      router.push("/api-keys")
    },
    onError: (err) => {
      setError(err.message)
      setShowDeleteModal(false)
    },
  })

  const regenerateMutation = trpc.apiKey.regenerate.useMutation({
    onSuccess: (data) => {
      setRegeneratedKey(data.key)
      setShowRegenerateModal(false)
      setShowNewKeyModal(true)
      refetch()
    },
    onError: (err) => {
      setError(err.message)
      setShowRegenerateModal(false)
    },
  })

  // Initialize form when data loads
  useEffect(() => {
    if (apiKey) {
      setName(apiKey.name)
      setSelectedApis(Array.isArray(apiKey.allowedApis) ? apiKey.allowedApis as ApiId[] : [])
      setIpWhitelist(Array.isArray(apiKey.ipWhitelist) ? apiKey.ipWhitelist.join("\n") : "")
      setActive(apiKey.active)
    }
  }, [apiKey])

  // Track changes
  useEffect(() => {
    if (apiKey) {
      const currentIps = ipWhitelist.split(/[\n,]/).map(ip => ip.trim()).filter(ip => ip.length > 0)
      const allowedApis = Array.isArray(apiKey.allowedApis) ? apiKey.allowedApis : []
      const whitelist = Array.isArray(apiKey.ipWhitelist) ? apiKey.ipWhitelist : []
      const changed =
        name !== apiKey.name ||
        JSON.stringify([...selectedApis].sort()) !== JSON.stringify([...allowedApis].sort()) ||
        JSON.stringify([...currentIps].sort()) !== JSON.stringify([...whitelist].sort()) ||
        active !== apiKey.active
      setHasChanges(changed)
    }
  }, [name, selectedApis, ipWhitelist, active, apiKey])

  const handleApiToggle = (apiId: ApiId) => {
    setSelectedApis((prev) =>
      prev.includes(apiId)
        ? prev.filter((id) => id !== apiId)
        : [...prev, apiId]
    )
  }

  const handleSave = () => {
    setError(null)

    if (!name.trim()) {
      setError("Name is required")
      return
    }

    if (selectedApis.length === 0) {
      setError("Select at least one API")
      return
    }

    // Parse IP whitelist
    const ips = ipWhitelist
      .split(/[\n,]/)
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0)

    // Validate IPs
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    const invalidIps = ips.filter((ip) => !ipRegex.test(ip))
    if (invalidIps.length > 0) {
      setError(`Invalid IP addresses: ${invalidIps.join(", ")}`)
      return
    }

    updateMutation.mutate({
      id: keyId,
      name: name.trim(),
      allowedApis: selectedApis,
      ipWhitelist: ips,
      active,
    })
  }

  const handleDelete = () => {
    deleteMutation.mutate({ id: keyId })
  }

  const handleRegenerate = () => {
    regenerateMutation.mutate({ id: keyId })
  }

  const handleCopyKey = async () => {
    if (regeneratedKey) {
      await navigator.clipboard.writeText(regeneratedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  if (isLoading) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="animate-pulse space-y-6">
          <div className="h-8 w-48 bg-bg-tertiary rounded" />
          <div className="h-64 bg-bg-tertiary rounded-lg" />
        </div>
      </div>
    )
  }

  if (!apiKey) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <h2 className="text-2xl font-bold text-text-primary mb-2">API Key Not Found</h2>
        <p className="text-text-secondary mb-6">This API key may have been deleted.</p>
        <Link href="/api-keys">
          <Button>Back to API Keys</Button>
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Link href="/api-keys">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-3xl font-bold">{apiKey.name}</h1>
            <p className="text-text-secondary mt-1">
              Created {formatDate(apiKey.createdAt)}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {apiKey.tier === "ADMIN" ? (
            <Badge variant="admin" className="flex items-center gap-1">
              <Crown className="w-3 h-3" />
              ADMIN
            </Badge>
          ) : apiKey.tier === "PAID" ? (
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
          {!apiKey.active && <Badge variant="error">Inactive</Badge>}
        </div>
      </div>

      {/* Default Key Info */}
      {apiKey.isDefault && (
        <Card className="border-success/30 bg-success/5">
          <CardContent className="p-4">
            <div className="flex gap-3">
              <Info className="w-5 h-5 text-success flex-shrink-0 mt-0.5" />
              <div>
                <p className="text-sm text-text-primary">
                  <strong>This is your default free API key.</strong> It was automatically created with your account.
                </p>
                <p className="text-xs text-text-muted mt-1">
                  You can disable this key temporarily, but it cannot be deleted. You can regenerate it if needed.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Key Preview */}
      <Card>
        <CardContent className="p-6">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-text-muted mb-1">API Key</div>
              <code className="text-lg font-mono text-text-primary">
                {apiKey.keyPrefix}{"*".repeat(24)}
              </code>
            </div>
            <Button
              variant="secondary"
              onClick={() => setShowRegenerateModal(true)}
              disabled={regenerateMutation.isPending}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Regenerate
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Limits Info Card */}
      <Card>
        <CardContent className="p-6">
          <div className="text-sm font-semibold text-text-primary mb-4">Limits & Configuration</div>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Rate Limit</div>
              <div className="text-lg font-semibold text-text-primary">{apiKey.rateLimitPerSecond} req/s</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Daily Limit</div>
              <div className="text-lg font-semibold text-text-primary">
                {apiKey.dailyRequestLimit ? `${(apiKey.dailyRequestLimit / 1000).toFixed(0)}k` : "Unlimited"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">WebSockets</div>
              <div className="text-lg font-semibold text-text-primary">{apiKey.websocketLimit}</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Data Retention</div>
              <div className="text-lg font-semibold text-text-primary">{apiKey.dataRetentionDays} days</div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Submit API</div>
              <div className="text-lg font-semibold text-text-primary">
                {apiKey.submitRateLimitHour ? `${apiKey.submitRateLimitHour} tx/hr` : "Unlimited"}
              </div>
            </div>
            <div>
              <div className="text-xs text-text-muted uppercase tracking-wide">Credit Usage</div>
              <div className="text-lg font-semibold text-text-primary">
                {apiKey.tier === "PAID" ? "1 per request" : "None"}
              </div>
            </div>
          </div>

          {/* ADMIN tier note */}
          {apiKey.tier === "ADMIN" && (
            <div className="mt-4 pt-4 border-t border-border-default">
              <p className="text-xs text-amber-400">
                This is an admin key with unlimited access. No rate limits, no daily caps, no credit consumption.
              </p>
            </div>
          )}

          {/* Credit consumption note for PAID keys */}
          {apiKey.tier === "PAID" && (
            <div className="mt-4 pt-4 border-t border-border-default">
              <p className="text-xs text-accent">
                This key consumes 1 credit for each API request. Monitor your usage in the dashboard.
              </p>
            </div>
          )}

          {/* Submit API limit note for FREE keys */}
          {apiKey.tier === "FREE" && apiKey.submitRateLimitHour && (
            <div className="mt-4 pt-4 border-t border-border-default">
              <p className="text-xs text-warning">
                Submit API is rate-limited to {apiKey.submitRateLimitHour} transactions per hour on the free tier.
                Upgrade to PAID for unlimited submissions.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Form */}
      <Card>
        <CardContent className="p-6">
          <div className="space-y-6">
            {/* Error message */}
            {error && (
              <div className="flex items-center gap-2 p-4 rounded-lg bg-error/10 border border-error/20 text-error">
                <AlertCircle className="w-5 h-5 flex-shrink-0" />
                <p className="text-sm">{error}</p>
              </div>
            )}

            {/* Name */}
            <div className="space-y-2">
              <label htmlFor="name" className="block text-sm font-medium text-text-primary">
                Name
              </label>
              <Input
                id="name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
            </div>

            {/* Active Status */}
            <div className="flex items-center justify-between p-4 rounded-lg border border-border-default">
              <div>
                <div className="font-medium text-text-primary">Active Status</div>
                <div className="text-sm text-text-muted">
                  {apiKey.isDefault
                    ? "Disable to temporarily block requests using this key (can be re-enabled anytime)"
                    : "Disable to temporarily block all requests using this key"}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActive(!active)}
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                  active ? "bg-accent" : "bg-bg-tertiary"
                }`}
              >
                <span
                  className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                    active ? "translate-x-6" : "translate-x-1"
                  }`}
                />
              </button>
            </div>

            {/* Allowed APIs */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-primary">
                Allowed APIs
              </label>
              <div className="space-y-2">
                {AVAILABLE_APIS.map((api) => {
                  const isSubmitApi = api.id === "v1/submit"
                  const isFreeTier = apiKey.tier === "FREE"
                  const hasLimit = isSubmitApi && isFreeTier && apiKey.submitRateLimitHour

                  return (
                    <label
                      key={api.id}
                      className={`flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all ${
                        selectedApis.includes(api.id)
                          ? "border-accent bg-accent/5"
                          : "border-border-default hover:border-border-highlight"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={selectedApis.includes(api.id)}
                        onChange={() => handleApiToggle(api.id)}
                        className="mt-0.5 w-4 h-4 rounded border-border-default text-accent focus:ring-accent"
                      />
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-text-primary">{api.name}</span>
                          {hasLimit && (
                            <Badge variant="warning" className="text-xs">
                              {apiKey.submitRateLimitHour} tx/hr limit
                            </Badge>
                          )}
                        </div>
                        <div className="text-xs text-text-muted">{api.description}</div>
                      </div>
                    </label>
                  )
                })}
              </div>
            </div>

            {/* IP Whitelist */}
            <div className="space-y-2">
              <label htmlFor="ipWhitelist" className="block text-sm font-medium text-text-primary">
                IP Whitelist
              </label>
              <textarea
                id="ipWhitelist"
                placeholder="192.168.1.1&#10;10.0.0.1"
                value={ipWhitelist}
                onChange={(e) => setIpWhitelist(e.target.value)}
                rows={3}
                className="input w-full resize-none"
              />
              <p className="text-xs text-text-muted">
                Enter IP addresses, one per line. Leave empty to allow all IPs.
              </p>
            </div>

            {/* Last Used */}
            {apiKey.lastUsedAt && (
              <div className="text-sm text-text-muted">
                Last used: {formatDate(apiKey.lastUsedAt)}
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Action Buttons */}
      <div className="flex justify-between">
        {apiKey.isDefault ? (
          <div className="text-sm text-text-muted italic flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Default key cannot be deleted
          </div>
        ) : (
          <Button
            variant="danger"
            onClick={() => setShowDeleteModal(true)}
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Delete Key
          </Button>
        )}

        <Button
          onClick={handleSave}
          disabled={!hasChanges || updateMutation.isPending}
        >
          <Save className="w-4 h-4 mr-2" />
          {updateMutation.isPending ? "Saving..." : "Save Changes"}
        </Button>
      </div>

      {/* Delete Confirmation Modal */}
      <AlertModal
        isOpen={showDeleteModal}
        onClose={() => setShowDeleteModal(false)}
        onConfirm={handleDelete}
        title="Delete API Key"
        description="Are you sure you want to delete this API key? This action cannot be undone and will immediately revoke access for any applications using this key."
        confirmText="Delete"
        variant="danger"
        isLoading={deleteMutation.isPending}
      />

      {/* Regenerate Confirmation Modal */}
      <AlertModal
        isOpen={showRegenerateModal}
        onClose={() => setShowRegenerateModal(false)}
        onConfirm={handleRegenerate}
        title="Regenerate API Key"
        description="This will create a new API key and invalidate the current one. Any applications using the old key will lose access immediately."
        confirmText="Regenerate"
        variant="warning"
        isLoading={regenerateMutation.isPending}
      />

      {/* New Key Modal - Shows regenerated key ONLY ONCE */}
      <Modal
        isOpen={showNewKeyModal}
        onClose={() => setShowNewKeyModal(false)}
        title="New API Key Generated"
        description="Copy your new API key now. You won't be able to see it again!"
      >
        <div className="space-y-4">
          {/* Warning */}
          <div className="flex items-start gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
            <AlertCircle className="w-5 h-5 text-warning flex-shrink-0 mt-0.5" />
            <div className="text-sm text-text-primary">
              <strong>Important:</strong> This is the only time you will see this API key.
              Make sure to copy it and store it securely.
            </div>
          </div>

          {/* API Key Display */}
          <div className="relative">
            <code className="block w-full p-4 pr-12 rounded-lg bg-bg-tertiary border border-border-default font-mono text-sm text-accent break-all">
              {regeneratedKey}
            </code>
            <button
              onClick={handleCopyKey}
              className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-lg hover:bg-bg-primary transition-colors"
              title="Copy to clipboard"
            >
              {copied ? (
                <Check className="w-5 h-5 text-success" />
              ) : (
                <Copy className="w-5 h-5 text-text-muted" />
              )}
            </button>
          </div>

          {/* Copied indicator */}
          {copied && (
            <p className="text-sm text-success text-center">Copied to clipboard!</p>
          )}

          {/* Action buttons */}
          <div className="flex justify-end pt-4">
            <Button onClick={() => setShowNewKeyModal(false)}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
