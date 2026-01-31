import type { Metadata } from "next"
import { Outfit } from "next/font/google"
import "@/styles/globals.css"
import "./pool.css"
import { PoolAnalytics } from "@/components/analytics"
import { AnalyticsProvider } from "@/components/analytics"

const outfit = Outfit({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-outfit",
})

export const metadata: Metadata = {
  title: "NACHO Stake Pool | Secure Cardano Staking in Alabama, USA",
  description:
    "NACHO Stake Pool delivers secure, reliable block production from independently operated infrastructure in the United States. 1.5% margin, 10,000 ADA pledge. Strengthening Cardano, one block at a time.",
  keywords: [
    "Cardano",
    "stake pool",
    "NACHO",
    "ADA staking",
    "cryptocurrency",
    "decentralization",
    "Alabama",
    "USA",
    "blockchain",
  ],
  authors: [{ name: "NACHO Stake Pool" }],
  icons: {
    icon: [
      { url: "/favicon.ico", sizes: "any" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    apple: "/favicon.png",
  },
  metadataBase: new URL("https://nacho.builders"),
  openGraph: {
    type: "website",
    title: "NACHO Stake Pool | Secure Cardano Staking",
    description:
      "Help decentralize Cardano with NACHO — independent infrastructure you can count on. 1.5% margin, 10,000 ADA pledge, self-hosted in Alabama, USA.",
    url: "https://nacho.builders",
    siteName: "NACHO Stake Pool",
    locale: "en_US",
    images: [
      {
        url: "/pool-og-image.png",
        width: 1200,
        height: 630,
        alt: "NACHO Stake Pool - Decentralized. Reliable. Independent.",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "NACHO Stake Pool | Secure Cardano Staking",
    description:
      "Help decentralize Cardano with NACHO — independent infrastructure you can count on. 1.5% margin, 10,000 ADA pledge.",
    images: ["/pool-og-image.png"],
  },
  robots: "index, follow",
  themeColor: "#0a1628",
  colorScheme: "dark",
}

export default function PoolLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className={`dark ${outfit.variable}`} suppressHydrationWarning>
      <head>
        <link rel="canonical" href="https://nacho.builders" />
        {/* Structured Data for SEO */}
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{
            __html: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Organization",
              name: "NACHO Stake Pool",
              description:
                "NACHO Stake Pool delivers secure, reliable block production from independently operated infrastructure in the United States.",
              url: "https://nacho.builders",
              areaServed: "Worldwide",
              knowsAbout: [
                "Cardano",
                "Cryptocurrency",
                "Blockchain",
                "Staking",
                "ADA",
              ],
            }),
          }}
        />
      </head>
      <body className={`${outfit.className} pool-page`} suppressHydrationWarning>
        <AnalyticsProvider site="pool">
          <PoolAnalytics />
          {children}
        </AnalyticsProvider>
      </body>
    </html>
  )
}
