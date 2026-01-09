import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cardano API Service | Nacho Builders",
  description: "Fast, reliable Cardano blockchain APIs for developers. Ogmios, GraphQL, and Submit API with pay-as-you-go pricing.",
  keywords: ["cardano", "api", "blockchain", "ogmios", "graphql", "cryptocurrency"],
  icons: {
    icon: "/favicon.png",
    shortcut: "/favicon.png",
    apple: "/favicon.png",
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
    <html lang="en" className="dark">
      <body className={inter.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}




