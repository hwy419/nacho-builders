import { auth } from "@/lib/auth"
import { prisma } from "@/lib/db"
import { getAdaUsdRate } from "@/lib/coingecko"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { CreditCard, Clock, ExternalLink, Info, Zap, Shield, Key } from "lucide-react"
import { formatADA, formatDate } from "@/lib/utils"
import { CreditPackages, BuyCreditsButton } from "@/components/billing/credit-packages"
import Link from "next/link"

export default async function BillingPage() {
  const session = await auth()

  // Fetch recent payments
  const recentPayments = await prisma.payment.findMany({
    where: { userId: session!.user.id },
    orderBy: { createdAt: "desc" },
    take: 10,
  })

  // Fetch active credit packages from database
  const dbPackages = await prisma.creditPackage.findMany({
    where: { active: true },
    orderBy: { displayOrder: "asc" },
  })

  // Fetch current ADA/USD rate for display
  const adaUsdRate = await getAdaUsdRate()

  // Convert to the format expected by the component
  const creditPackages = dbPackages.length > 0
    ? dbPackages.map((pkg) => ({
        name: pkg.name,
        credits: pkg.credits,
        ada: Number(pkg.adaPrice).toString(),
        bonus: pkg.bonusPercent,
        popular: pkg.popular,
      }))
    : defaultCreditPackages

  const credits = session!.user.credits

  return (
    <div className="space-y-8">
      {/* Header */}
      <div>
        <h1 className="text-4xl font-bold mb-2">Billing & Credits</h1>
        <p className="text-text-secondary">
          Manage your credit balance and purchase history
        </p>
      </div>

      {/* Credit Balance */}
      <Card className="card-highlight">
        <CardContent className="p-8">
          <div className="flex items-center justify-between">
            <div className="space-y-2">
              <div className="text-sm text-text-muted">Your Credit Balance</div>
              <div className="text-6xl font-bold">{credits.toLocaleString()}</div>
              <div className="text-text-secondary">
                {credits > 0 ? (
                  <>{credits.toLocaleString()} API requests for PAID keys</>
                ) : (
                  <>Purchase credits to create PAID API keys</>
                )}
              </div>
            </div>
            <div className="text-right space-y-2">
              <CreditCard className="w-16 h-16 text-accent mx-auto" />
              <BuyCreditsButton />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* How Billing Works */}
      <Card className="border-accent/30 bg-accent/5">
        <CardContent className="p-6">
          <div className="flex gap-4">
            <Info className="w-6 h-6 text-accent flex-shrink-0 mt-0.5" />
            <div className="space-y-4">
              <h3 className="font-semibold text-text-primary text-lg">How Billing Works</h3>

              {/* Two-column layout for FREE vs PAID */}
              <div className="grid md:grid-cols-2 gap-6">
                {/* FREE Key */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Key className="w-5 h-5 text-success" />
                    <span className="font-semibold text-text-primary">Your Free API Key</span>
                    <Badge variant="free">Included</Badge>
                  </div>
                  <p className="text-sm text-text-muted">
                    Every account includes one free API key with generous limits:
                  </p>
                  <ul className="text-sm text-text-secondary space-y-1">
                    <li>• <strong>100 requests/second</strong></li>
                    <li>• <strong>100,000 requests/day</strong></li>
                    <li>• Full access to Ogmios & GraphQL</li>
                    <li>• Submit API: 10 transactions/hour</li>
                    <li>• 5 WebSocket connections</li>
                    <li>• 30 days data retention</li>
                  </ul>
                </div>

                {/* PAID Keys */}
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    <Zap className="w-5 h-5 text-accent" />
                    <span className="font-semibold text-text-primary">Paid API Keys</span>
                    <Badge variant="paid">Credits</Badge>
                  </div>
                  <p className="text-sm text-text-muted">
                    Purchase credits to create additional high-performance keys:
                  </p>
                  <ul className="text-sm text-text-secondary space-y-1">
                    <li>• <strong>500 requests/second</strong></li>
                    <li>• <strong>Unlimited daily requests</strong></li>
                    <li>• Full access to ALL APIs</li>
                    <li>• Submit API: Unlimited</li>
                    <li>• 50 WebSocket connections</li>
                    <li>• 90 days data retention</li>
                  </ul>
                </div>
              </div>

              {/* Credits Info */}
              <div className="pt-4 border-t border-border/50 space-y-2">
                <div className="flex items-center gap-2">
                  <Shield className="w-5 h-5 text-accent" />
                  <span className="font-semibold text-text-primary">About Credits</span>
                </div>
                <ul className="text-sm text-text-secondary space-y-1">
                  <li>• Credits are used only by <strong>PAID API keys</strong> (1 credit = 1 request)</li>
                  <li>• Your <strong>FREE key never consumes credits</strong></li>
                  <li>• Credits <strong>never expire</strong> - buy once, use anytime</li>
                  <li>• <strong>No subscriptions</strong> - simple pay-as-you-go with ADA</li>
                </ul>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Credit Packages */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Buy Credits with ADA</h2>
        <CreditPackages packages={creditPackages} adaUsdRate={adaUsdRate} />
      </div>

      {/* Payment History */}
      <div>
        <h2 className="text-2xl font-bold mb-6">Payment History</h2>
        {recentPayments.length === 0 ? (
          <Card>
            <CardContent className="p-12 text-center">
              <Clock className="w-12 h-12 mx-auto mb-4 text-text-muted" />
              <p className="text-text-secondary">No payments yet</p>
              <p className="text-text-muted text-sm mt-2">
                Purchase credits above to get started
              </p>
            </CardContent>
          </Card>
        ) : (
          <Card>
            <CardContent className="p-0">
              <table className="w-full">
                <thead className="border-b border-border">
                  <tr className="text-left">
                    <th className="p-4 text-text-muted font-medium">Date</th>
                    <th className="p-4 text-text-muted font-medium">Package</th>
                    <th className="p-4 text-text-muted font-medium">Amount</th>
                    <th className="p-4 text-text-muted font-medium">USD Value</th>
                    <th className="p-4 text-text-muted font-medium">Credits</th>
                    <th className="p-4 text-text-muted font-medium">Status</th>
                    <th className="p-4 text-text-muted font-medium">Transaction</th>
                  </tr>
                </thead>
                <tbody>
                  {recentPayments.map((payment) => (
                    <tr
                      key={payment.id}
                      className="border-b border-border/50 hover:bg-bg-tertiary/50"
                    >
                      <td className="p-4 text-sm">{formatDate(payment.createdAt)}</td>
                      <td className="p-4">{payment.packageName || "Custom"}</td>
                      <td className="p-4 font-mono">{formatADA(payment.amount)} ADA</td>
                      <td className="p-4 text-sm text-text-muted">
                        {payment.usdValue ? `$${Number(payment.usdValue).toFixed(2)}` : '-'}
                      </td>
                      <td className="p-4">{payment.credits.toLocaleString()}</td>
                      <td className="p-4">
                        <div className="flex flex-col gap-1">
                          <Badge
                            variant={
                              payment.status === "CONFIRMED"
                                ? "success"
                                : payment.status === "PENDING"
                                ? "warning"
                                : payment.status === "CONFIRMING"
                                ? "info"
                                : "error"
                            }
                          >
                            {payment.status}
                          </Badge>
                          {payment.status === "CONFIRMING" && (
                            <span className="text-xs text-info">
                              {payment.confirmations}/2 confirmations
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4">
                        {payment.status === "PENDING" ? (
                          <Link
                            href={`/billing/checkout?id=${payment.id}`}
                            className="text-accent hover:text-accent-hover text-sm font-medium"
                          >
                            Continue Payment →
                          </Link>
                        ) : payment.status === "CONFIRMING" ? (
                          <div className="flex flex-col gap-1">
                            <Link
                              href={`/billing/checkout?id=${payment.id}`}
                              className="text-accent hover:text-accent-hover text-sm"
                            >
                              View Progress
                            </Link>
                            {payment.txHash && (
                              <a
                                href={`https://cardanoscan.io/transaction/${payment.txHash}`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1 text-text-muted hover:text-text-secondary text-xs"
                              >
                                {payment.txHash.slice(0, 8)}...
                                <ExternalLink className="w-3 h-3" />
                              </a>
                            )}
                          </div>
                        ) : payment.txHash ? (
                          <a
                            href={`https://cardanoscan.io/transaction/${payment.txHash}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-accent hover:text-accent-hover text-sm"
                          >
                            {payment.txHash.slice(0, 8)}...
                            <ExternalLink className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-text-muted text-sm">-</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}

// Fallback packages if database is empty
// Competitive USD pricing - beats Blockfrost at all tiers, beats Koios at Enterprise
// At ~$0.38 ADA: Starter $2.85/1M, Standard $2.28/1M, Pro $1.90/1M, Enterprise $1.19/1M
const defaultCreditPackages = [
  { name: "Starter", credits: 400000, ada: "3", bonus: 0, popular: false },
  { name: "Standard", credits: 2000000, ada: "12", bonus: 0, popular: true },
  { name: "Pro", credits: 8000000, ada: "40", bonus: 0, popular: false },
  { name: "Enterprise", credits: 40000000, ada: "125", bonus: 0, popular: false },
]



