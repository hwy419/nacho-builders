import { DocsSidebar } from "@/components/docs/docs-sidebar"
import { DocsMobileNav } from "@/components/docs/docs-mobile-nav"

export const metadata = {
  title: {
    template: "%s | Nacho API Docs",
    default: "Nacho API Documentation",
  },
  description: "Documentation for Nacho Cardano API",
}

export default function DocsLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="min-h-screen bg-bg-primary">
      {/* Mobile Navigation */}
      <DocsMobileNav />

      <div className="flex max-w-7xl mx-auto">
        {/* Desktop Sidebar */}
        <DocsSidebar className="hidden lg:block border-r border-border" />

        {/* Main Content */}
        <main className="flex-1 min-w-0 px-4 sm:px-6 py-6 lg:px-12 lg:py-8">
          <article className="prose prose-invert max-w-none">
            {children}
          </article>
        </main>
      </div>
    </div>
  )
}
