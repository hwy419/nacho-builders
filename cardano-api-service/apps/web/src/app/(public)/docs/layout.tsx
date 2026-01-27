import { DocsSidebar } from "@/components/docs/docs-sidebar"
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav"
import { DocsProvider } from "@/lib/docs/context"

export const metadata = {
  title: {
    template: "%s | Nacho API Docs",
    default: "Nacho API Documentation",
  },
  description: "Documentation for Nacho Cardano API - Ogmios WebSocket, Submit API, and more.",
  openGraph: {
    title: "Nacho API Documentation",
    description: "Documentation for Nacho Cardano API - Ogmios WebSocket, Submit API, and more.",
    url: "https://app.nacho.builders/docs",
    siteName: "Nacho Builders",
    images: [
      {
        url: "https://app.nacho.builders/og-image.png",
        width: 1200,
        height: 630,
        alt: "Nacho Builders - Cardano API Documentation",
      },
    ],
  },
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <DocsProvider>
      <div className="min-h-screen bg-bg-primary">
        {/* Mobile Navigation */}
        <DocsMobileNav />

        {/* Three-column layout (Stripe-style) */}
        <div className="flex justify-center">
          {/* Left Sidebar - Navigation (256px) */}
          <DocsSidebar className="hidden lg:block border-r border-border flex-shrink-0" />

          {/* Main Content Area - flexible width */}
          <main className="flex-1 min-w-0 max-w-4xl">
            <div className="px-4 sm:px-6 py-6 lg:px-8 lg:py-8">
              <article className="prose prose-invert max-w-none">
                {children}
              </article>
            </div>
          </main>

          {/* Right Sidebar - Table of Contents (hidden on smaller screens) */}
          {/* This is rendered inside DocsPageContent to have access to headings */}
        </div>
      </div>
    </DocsProvider>
  )
}
