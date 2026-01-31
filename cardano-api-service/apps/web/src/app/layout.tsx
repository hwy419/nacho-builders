import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";
import { GoogleAnalytics } from "@/components/analytics";
import { AnalyticsProvider } from "@/components/analytics";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cardano API Service | Nacho Builders",
  description: "Fast, reliable Cardano blockchain APIs for developers. Ogmios, GraphQL, and Submit API with pay-as-you-go pricing.",
  keywords: ["cardano", "api", "blockchain", "ogmios", "graphql", "cryptocurrency"],
  icons: {
    icon: [
      { url: "/app-favicon.ico", sizes: "any" },
      { url: "/app-favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/app-favicon-32x32.png", sizes: "32x32", type: "image/png" },
    ],
    shortcut: "/app-favicon.ico",
    apple: "/app-apple-touch-icon.png",
  },
  openGraph: {
    title: "Cardano APIs for Developers | Nacho Builders",
    description: "Fast, reliable access to the Cardano blockchain. Build dApps without running nodes. Mainnet & Preprod Testnet supported.",
    url: "https://app.nacho.builders",
    siteName: "Nacho Builders",
    images: [
      {
        url: "https://app.nacho.builders/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nacho Builders - Cardano APIs for Developers",
      },
    ],
    locale: "en_US",
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Cardano APIs for Developers | Nacho Builders",
    description: "Fast, reliable access to the Cardano blockchain. Build dApps without running nodes.",
    images: ["https://app.nacho.builders/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <Providers>
          <AnalyticsProvider site="dashboard">
            <GoogleAnalytics />
            {children}
          </AnalyticsProvider>
        </Providers>
      </body>
    </html>
  );
}




