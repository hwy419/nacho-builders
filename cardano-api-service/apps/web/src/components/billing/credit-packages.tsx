"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Card, CardContent } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Loader2, Sparkles } from "lucide-react"
import { PaymentModal } from "./payment-modal"
import { formatCredits } from "@/lib/utils"

interface CreditPackage {
  name: string
  credits: number
  ada: string
  bonus: number
  popular: boolean
}

interface CreditPackagesProps {
  packages: CreditPackage[]
  adaUsdRate?: number | null
}

export function CreditPackages({ packages, adaUsdRate }: CreditPackagesProps) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [selectedPackage, setSelectedPackage] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState<string | null>(null)

  const handlePurchaseClick = (packageName: string) => {
    setIsLoading(packageName)
    // Navigate directly to checkout with the package
    router.push(`/billing/checkout?package=${encodeURIComponent(packageName)}`)
  }

  const handleBuyMoreClick = () => {
    setSelectedPackage(null)
    setIsModalOpen(true)
  }

  // Calculate total credits with bonus
  const calculateTotalCredits = (credits: number, bonus: number) => {
    return credits + Math.floor(credits * (bonus / 100))
  }

  return (
    <>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {packages.map((pkg) => {
          const totalCredits = calculateTotalCredits(pkg.credits, pkg.bonus)

          return (
            <Card
              key={pkg.name}
              className={
                pkg.popular
                  ? "card-highlight border-2 border-accent/30 relative overflow-hidden"
                  : "card-hover"
              }
            >
              <CardContent className="p-6 space-y-4">
                {pkg.popular && (
                  <Badge variant="paid" className="w-full justify-center flex items-center gap-1">
                    <Sparkles className="w-3 h-3" />
                    Popular
                  </Badge>
                )}
                <div className="text-center">
                  <div className="text-xl font-bold mb-2">{pkg.name}</div>
                  <div className="text-4xl font-bold text-accent mb-1">{pkg.ada}</div>
                  <div className="text-sm text-text-muted">ADA</div>
                  {adaUsdRate && (
                    <div className="text-sm text-text-muted mt-1">
                      ≈ ${(parseFloat(pkg.ada) * adaUsdRate).toFixed(2)} USD
                    </div>
                  )}
                </div>
                <div className="text-center">
                  <div className="text-2xl font-semibold">{formatCredits(totalCredits)}</div>
                  <div className="text-sm text-text-secondary">credits</div>
                  {pkg.bonus > 0 && (
                    <Badge variant="success" className="mt-2">
                      +{pkg.bonus}% bonus
                    </Badge>
                  )}
                </div>
                <Button
                  className="w-full"
                  variant={pkg.popular ? "primary" : "secondary"}
                  onClick={() => handlePurchaseClick(pkg.name)}
                  disabled={isLoading !== null}
                >
                  {isLoading === pkg.name ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Loading...
                    </>
                  ) : (
                    "Purchase"
                  )}
                </Button>
              </CardContent>
            </Card>
          )
        })}
      </div>
      <p className="text-center text-text-muted text-sm mt-6">
        Credits never expire and roll over indefinitely
      </p>

      {/* Payment Modal */}
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        selectedPackage={selectedPackage}
      />
    </>
  )
}

interface BuyCreditsButtonProps {
  size?: "default" | "sm" | "lg" | "icon"
  className?: string
}

export function BuyCreditsButton({ size = "lg", className }: BuyCreditsButtonProps) {
  const router = useRouter()
  const [isModalOpen, setIsModalOpen] = useState(false)

  return (
    <>
      <Button size={size} className={className} onClick={() => setIsModalOpen(true)}>
        Buy More Credits
      </Button>
      <PaymentModal isOpen={isModalOpen} onClose={() => setIsModalOpen(false)} />
    </>
  )
}
