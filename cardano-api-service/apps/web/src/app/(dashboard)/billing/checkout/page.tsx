"use client"

import { useEffect, useState, useCallback, useRef } from "react"
import { useSearchParams, useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { trpc } from "@/lib/trpc"
import {
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Copy,
  ExternalLink,
  ArrowLeft,
  RefreshCw,
  AlertTriangle,
} from "lucide-react"
import { QRCodeSVG } from "qrcode.react"
import Link from "next/link"
import { useAnalytics } from "@/components/analytics"
import { trackBeginCheckout, trackPurchase, trackPurchaseFailed } from "@/lib/analytics"

// Status colors and icons
const statusConfig = {
  PENDING: {
    color: "warning",
    icon: Clock,
    label: "Awaiting Payment",
    description: "Send the exact amount to the address below",
  },
  CONFIRMING: {
    color: "info",
    icon: Loader2,
    label: "Confirming",
    description: "Payment detected, waiting for confirmations",
  },
  CONFIRMED: {
    color: "success",
    icon: CheckCircle,
    label: "Confirmed",
    description: "Payment complete! Credits have been added to your account",
  },
  EXPIRED: {
    color: "error",
    icon: XCircle,
    label: "Expired",
    description: "Payment window has expired",
  },
  FAILED: {
    color: "error",
    icon: XCircle,
    label: "Failed",
    description: "Payment processing failed",
  },
} as const

export default function CheckoutPage() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const paymentId = searchParams.get("id")
  const packageName = searchParams.get("package")
  const { trackEvent } = useAnalytics()

  const [copied, setCopied] = useState(false)
  const [timeRemaining, setTimeRemaining] = useState<string>("")
  const [lastChecked, setLastChecked] = useState<Date | null>(null)

  // Track if we've already fired checkout_begin and purchase events
  const checkoutTracked = useRef(false)
  const purchaseTracked = useRef(false)
  const errorTracked = useRef<string | null>(null)

  // Create payment mutation
  const createPayment = trpc.payment.create.useMutation()

  // Get payment query (only when we have an ID)
  const paymentQuery = trpc.payment.get.useQuery(
    { paymentId: paymentId || "" },
    { enabled: !!paymentId, refetchInterval: false }
  )

  // Check status query (polls every 1 second for pending/confirming)
  const statusQuery = trpc.payment.checkStatus.useQuery(
    { paymentId: paymentId || "" },
    {
      enabled: !!paymentId,
      // Poll every 1 second for responsive updates
      refetchInterval: 1000,
      refetchIntervalInBackground: false,
    }
  )

  // Type guard to check if status data has error field
  const statusError = statusQuery.data && 'error' in statusQuery.data
    ? (statusQuery.data as { error?: string }).error
    : undefined

  // Track when status was last checked
  useEffect(() => {
    if (statusQuery.dataUpdatedAt) {
      setLastChecked(new Date(statusQuery.dataUpdatedAt))
    }
  }, [statusQuery.dataUpdatedAt])

  // Create payment if we have a package but no payment ID
  useEffect(() => {
    if (packageName && !paymentId && !createPayment.isPending && !createPayment.data && !createPayment.isError) {
      createPayment.mutate(
        { packageName },
        {
          onSuccess: (data) => {
            // Update URL with payment ID
            const newUrl = new URL(window.location.href)
            newUrl.searchParams.set("id", data.id)
            newUrl.searchParams.delete("package")
            router.replace(newUrl.pathname + newUrl.search)
          },
        }
      )
    }
  }, [packageName, paymentId, createPayment, router])

  // Calculate time remaining
  const payment = paymentQuery.data || createPayment.data
  const status = statusQuery.data?.status || payment?.status || "PENDING"

  // Track checkout begin when payment is ready
  useEffect(() => {
    if (payment && !checkoutTracked.current) {
      checkoutTracked.current = true

      trackEvent({
        event_name: "checkout_begin",
        package_name: payment.packageName || "unknown",
        package_price_ada: payment.adaAmount,
        package_credits: payment.credits,
      })

      trackBeginCheckout(
        {
          name: payment.packageName || "unknown",
          adaPrice: payment.adaAmount,
          credits: payment.credits,
        },
        "dashboard"
      )
    }
  }, [payment, trackEvent])

  // Track purchase completion
  useEffect(() => {
    if (status === "CONFIRMED" && payment && !purchaseTracked.current) {
      purchaseTracked.current = true
      const txHash = statusQuery.data?.txHash || (paymentQuery.data ? paymentQuery.data.txHash : "") || ""

      trackEvent({
        event_name: "purchase_complete",
        package_name: payment.packageName || "unknown",
        package_price_ada: payment.adaAmount,
        package_credits: payment.credits,
        tx_hash: txHash,
      })

      trackPurchase(
        {
          name: payment.packageName || "unknown",
          adaPrice: payment.adaAmount,
          credits: payment.credits,
        },
        txHash,
        "dashboard"
      )
    }
  }, [status, payment, statusQuery.data, paymentQuery.data, trackEvent])

  // Track purchase error/expiration
  useEffect(() => {
    if ((status === "EXPIRED" || status === "FAILED") && payment && errorTracked.current !== status) {
      errorTracked.current = status

      trackEvent({
        event_name: "purchase_error",
        package_name: payment.packageName || "unknown",
        error_type: status === "EXPIRED" ? "expired" : "failed",
      })

      trackPurchaseFailed(
        {
          name: payment.packageName || "unknown",
          adaPrice: payment.adaAmount,
          credits: payment.credits,
        },
        status === "EXPIRED" ? "expired" : "failed",
        "dashboard"
      )
    }
  }, [status, payment, trackEvent])

  useEffect(() => {
    if (!payment?.expiresAt) return

    const updateTime = () => {
      const now = new Date()
      const expires = new Date(payment.expiresAt)
      const diff = expires.getTime() - now.getTime()

      if (diff <= 0) {
        setTimeRemaining("Expired")
        return
      }

      const hours = Math.floor(diff / (1000 * 60 * 60))
      const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60))
      const seconds = Math.floor((diff % (1000 * 60)) / 1000)

      setTimeRemaining(`${hours}h ${minutes}m ${seconds}s`)
    }

    updateTime()
    const interval = setInterval(updateTime, 1000)

    return () => clearInterval(interval)
  }, [payment?.expiresAt])

  // Copy address to clipboard
  const copyAddress = useCallback(() => {
    if (payment?.paymentAddress) {
      navigator.clipboard.writeText(payment.paymentAddress)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    }
  }, [payment?.paymentAddress])

  // Loading state
  if (!payment && (paymentQuery.isLoading || createPayment.isPending)) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="text-center space-y-4">
          <Loader2 className="w-12 h-12 animate-spin mx-auto text-accent" />
          <p className="text-text-secondary">Preparing your payment...</p>
        </div>
      </div>
    )
  }

  // Error state
  if (paymentQuery.error || createPayment.error) {
    return (
      <div className="space-y-6">
        <Link href="/billing" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-4 h-4" />
          Back to Billing
        </Link>
        <Card>
          <CardContent className="p-12 text-center">
            <XCircle className="w-12 h-12 mx-auto mb-4 text-error" />
            <h2 className="text-xl font-semibold mb-2">Error</h2>
            <p className="text-text-secondary">
              {paymentQuery.error?.message || createPayment.error?.message || "Failed to load payment"}
            </p>
            <Button className="mt-6" onClick={() => router.push("/billing")}>
              Return to Billing
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  if (!payment) {
    return (
      <div className="space-y-6">
        <Link href="/billing" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-4 h-4" />
          Back to Billing
        </Link>
        <Card>
          <CardContent className="p-12 text-center">
            <p className="text-text-secondary">No payment found</p>
            <Button className="mt-6" onClick={() => router.push("/billing")}>
              Return to Billing
            </Button>
          </CardContent>
        </Card>
      </div>
    )
  }

  const statusInfo = statusConfig[status as keyof typeof statusConfig]
  const StatusIcon = statusInfo?.icon || Clock

  // Get the txHash from whichever query has it
  // Note: createPayment.data doesn't have txHash (payment not made yet), but paymentQuery.data does
  const confirmedTxHash = statusQuery.data?.txHash ||
    (paymentQuery.data ? paymentQuery.data.txHash : null)

  // Success state
  if (status === "CONFIRMED") {
    return (
      <div className="space-y-6 max-w-2xl mx-auto">
        <Card className="card-highlight border-2 border-success/30">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 mx-auto mb-6 bg-success/10 rounded-full flex items-center justify-center">
              <CheckCircle className="w-12 h-12 text-success" />
            </div>
            <h2 className="text-3xl font-bold mb-2">Payment Confirmed!</h2>
            <p className="text-text-secondary mb-8">
              Your payment has been successfully processed.
            </p>

            {/* Credits Added */}
            <div className="bg-bg-tertiary rounded-lg p-6 mb-6">
              <p className="text-sm text-text-muted mb-1">Credits Added</p>
              <p className="text-4xl font-bold text-success">
                +{payment.credits.toLocaleString()}
              </p>
              {payment.packageName && (
                <p className="text-sm text-text-secondary mt-2">
                  {payment.packageName} Package • {payment.adaAmount.toFixed(2)} ADA
                </p>
              )}
            </div>

            {/* Transaction Link */}
            {confirmedTxHash && (
              <div className="mb-8">
                <p className="text-sm text-text-muted mb-2">Transaction Hash</p>
                <a
                  href={`https://cardanoscan.io/transaction/${confirmedTxHash}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-accent hover:text-accent-hover font-mono text-sm"
                >
                  {confirmedTxHash.slice(0, 16)}...{confirmedTxHash.slice(-16)}
                  <ExternalLink className="w-4 h-4" />
                </a>
              </div>
            )}

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => router.push("/billing")}>
                Return to Billing
              </Button>
              <Button variant="secondary" onClick={() => router.push("/dashboard")}>
                Go to Dashboard
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <Link href="/billing" className="inline-flex items-center gap-2 text-text-secondary hover:text-text-primary">
          <ArrowLeft className="w-4 h-4" />
          Back to Billing
        </Link>
        {status === "PENDING" && (
          <div className="text-sm text-text-muted">
            Expires in: <span className="font-mono text-text-primary">{timeRemaining}</span>
          </div>
        )}
      </div>

      {/* Status Banner */}
      <Card
        className={`border-2 ${
          status === "CONFIRMING"
            ? "border-info/30 bg-info/5"
            : status === "EXPIRED" || status === "FAILED"
            ? "border-error/30 bg-error/5"
            : "border-accent/30"
        }`}
      >
        <CardContent className="p-6">
          <div className="flex items-center gap-4">
            <StatusIcon
              className={`w-8 h-8 ${
                status === "CONFIRMING"
                  ? "text-info animate-spin"
                  : status === "EXPIRED" || status === "FAILED"
                  ? "text-error"
                  : "text-warning"
              }`}
            />
            <div className="flex-1">
              <h2 className="text-lg font-semibold">{statusInfo?.label || "Unknown"}</h2>
              <p className="text-sm text-text-secondary">{statusInfo?.description}</p>
              {status === "CONFIRMING" && (
                <div className="mt-2 space-y-1">
                  {statusQuery.data?.confirmations !== undefined && (
                    <p className="text-sm text-info">
                      {statusQuery.data.confirmations}/2 confirmations
                    </p>
                  )}
                  {confirmedTxHash && (
                    <a
                      href={`https://cardanoscan.io/transaction/${confirmedTxHash}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-xs text-text-muted hover:text-accent"
                    >
                      View on Cardanoscan
                      <ExternalLink className="w-3 h-3" />
                    </a>
                  )}
                </div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Ogmios Error Warning */}
      {statusError && (
        <Card className="border-warning/30 bg-warning/5">
          <CardContent className="p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium text-warning">Connection Issue</p>
                <p className="text-sm text-text-secondary mt-1">
                  {statusError}. Your payment status will update automatically when the connection is restored.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Payment Details */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>Payment Details</span>
            {payment.packageName && (
              <Badge variant="paid">{payment.packageName} Package</Badge>
            )}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Amount to Send */}
          <div className="text-center p-6 bg-bg-tertiary rounded-lg">
            <div className="text-sm text-text-muted mb-1">Send Exactly</div>
            <div className="text-4xl font-bold text-accent">
              {payment.adaAmount.toFixed(6)} ADA
            </div>
            <div className="text-sm text-text-muted mt-2">
              = {payment.amount.toLocaleString()} lovelace
            </div>
          </div>

          {/* Credits to Receive */}
          <div className="flex justify-between items-center p-4 bg-bg-secondary rounded-lg">
            <div>
              <div className="text-sm text-text-muted">You will receive</div>
              <div className="text-2xl font-bold">{payment.credits.toLocaleString()} credits</div>
            </div>
            {payment.bonusPercent && payment.bonusPercent > 0 && (
              <Badge variant="success">+{payment.bonusPercent}% bonus</Badge>
            )}
          </div>

          {/* QR Code and Address */}
          {(status === "PENDING" || status === "CONFIRMING") && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="p-4 bg-white rounded-lg">
                  <QRCodeSVG
                    value={`web+cardano:${payment.paymentAddress}?amount=${payment.amount}`}
                    size={200}
                    level="M"
                    includeMargin={false}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="text-sm text-text-muted text-center">Payment Address</div>
                <div className="flex items-center gap-2 p-3 bg-bg-tertiary rounded-lg">
                  <code className="flex-1 text-sm font-mono break-all">
                    {payment.paymentAddress}
                  </code>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={copyAddress}
                    className="shrink-0"
                  >
                    {copied ? (
                      <CheckCircle className="w-4 h-4 text-success" />
                    ) : (
                      <Copy className="w-4 h-4" />
                    )}
                  </Button>
                </div>
                {copied && (
                  <p className="text-sm text-success text-center">Address copied!</p>
                )}
              </div>
            </div>
          )}

          {/* Manual Refresh Button */}
          {(status === "PENDING" || status === "CONFIRMING") && (
            <div className="flex flex-col items-center gap-2">
              <Button
                variant="secondary"
                onClick={() => statusQuery.refetch()}
                disabled={statusQuery.isFetching}
              >
                {statusQuery.isFetching ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4 mr-2" />
                )}
                Check Payment Status
              </Button>
              <p className="text-xs text-text-muted">
                {statusQuery.isFetching ? (
                  "Checking blockchain..."
                ) : lastChecked ? (
                  <>Auto-checks every second • Last checked: {lastChecked.toLocaleTimeString()}</>
                ) : (
                  "Auto-checks every second"
                )}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Instructions */}
      {status === "PENDING" && (
        <Card>
          <CardHeader>
            <CardTitle>How to Pay</CardTitle>
          </CardHeader>
          <CardContent>
            <ol className="list-decimal list-inside space-y-3 text-text-secondary">
              <li>Open your Cardano wallet (Yoroi, Nami, Eternl, etc.)</li>
              <li>
                Send exactly <strong className="text-text-primary">{payment.adaAmount.toFixed(6)} ADA</strong> to the
                address above
              </li>
              <li>Wait for the transaction to be confirmed (usually 1-2 minutes)</li>
              <li>Credits will be automatically added to your account</li>
            </ol>
            <div className="mt-4 p-4 bg-warning/10 border border-warning/20 rounded-lg">
              <p className="text-sm text-warning">
                <strong>Important:</strong> Send the exact amount shown. Sending a different
                amount may result in processing delays.
              </p>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Expired/Failed State */}
      {(status === "EXPIRED" || status === "FAILED") && (
        <Card>
          <CardContent className="p-8 text-center">
            <XCircle className="w-12 h-12 mx-auto mb-4 text-error" />
            <h3 className="text-lg font-semibold mb-2">
              {status === "EXPIRED" ? "Payment Window Expired" : "Payment Failed"}
            </h3>
            <p className="text-text-secondary mb-6 max-w-md mx-auto">
              {status === "EXPIRED"
                ? "This payment request has expired. Don't worry - if you sent ADA to this address, please contact support and we'll help you recover your credits."
                : "There was an issue processing this payment. Please try again or contact support if the problem persists."
              }
            </p>
            <div className="flex flex-col sm:flex-row gap-3 justify-center">
              <Button onClick={() => router.push("/billing")}>
                Start New Purchase
              </Button>
              {status === "EXPIRED" && payment.paymentAddress && (
                <Button
                  variant="secondary"
                  onClick={() => {
                    navigator.clipboard.writeText(payment.paymentAddress)
                    setCopied(true)
                    setTimeout(() => setCopied(false), 2000)
                  }}
                >
                  {copied ? "Copied!" : "Copy Address for Support"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
