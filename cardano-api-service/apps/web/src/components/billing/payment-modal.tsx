"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { X, Loader2, CreditCard, Sparkles } from "lucide-react"
import { trpc } from "@/lib/trpc"
import { formatCredits } from "@/lib/utils"

interface CreditPackage {
  id: string
  name: string
  credits: number
  adaPrice: number
  bonusPercent: number
  popular: boolean
  totalCredits: number
}

interface PaymentModalProps {
  isOpen: boolean
  onClose: () => void
  packages?: CreditPackage[]
  selectedPackage?: string | null
}

export function PaymentModal({
  isOpen,
  onClose,
  packages,
  selectedPackage: initialSelected,
}: PaymentModalProps) {
  const router = useRouter()
  const [selectedPackage, setSelectedPackage] = useState<string | null>(
    initialSelected || null
  )
  const [isLoading, setIsLoading] = useState(false)

  // Get packages from tRPC if not provided
  const packagesQuery = trpc.payment.getPackages.useQuery(undefined, {
    enabled: isOpen && !packages,
  })

  const displayPackages = packages || packagesQuery.data || []

  const handlePurchase = async () => {
    if (!selectedPackage) return

    setIsLoading(true)

    // Navigate to checkout with the selected package
    router.push(`/billing/checkout?package=${encodeURIComponent(selectedPackage)}`)
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative z-10 w-full max-w-4xl mx-4 max-h-[90vh] overflow-y-auto">
        <Card className="border-border-highlight">
          <CardHeader className="flex flex-row items-center justify-between border-b border-border pb-4">
            <div className="flex items-center gap-3">
              <CreditCard className="w-6 h-6 text-accent" />
              <CardTitle>Purchase Credits</CardTitle>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </CardHeader>

          <CardContent className="p-6 space-y-6">
            {/* Package Selection */}
            <div>
              <h3 className="text-lg font-semibold mb-4">Select a Package</h3>

              {packagesQuery.isLoading ? (
                <div className="flex items-center justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-accent" />
                </div>
              ) : (
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {displayPackages.map((pkg) => (
                    <button
                      key={pkg.id || pkg.name}
                      onClick={() => setSelectedPackage(pkg.name)}
                      className={`
                        relative p-4 rounded-lg border-2 transition-all text-left
                        ${
                          selectedPackage === pkg.name
                            ? "border-accent bg-accent/10"
                            : "border-border hover:border-border-highlight"
                        }
                        ${pkg.popular ? "ring-2 ring-accent/30" : ""}
                      `}
                    >
                      {pkg.popular && (
                        <div className="absolute -top-3 left-1/2 -translate-x-1/2">
                          <Badge variant="paid" className="flex items-center gap-1">
                            <Sparkles className="w-3 h-3" />
                            Popular
                          </Badge>
                        </div>
                      )}

                      <div className="text-center space-y-2 pt-2">
                        <div className="text-lg font-bold">{pkg.name}</div>
                        <div className="text-3xl font-bold text-accent">
                          {pkg.adaPrice}
                        </div>
                        <div className="text-sm text-text-muted">ADA</div>
                      </div>

                      <div className="mt-4 pt-4 border-t border-border text-center">
                        <div className="text-xl font-semibold">
                          {formatCredits(pkg.totalCredits)}
                        </div>
                        <div className="text-sm text-text-secondary">credits</div>
                        {pkg.bonusPercent > 0 && (
                          <Badge variant="success" className="mt-2">
                            +{pkg.bonusPercent}% bonus
                          </Badge>
                        )}
                      </div>

                      {selectedPackage === pkg.name && (
                        <div className="absolute top-2 right-2">
                          <div className="w-6 h-6 rounded-full bg-accent flex items-center justify-center">
                            <svg
                              className="w-4 h-4 text-white"
                              fill="none"
                              viewBox="0 0 24 24"
                              stroke="currentColor"
                            >
                              <path
                                strokeLinecap="round"
                                strokeLinejoin="round"
                                strokeWidth={2}
                                d="M5 13l4 4L19 7"
                              />
                            </svg>
                          </div>
                        </div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Selected Package Summary */}
            {selectedPackage && (
              <div className="p-4 bg-bg-tertiary rounded-lg">
                <div className="flex justify-between items-center">
                  <div>
                    <div className="text-sm text-text-muted">Selected Package</div>
                    <div className="text-lg font-semibold">{selectedPackage}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-sm text-text-muted">You will receive</div>
                    <div className="text-lg font-bold text-accent">
                      {displayPackages
                        .find((p) => p.name === selectedPackage)
                        ?.totalCredits.toLocaleString()}{" "}
                      credits
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-4 pt-4 border-t border-border">
              <Button variant="secondary" onClick={onClose}>
                Cancel
              </Button>
              <Button
                onClick={handlePurchase}
                disabled={!selectedPackage || isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    Continue to Payment
                  </>
                )}
              </Button>
            </div>

            {/* Info */}
            <p className="text-xs text-text-muted text-center">
              Credits never expire and roll over indefinitely. All payments are processed
              on the Cardano blockchain.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
