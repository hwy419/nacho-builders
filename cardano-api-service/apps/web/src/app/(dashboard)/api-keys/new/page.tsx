"use client"

import { useState, useEffect } from "react"
import { useRouter } from "next/navigation"
import Link from "next/link"
import { useSession } from "next-auth/react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { Modal } from "@/components/ui/modal"
import { ArrowLeft, Copy, Check, AlertCircle, Zap, CheckCircle } from "lucide-react"
import { useAnalytics } from "@/components/analytics"

const AVAILABLE_APIS = [
  { id: "v1/ogmios", name: "Ogmios WebSocket", description: "Real-time blockchain data via WebSocket" },
  { id: "v1/submit", name: "Transaction Submit", description: "Submit transactions to the network (unlimited)" },
  { id: "v1/graphql", name: "GraphQL API", description: "Query blockchain data with GraphQL" },
] as const

type ApiId = (typeof AVAILABLE_APIS)[number]["id"]

export default function NewApiKeyPage() {
  const router = useRouter()
  const { data: session } = useSession()
  const [name, setName] = useState("")
  const [selectedApis, setSelectedApis] = useState<ApiId[]>(["v1/ogmios", "v1/submit", "v1/graphql"])
  const [ipWhitelist, setIpWhitelist] = useState("")
  const [error, setError] = useState<string | null>(null)
  const { trackEvent } = useAnalytics()

  // Modal state for showing the generated key
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [generatedKey, setGeneratedKey] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const credits = session?.user?.credits ?? 0
  const hasEnoughCredits = credits >= 100

  // Track page load as create start
  useEffect(() => {
    trackEvent({ event_name: "api_key_create_start" })
  }, [trackEvent])

  const createMutation = trpc.apiKey.create.useMutation({
    onSuccess: (data) => {
      setGeneratedKey(data.key)
      setShowKeyModal(true)

      // Track successful creation
      trackEvent({
        event_name: "api_key_created",
        key_tier: "paid",
        selected_apis: selectedApis,
      })
    },
    onError: (err) => {
      setError(err.message)
    },
  })

  const handleApiToggle = (apiId: ApiId) => {
    setSelectedApis((prev) =>
      prev.includes(apiId)
        ? prev.filter((id) => id !== apiId)
        : [...prev, apiId]
    )
  }

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    setError(null)

    if (!name.trim()) {
      setError("Name is required")
      return
    }

    if (selectedApis.length === 0) {
      setError("Select at least one API")
      return
    }

    if (!hasEnoughCredits) {
      setError("Insufficient credits. You need at least 100 credits to create a PAID API key.")
      return
    }

    // Parse IP whitelist
    const ips = ipWhitelist
      .split(/[\n,]/)
      .map((ip) => ip.trim())
      .filter((ip) => ip.length > 0)

    // Validate IPs (basic validation)
    const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/
    const invalidIps = ips.filter((ip) => !ipRegex.test(ip))
    if (invalidIps.length > 0) {
      setError(`Invalid IP addresses: ${invalidIps.join(", ")}`)
      return
    }

    createMutation.mutate({
      name: name.trim(),
      tier: "PAID",
      allowedApis: selectedApis,
      ipWhitelist: ips,
    })
  }

  const handleCopyKey = async () => {
    if (generatedKey) {
      await navigator.clipboard.writeText(generatedKey)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }

  const handleCloseModal = () => {
    setShowKeyModal(false)
    router.push("/api-keys")
  }

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-4">
        <Link href="/api-keys">
          <Button variant="ghost" size="icon">
            <ArrowLeft className="w-5 h-5" />
          </Button>
        </Link>
        <div>
          <h1 className="text-3xl font-bold">Create PAID API Key</h1>
          <p className="text-text-secondary mt-1">
            Create a high-performance API key with premium limits
          </p>
        </div>
      </div>

      {/* Info Panel - PAID Key Benefits */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-6">
          <div className="flex gap-4">
            <Zap className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
            <div className="space-y-4">
              <div>
                <h3 className="font-semibold text-text-primary text-lg">PAID API Key Benefits</h3>
                <p className="text-sm text-text-muted mt-1">
                  Your account already includes a free API key. PAID keys offer enhanced limits:
                </p>
              </div>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span><strong>500 req/sec</strong> (5x faster)</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span><strong>Unlimited</strong> daily requests</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span><strong>Unlimited</strong> Submit API</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span><strong>50</strong> WebSocket connections</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span><strong>90 days</strong> data retention</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle className="w-4 h-4 text-success" />
                  <span>Full API access</span>
                </div>
              </div>

              <div className="pt-3 border-t border-accent/20">
                <div className="flex items-center justify-between">
                  <div className="text-sm">
                    <span className="text-text-muted">Cost:</span>{" "}
                    <span className="text-text-primary font-medium">1 credit per API request</span>
                  </div>
                  <div className="text-sm">
                    <span className="text-text-muted">Your balance:</span>{" "}
                    <span className={`font-bold ${hasEnoughCredits ? "text-success" : "text-error"}`}>
                      {credits.toLocaleString()} credits
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Insufficient Credits Warning */}
      {!hasEnoughCredits && (
        <div className="flex items-center gap-3 p-4 rounded-lg bg-warning/10 border border-warning/20">
          <AlertCircle className="w-5 h-5 text-warning flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm text-text-primary">
              <strong>Insufficient credits.</strong> You need at least 100 credits to create a PAID API key.
            </p>
          </div>
          <Link href="/billing">
            <Button size="sm">Buy Credits</Button>
          </Link>
        </div>
      )}

      {/* Form */}
      <Card>
        <CardContent className="p-6">
          <form onSubmit={handleSubmit} className="space-y-6">
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
                Name <span className="text-error">*</span>
              </label>
              <Input
                id="name"
                type="text"
                placeholder="Production Server"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
              />
              <p className="text-xs text-text-muted">
                A descriptive name to identify this key (e.g., "Production", "Development", "Mobile App")
              </p>
            </div>

            {/* Tier Display (read-only) */}
            <div className="space-y-2">
              <label className="block text-sm font-medium text-text-primary">
                Tier
              </label>
              <div className="p-4 rounded-lg border-2 border-accent bg-accent/10">
                <div className="flex items-center gap-2">
                  <Badge variant="paid" className="flex items-center gap-1">
                    <Zap className="w-3 h-3" />
                    PAID
                  </Badge>
                  <span className="text-sm text-text-secondary">
                    500 req/s, Unlimited daily, 50 WebSockets, 90d retention
                  </span>
                </div>
              </div>
              <p className="text-xs text-text-muted">
                All new API keys are PAID tier. Your account already includes one FREE key.
              </p>
            </div>

            {/* Allowed APIs */}
            <div className="space-y-3">
              <label className="block text-sm font-medium text-text-primary">
                Allowed APIs <span className="text-error">*</span>
              </label>
              <div className="space-y-2">
                {AVAILABLE_APIS.map((api) => (
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
                    <div>
                      <div className="font-medium text-text-primary">{api.name}</div>
                      <div className="text-xs text-text-muted">{api.description}</div>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            {/* IP Whitelist */}
            <div className="space-y-2">
              <label htmlFor="ipWhitelist" className="block text-sm font-medium text-text-primary">
                IP Whitelist (Optional)
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

            {/* Submit */}
            <div className="flex justify-end gap-3 pt-4 border-t border-border-default">
              <Link href="/api-keys">
                <Button type="button" variant="secondary">
                  Cancel
                </Button>
              </Link>
              <Button
                type="submit"
                disabled={createMutation.isPending || !hasEnoughCredits}
              >
                {createMutation.isPending ? "Creating..." : "Create PAID API Key"}
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {/* API Key Modal - Shows the key ONLY ONCE */}
      <Modal
        isOpen={showKeyModal}
        onClose={handleCloseModal}
        title="API Key Created"
        description="Copy your API key now. You won't be able to see it again!"
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
              {generatedKey}
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

          {/* Credit usage note */}
          <p className="text-xs text-text-muted text-center">
            This key will consume 1 credit per API request.
          </p>

          {/* Action buttons */}
          <div className="flex justify-end pt-4">
            <Button onClick={handleCloseModal}>
              Done
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  )
}
