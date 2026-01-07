"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { Menu, X, ChevronRight, BookOpen } from "lucide-react"
import { docsNavigation, NavItem, NavSection } from "@/lib/docs/navigation"
import { Button } from "@/components/ui/button"

export function DocsMobileNav() {
  const [isOpen, setIsOpen] = useState(false)
  const pathname = usePathname()

  return (
    <div className="lg:hidden">
      {/* Mobile Header */}
      <div className="sticky top-0 z-40 flex items-center justify-between px-4 py-3 bg-bg-primary/95 backdrop-blur border-b border-border">
        <Link href="/docs" className="flex items-center gap-2">
          <BookOpen className="h-5 w-5 text-accent" />
          <span className="font-semibold text-text-primary">Docs</span>
        </Link>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setIsOpen(!isOpen)}
          aria-label="Toggle navigation"
        >
          {isOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </Button>
      </div>

      {/* Mobile Navigation Drawer */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div
            className="fixed inset-0 z-30 bg-black/50"
            onClick={() => setIsOpen(false)}
          />

          {/* Drawer */}
          <div className="fixed top-0 left-0 z-40 h-full w-72 bg-bg-primary border-r border-border overflow-y-auto">
            <div className="p-4">
              {/* Header */}
              <div className="flex items-center justify-between mb-6">
                <Link
                  href="/docs"
                  className="flex items-center gap-2"
                  onClick={() => setIsOpen(false)}
                >
                  <BookOpen className="h-5 w-5 text-accent" />
                  <span className="font-semibold text-text-primary">Documentation</span>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setIsOpen(false)}
                >
                  <X className="h-5 w-5" />
                </Button>
              </div>

              {/* Navigation */}
              <nav className="space-y-6">
                {docsNavigation.map((section) => (
                  <MobileNavSection
                    key={section.title}
                    section={section}
                    pathname={pathname}
                    onNavigate={() => setIsOpen(false)}
                  />
                ))}
              </nav>

              {/* Back Links */}
              <div className="mt-8 pt-6 border-t border-border space-y-2">
                <Link
                  href="/"
                  className="block text-sm text-text-secondary hover:text-text-primary"
                  onClick={() => setIsOpen(false)}
                >
                  &larr; Back to Home
                </Link>
                <Link
                  href="/dashboard"
                  className="block text-sm text-text-secondary hover:text-text-primary"
                  onClick={() => setIsOpen(false)}
                >
                  &larr; Back to Dashboard
                </Link>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}

function MobileNavSection({
  section,
  pathname,
  onNavigate,
}: {
  section: NavSection
  pathname: string | null
  onNavigate: () => void
}) {
  return (
    <div>
      <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {section.title}
      </h3>
      <ul className="space-y-1">
        {section.items.map((item) => (
          <MobileNavItem
            key={item.title}
            item={item}
            pathname={pathname}
            depth={0}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </div>
  )
}

function MobileNavItem({
  item,
  pathname,
  depth,
  onNavigate,
}: {
  item: NavItem
  pathname: string | null
  depth: number
  onNavigate: () => void
}) {
  const [isExpanded, setIsExpanded] = useState(() => {
    if (item.items && pathname) {
      return item.items.some((child) =>
        child.href === pathname ||
        (child.items?.some((grandchild) => grandchild.href === pathname))
      )
    }
    return false
  })

  const hasChildren = item.items && item.items.length > 0
  const isActive = item.href === pathname

  if (hasChildren) {
    return (
      <li>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            "w-full flex items-center justify-between py-2 text-sm rounded-lg transition-colors",
            "text-text-secondary hover:text-text-primary"
          )}
          style={{ paddingLeft: `${depth * 0.75}rem` }}
        >
          <span>{item.title}</span>
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform",
              isExpanded && "rotate-90"
            )}
          />
        </button>
        {isExpanded && (
          <ul className="mt-1 space-y-1">
            {item.items?.map((child) => (
              <MobileNavItem
                key={child.title}
                item={child}
                pathname={pathname}
                depth={depth + 1}
                onNavigate={onNavigate}
              />
            ))}
          </ul>
        )}
      </li>
    )
  }

  return (
    <li>
      <Link
        href={item.href || '#'}
        onClick={onNavigate}
        className={cn(
          "block py-2 text-sm rounded-lg transition-colors",
          isActive
            ? "text-accent font-medium"
            : "text-text-secondary hover:text-text-primary"
        )}
        style={{ paddingLeft: `${depth * 0.75}rem` }}
      >
        <span className="flex items-center gap-2">
          {item.title}
          {item.isNew && (
            <span className="text-xs bg-accent/20 text-accent px-1.5 py-0.5 rounded">
              New
            </span>
          )}
        </span>
      </Link>
    </li>
  )
}
