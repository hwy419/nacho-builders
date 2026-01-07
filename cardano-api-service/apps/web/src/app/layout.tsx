import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "@/styles/globals.css";
import { Providers } from "@/components/providers";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Cardano API Service | Nacho Builders",
  description: "Fast, reliable Cardano blockchain APIs for developers. Ogmios, GraphQL, and Submit API with pay-as-you-go pricing.",
  keywords: ["cardano", "api", "blockchain", "ogmios", "graphql", "cryptocurrency"],
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



