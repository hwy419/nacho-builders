import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { getAdaUsdRate } from "@/lib/coingecko"
import { formatCredits } from "@/lib/utils"
import Link from "next/link"

export default async function LandingPage() {
  // Fetch current ADA/USD rate for display
  const adaUsdRate = await getAdaUsdRate()
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Navigation */}
      <nav className="fixed top-0 w-full z-50 bg-bg-primary/80 backdrop-blur-md border-b border-border">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 sm:py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="text-xl sm:text-2xl font-bold text-gradient">Nacho API</div>
            <span className="hidden sm:inline text-text-secondary">|</span>
            <span className="hidden sm:inline text-text-secondary">for Cardano</span>
          </div>
          <div className="flex items-center gap-3 sm:gap-6">
            <Link href="#features" className="hidden md:inline text-text-secondary hover:text-text-primary">Features</Link>
            <Link href="#pricing" className="hidden md:inline text-text-secondary hover:text-text-primary">Pricing</Link>
            <Link href="/docs" className="hidden sm:inline text-text-secondary hover:text-text-primary">Docs</Link>
            <Link href="/login" className="hidden sm:inline">
              <Button variant="secondary" size="sm">Login</Button>
            </Link>
            <Link href="/login">
              <Button size="sm">Get Started</Button>
            </Link>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="pt-24 sm:pt-32 pb-12 sm:pb-20 px-4 sm:px-6 relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-mesh opacity-50"></div>
        <div className="max-w-6xl mx-auto relative z-10">
          <div className="text-center space-y-6 sm:space-y-8">
            <Badge className="mb-4">Powered by Cardano</Badge>
            <h1 className="text-4xl sm:text-5xl md:text-6xl font-bold">
              <span className="text-gradient">Cardano APIs</span>
              <br />
              for Developers
            </h1>
            <p className="text-lg sm:text-xl text-text-secondary max-w-2xl mx-auto">
              Fast, reliable access to the Cardano blockchain. Build dApps without running nodes.
              <span className="block mt-2 text-accent">Mainnet & Preprod Testnet supported.</span>
            </p>
            <div className="flex items-center justify-center gap-4 pt-4">
              <Link href="/login">
                <Button size="lg" className="glow-accent">Start Free</Button>
              </Link>
              <Link href="/docs">
                <Button variant="secondary" size="lg">View Docs</Button>
              </Link>
            </div>

            {/* Code Terminal Preview */}
            <Card className="max-w-3xl mx-auto mt-8 sm:mt-12 card-highlight">
              <CardContent className="p-2 sm:p-6">
                <div className="bg-bg-primary rounded-lg p-2 sm:p-6 font-mono text-[10px] sm:text-sm">
                  <div className="text-text-muted mb-2 sm:mb-4">// Connect to Ogmios</div>
                  <div><span className="text-accent">const</span> client = <span className="text-info">new</span> <span className="text-warning">OgmiosClient</span>({"{"}</div>
                  <div className="pl-2 sm:pl-4 text-text-secondary">
                    url: <span className="text-success break-all">&quot;wss://api.nacho.builders/v1/ogmios&quot;</span>,
                  </div>
                  <div className="pl-2 sm:pl-4 text-text-secondary">
                    apiKey: process.env.<span className="text-warning">API_KEY</span>
                  </div>
                  {"}"});
                  <div className="mt-2 sm:mt-4 text-text-muted">// Query the chain</div>
                  <div><span className="text-accent">const</span> tip = <span className="text-accent">await</span> client.<span className="text-info">query</span>(<span className="text-success">&quot;queryNetwork/tip&quot;</span>);</div>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-12 sm:py-20 px-4 sm:px-6 bg-bg-secondary/50">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-8 sm:mb-12">Why Choose Nacho APIs?</h2>

          <div className="grid sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-8">
            {features.map((feature, index) => (
              <Card key={index} className="card-hover">
                <CardContent className="p-6 space-y-4">
                  <div className="text-4xl">{feature.icon}</div>
                  <h3 className="text-xl font-semibold">{feature.title}</h3>
                  <p className="text-text-secondary">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-12 sm:py-20 px-4 sm:px-6">
        <div className="max-w-6xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-bold text-center mb-4">Simple, Transparent Pricing</h2>
          <p className="text-text-secondary text-center mb-8 sm:mb-12">Start free, scale with pay-as-you-go credits</p>

          <div className="grid md:grid-cols-2 gap-6 sm:gap-8 max-w-4xl mx-auto">
            {/* Free Tier */}
            <Card className="card-hover">
              <CardContent className="p-5 sm:p-8 space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold">Free API Key</h3>
                  <p className="text-text-secondary text-sm sm:text-base">Included with every account</p>
                </div>
                <div>
                  <div className="text-3xl sm:text-4xl font-bold">100k</div>
                  <div className="text-text-secondary">requests/day</div>
                </div>
                <ul className="space-y-3">
                  {freeFeatures.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-success">✓</span>
                      <span className="text-text-secondary">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/login" className="block">
                  <Button variant="secondary" className="w-full">Start Free</Button>
                </Link>
              </CardContent>
            </Card>

            {/* Paid Tier */}
            <Card className="card-highlight border-2 border-accent/30 relative">
              <div className="absolute -top-4 left-1/2 -translate-x-1/2">
                <Badge variant="paid">Popular</Badge>
              </div>
              <CardContent className="p-5 sm:p-8 space-y-4 sm:space-y-6">
                <div>
                  <h3 className="text-xl sm:text-2xl font-bold">Paid API Keys</h3>
                  <p className="text-text-secondary text-sm sm:text-base">Pay as you go with ADA</p>
                </div>
                <div>
                  <div className="text-3xl sm:text-4xl font-bold">From 2 ADA</div>
                  {adaUsdRate && (
                    <div className="text-text-muted text-sm">≈ ${(2 * adaUsdRate).toFixed(2)} USD</div>
                  )}
                  <div className="text-text-secondary">Credits never expire</div>
                </div>
                <ul className="space-y-3">
                  {paidFeatures.map((feature, i) => (
                    <li key={i} className="flex items-center gap-2">
                      <span className="text-accent">✓</span>
                      <span className="text-text-primary">{feature}</span>
                    </li>
                  ))}
                </ul>
                <Link href="/login" className="block">
                  <Button className="w-full">Buy Credits</Button>
                </Link>
              </CardContent>
            </Card>
          </div>

          {/* Credit Packages */}
          <div className="mt-12 sm:mt-16">
            <h3 className="text-2xl font-bold text-center mb-6 sm:mb-8">Credit Packages</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 max-w-4xl mx-auto">
              {creditPackages.map((pkg, i) => (
                <Card key={i} className={pkg.popular ? "card-highlight" : ""}>
                  <CardContent className="p-4 sm:p-6 text-center space-y-2">
                    <div className="text-xl sm:text-2xl font-bold">{pkg.name}</div>
                    <div className="text-2xl sm:text-3xl font-bold text-accent">{pkg.ada} ADA</div>
                    {adaUsdRate && (
                      <div className="text-sm text-text-muted">≈ ${(pkg.ada * adaUsdRate).toFixed(2)} USD</div>
                    )}
                    <div className="text-text-secondary">
                      {formatCredits(pkg.credits)} credits
                    </div>
                    {pkg.bonus > 0 && (
                      <Badge variant="success">+{pkg.bonus}% bonus</Badge>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 sm:py-12 px-4 sm:px-6 border-t border-border">
        <div className="max-w-6xl mx-auto">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4 sm:gap-8 mb-6">
            <Link href="/docs" className="text-text-secondary hover:text-text-primary transition-colors">
              Documentation
            </Link>
            <a
              href="https://nacho.builders"
              target="_blank"
              rel="noopener noreferrer"
              className="text-text-secondary hover:text-text-primary transition-colors"
            >
              Nacho STAKE
            </a>
            <Link href="/login" className="text-text-secondary hover:text-text-primary transition-colors">
              Dashboard
            </Link>
          </div>
          <p className="text-center text-text-muted text-sm sm:text-base">
            &copy; {new Date().getFullYear()} Nacho Builders. Cardano APIs for developers.
          </p>
        </div>
      </footer>
    </div>
  )
}

const features = [
  {
    icon: "⚡",
    title: "Instant Ogmios Access",
    description: "WebSocket connection to Cardano nodes for real-time chain queries and transaction submission"
  },
  {
    icon: "🔮",
    title: "GraphQL API",
    description: "Flexible queries for blocks, transactions, UTxOs, and stake pools with powerful filtering"
  },
  {
    icon: "🧪",
    title: "Mainnet & Preprod Testnet",
    description: "Same API key works on both networks. Build and test on Preprod, deploy to Mainnet seamlessly"
  },
  {
    icon: "💳",
    title: "Transaction Submit API",
    description: "Simple REST endpoint for submitting signed transactions to the blockchain"
  },
  {
    icon: "🔒",
    title: "Enterprise Security",
    description: "API keys, rate limiting, and secure infrastructure with 99.9% uptime SLA"
  },
  {
    icon: "📈",
    title: "Real-time Analytics",
    description: "Comprehensive dashboard with usage metrics, request logs, and performance data"
  }
]

const freeFeatures = [
  "100 requests/second",
  "100,000 requests/day",
  "5 WebSocket connections",
  "30 days data retention",
  "Mainnet & Preprod Testnet",
  "Ogmios & Submit API",
  "No credits required"
]

const paidFeatures = [
  "500 requests/second",
  "Unlimited daily requests",
  "50 WebSocket connections",
  "90 days data retention",
  "Mainnet & Preprod Testnet",
  "All endpoints (Ogmios, Submit)",
  "1 credit = 1 request",
  "Credits never expire"
]

// Competitive USD pricing - beats Blockfrost at all tiers, beats Koios at Enterprise
const creditPackages = [
  { name: "Starter", credits: 400000, ada: 3, bonus: 0, popular: false },
  { name: "Standard", credits: 2000000, ada: 12, bonus: 0, popular: true },
  { name: "Pro", credits: 8000000, ada: 40, bonus: 0, popular: false },
  { name: "Enterprise", credits: 40000000, ada: 125, bonus: 0, popular: false },
]






