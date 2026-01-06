"use client"

import { useState } from "react"
import { trpc } from "@/lib/trpc"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { formatADA, formatDate } from "@/lib/utils"
import {
  CreditCard,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  ExternalLink,
  Copy,
  Check
} from "lucide-react"

type PaymentStatus = "PENDING" | "CONFIRMING" | "CONFIRMED" | "EXPIRED" | "FAILED"

export default function AdminPaymentsPage() {
  const [page, setPage] = useState(1)
  const [statusFilter, setStatusFilter] = useState<PaymentStatus | undefined>()
  const [confirmingId, setConfirmingId] = useState<string | null>(null)
  const [txHash, setTxHash] = useState("")
  const [copiedId, setCopiedId] = useState<string | null>(null)

  const utils = trpc.useUtils()

  const { data: paymentsData, isLoading } = trpc.admin.listPayments.useQuery({
    page,
    limit: 20,
    status: statusFilter,
  })

  const confirmPayment = trpc.admin.confirmPayment.useMutation({
    onSuccess: () => {
      utils.admin.listPayments.invalidate()
      utils.admin.stats.invalidate()
      setConfirmingId(null)
      setTxHash("")
    },
  })

  const handleConfirm = (paymentId: string) => {
    confirmPayment.mutate({ paymentId, txHash: txHash || undefined })
  }

  const copyToClipboard = async (text: string, id: string) => {
    await navigator.clipboard.writeText(text)
    setCopiedId(id)
    setTimeout(() => setCopiedId(null), 2000)
  }

  const getStatusVariant = (status: PaymentStatus) => {
    switch (status) {
      case "CONFIRMED":
        return "success"
      case "PENDING":
      case "CONFIRMING":
        return "warning"
      case "FAILED":
      case "EXPIRED":
        return "error"
      default:
        return "info"
    }
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-3xl font-bold text-text-primary">Payment Management</h1>
        <p className="text-text-secondary mt-1">View and manage platform payments</p>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col md:flex-row gap-4 items-center">
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={statusFilter === undefined ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setStatusFilter(undefined)
                  setPage(1)
                }}
              >
                All
              </Button>
              <Button
                variant={statusFilter === "PENDING" ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setStatusFilter("PENDING")
                  setPage(1)
                }}
              >
                Pending
              </Button>
              <Button
                variant={statusFilter === "CONFIRMING" ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setStatusFilter("CONFIRMING")
                  setPage(1)
                }}
              >
                Confirming
              </Button>
              <Button
                variant={statusFilter === "CONFIRMED" ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setStatusFilter("CONFIRMED")
                  setPage(1)
                }}
              >
                Confirmed
              </Button>
              <Button
                variant={statusFilter === "EXPIRED" ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setStatusFilter("EXPIRED")
                  setPage(1)
                }}
              >
                Expired
              </Button>
              <Button
                variant={statusFilter === "FAILED" ? "primary" : "secondary"}
                size="sm"
                onClick={() => {
                  setStatusFilter("FAILED")
                  setPage(1)
                }}
              >
                Failed
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Payments Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payments ({paymentsData?.total ?? 0})
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-text-secondary text-center py-8">Loading...</div>
          ) : !paymentsData?.payments.length ? (
            <div className="text-text-secondary text-center py-8">No payments found</div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">User</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Package</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Amount</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Credits</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Status</th>
                      <th className="text-left py-3 px-4 text-sm font-medium text-text-secondary">Date</th>
                      <th className="text-right py-3 px-4 text-sm font-medium text-text-secondary">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paymentsData.payments.map((payment) => (
                      <tr key={payment.id} className="border-b border-border/50 hover:bg-bg-tertiary">
                        <td className="py-3 px-4">
                          <div>
                            <p className="text-sm font-medium text-text-primary">
                              {payment.user.name || "—"}
                            </p>
                            <p className="text-xs text-text-muted">{payment.user.email}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-text-primary">
                            {payment.packageName || "Custom"}
                          </span>
                          {payment.bonusPercent && payment.bonusPercent > 0 && (
                            <span className="ml-1 text-xs text-success">
                              +{payment.bonusPercent}%
                            </span>
                          )}
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm font-medium text-text-primary">
                            {formatADA(payment.amount)} ADA
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-text-primary">
                            {payment.credits.toLocaleString()}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Badge variant={getStatusVariant(payment.status as PaymentStatus)}>
                            {payment.status}
                          </Badge>
                        </td>
                        <td className="py-3 px-4">
                          <span className="text-sm text-text-muted">
                            {formatDate(payment.createdAt)}
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-2">
                            {payment.txHash && (
                              <a
                                href={`https://cardanoscan.io/transaction/${payment.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="p-2 rounded hover:bg-bg-secondary"
                                title="View on Cardanoscan"
                              >
                                <ExternalLink className="w-4 h-4 text-text-muted" />
                              </a>
                            )}
                            {payment.paymentAddress && (
                              <button
                                onClick={() => copyToClipboard(payment.paymentAddress, payment.id)}
                                className="p-2 rounded hover:bg-bg-secondary"
                                title="Copy payment address"
                              >
                                {copiedId === payment.id ? (
                                  <Check className="w-4 h-4 text-success" />
                                ) : (
                                  <Copy className="w-4 h-4 text-text-muted" />
                                )}
                              </button>
                            )}
                            {(payment.status === "PENDING" || payment.status === "CONFIRMING") && (
                              <Button
                                variant="secondary"
                                size="sm"
                                onClick={() => setConfirmingId(payment.id)}
                              >
                                <CheckCircle className="w-4 h-4 mr-1" />
                                Confirm
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination */}
              {paymentsData.totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <p className="text-sm text-text-muted">
                    Page {page} of {paymentsData.totalPages}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page <= 1}
                      onClick={() => setPage(page - 1)}
                    >
                      <ChevronLeft className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="secondary"
                      size="sm"
                      disabled={page >= paymentsData.totalPages}
                      onClick={() => setPage(page + 1)}
                    >
                      <ChevronRight className="w-4 h-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* Confirm Payment Modal */}
      {confirmingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <Card className="w-full max-w-md mx-4">
            <CardHeader>
              <CardTitle>Confirm Payment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <p className="text-sm text-text-secondary">
                This will mark the payment as confirmed and add credits to the user&apos;s account.
              </p>

              <div>
                <label className="block text-sm text-text-secondary mb-2">
                  Transaction Hash (optional)
                </label>
                <Input
                  placeholder="Enter transaction hash..."
                  value={txHash}
                  onChange={(e) => setTxHash(e.target.value)}
                />
              </div>

              <div className="flex gap-2 justify-end">
                <Button
                  variant="secondary"
                  onClick={() => {
                    setConfirmingId(null)
                    setTxHash("")
                  }}
                >
                  Cancel
                </Button>
                <Button
                  onClick={() => handleConfirm(confirmingId)}
                  disabled={confirmPayment.isPending}
                >
                  {confirmPayment.isPending ? "Confirming..." : "Confirm Payment"}
                </Button>
              </div>

              {confirmPayment.isError && (
                <p className="text-sm text-error">
                  Error: {confirmPayment.error.message}
                </p>
              )}
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  )
}
