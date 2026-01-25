"use client"

import { useState } from "react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { cn } from "@/lib/utils"
import { ChevronRight, BookOpen, ExternalLink } from "lucide-react"
import { docsNavigation, NavItem, NavSection } from "@/lib/docs/navigation"

interface DocsSidebarProps {
  className?: string
}

export function DocsSidebar({ className }: DocsSidebarProps) {
  const pathname = usePathname()

  return (
    <aside className={cn("w-64 flex-shrink-0", className)}>
      <div className="sticky top-0 h-screen overflow-y-auto py-8 pr-4">
        {/* Logo/Home Link */}
        <Link href="/docs" className="flex items-center gap-2 mb-8 px-4">
          <BookOpen className="h-5 w-5 text-accent" />
          <span className="font-semibold text-text-primary">Documentation</span>
        </Link>

        {/* Navigation */}
        <nav className="space-y-6">
          {docsNavigation.map((section) => (
            <NavSectionComponent
              key={section.title}
              section={section}
              pathname={pathname}
            />
          ))}
        </nav>

        {/* Back to App */}
        <div className="mt-8 pt-6 border-t border-border px-4 space-y-3">
          <Link
            href="/dashboard"
            className="block text-sm text-text-secondary hover:text-text-primary transition-colors"
          >
            &larr; Back to Dashboard
          </Link>
          <a
            href="https://nacho.builders"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-sm text-text-muted hover:text-text-primary transition-colors"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            <span>Nacho STAKE</span>
          </a>
        </div>
      </div>
    </aside>
  )
}

function NavSectionComponent({
  section,
  pathname,
}: {
  section: NavSection
  pathname: string | null
}) {
  return (
    <div>
      <h3 className="px-4 mb-2 text-xs font-semibold uppercase tracking-wider text-text-muted">
        {section.title}
      </h3>
      <ul className="space-y-1">
        {section.items.map((item) => (
          <NavItemComponent
            key={item.title}
            item={item}
            pathname={pathname}
            depth={0}
          />
        ))}
      </ul>
    </div>
  )
}

function NavItemComponent({
  item,
  pathname,
  depth,
}: {
  item: NavItem
  pathname: string | null
  depth: number
}) {
  const [isOpen, setIsOpen] = useState(() => {
    // Auto-expand if current page is in this section
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
  const isChildActive = hasChildren && item.items?.some(
    (child) => child.href === pathname ||
    child.items?.some((grandchild) => grandchild.href === pathname)
  )

  if (hasChildren) {
    return (
      <li>
        <button
          onClick={() => setIsOpen(!isOpen)}
          className={cn(
            "w-full flex items-center justify-between px-4 py-2 text-sm rounded-lg transition-colors",
            isChildActive
              ? "text-text-primary"
              : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
          )}
          style={{ paddingLeft: `${1 + depth * 0.75}rem` }}
        >
          <span>{item.title}</span>
          <ChevronRight
            className={cn(
              "h-4 w-4 transition-transform",
              isOpen && "rotate-90"
            )}
          />
        </button>
        {isOpen && (
          <ul className="mt-1 space-y-1">
            {item.items?.map((child) => (
              <NavItemComponent
                key={child.title}
                item={child}
                pathname={pathname}
                depth={depth + 1}
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
        className={cn(
          "block px-4 py-2 text-sm rounded-lg transition-colors",
          isActive
            ? "bg-accent/10 text-accent border-l-2 border-accent"
            : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary"
        )}
        style={{ paddingLeft: `${1 + depth * 0.75}rem` }}
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
