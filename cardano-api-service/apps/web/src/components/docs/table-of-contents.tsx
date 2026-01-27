"use client"

import { useEffect, useState } from "react"
import { cn } from "@/lib/utils"
import { List } from "lucide-react"

interface TocItem {
  id: string
  title: string
  level: number
}

interface TableOfContentsProps {
  className?: string
}

export function TableOfContents({ className }: TableOfContentsProps) {
  const [headings, setHeadings] = useState<TocItem[]>([])
  const [activeId, setActiveId] = useState<string>("")

  // Extract headings from the page
  useEffect(() => {
    const article = document.querySelector("article")
    if (!article) return

    const elements = article.querySelectorAll("h2, h3")
    const items: TocItem[] = Array.from(elements)
      .filter((el) => el.id) // Only include headings with IDs
      .map((el) => ({
        id: el.id,
        title: el.textContent || "",
        level: parseInt(el.tagName.charAt(1)),
      }))

    setHeadings(items)
  }, [])

  // Track active heading on scroll
  useEffect(() => {
    if (headings.length === 0) return

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the first heading that is intersecting
        const visibleEntries = entries.filter((entry) => entry.isIntersecting)
        if (visibleEntries.length > 0) {
          setActiveId(visibleEntries[0].target.id)
        }
      },
      {
        rootMargin: "-80px 0px -80% 0px",
        threshold: 0,
      }
    )

    headings.forEach((heading) => {
      const element = document.getElementById(heading.id)
      if (element) observer.observe(element)
    })

    return () => observer.disconnect()
  }, [headings])

  if (headings.length < 2) {
    return null // Don't show TOC for short pages
  }

  return (
    <nav className={cn("space-y-2", className)}>
      <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary mb-4">
        <List className="h-4 w-4" />
        On this page
      </h4>
      <ul className="space-y-2 text-sm">
        {headings.map((heading) => (
          <li
            key={heading.id}
            style={{ paddingLeft: `${(heading.level - 2) * 0.75}rem` }}
          >
            <a
              href={`#${heading.id}`}
              onClick={(e) => {
                e.preventDefault()
                const element = document.getElementById(heading.id)
                if (element) {
                  element.scrollIntoView({ behavior: "smooth" })
                  // Update URL without scrolling
                  window.history.pushState(null, "", `#${heading.id}`)
                  setActiveId(heading.id)
                }
              }}
              className={cn(
                "block py-1 transition-colors border-l-2 pl-3 -ml-px",
                activeId === heading.id
                  ? "border-accent text-accent"
                  : "border-transparent text-text-muted hover:text-text-secondary hover:border-border"
              )}
            >
              {heading.title}
            </a>
          </li>
        ))}
      </ul>
    </nav>
  )
}

// Floating TOC for mobile (shows/hides based on scroll)
export function FloatingTableOfContents() {
  const [isOpen, setIsOpen] = useState(false)
  const [headings, setHeadings] = useState<TocItem[]>([])

  useEffect(() => {
    const article = document.querySelector("article")
    if (!article) return

    const elements = article.querySelectorAll("h2, h3")
    const items: TocItem[] = Array.from(elements)
      .filter((el) => el.id)
      .map((el) => ({
        id: el.id,
        title: el.textContent || "",
        level: parseInt(el.tagName.charAt(1)),
      }))

    setHeadings(items)
  }, [])

  if (headings.length < 2) return null

  return (
    <>
      {/* Floating button */}
      <button
        onClick={() => setIsOpen(true)}
        className="fixed bottom-20 right-4 lg:hidden z-40 p-3 rounded-full bg-accent text-white shadow-lg"
        aria-label="Table of contents"
      >
        <List className="h-5 w-5" />
      </button>

      {/* Drawer */}
      {isOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-40 lg:hidden"
            onClick={() => setIsOpen(false)}
          />
          <div className="fixed bottom-0 inset-x-0 bg-bg-primary border-t border-border rounded-t-xl z-50 lg:hidden max-h-[60vh] overflow-y-auto p-6">
            <div className="flex items-center justify-between mb-4">
              <h4 className="flex items-center gap-2 text-sm font-semibold text-text-primary">
                <List className="h-4 w-4" />
                On this page
              </h4>
              <button
                onClick={() => setIsOpen(false)}
                className="text-text-muted hover:text-text-primary"
              >
                Close
              </button>
            </div>
            <ul className="space-y-2 text-sm">
              {headings.map((heading) => (
                <li
                  key={heading.id}
                  style={{ paddingLeft: `${(heading.level - 2) * 0.75}rem` }}
                >
                  <a
                    href={`#${heading.id}`}
                    onClick={(e) => {
                      e.preventDefault()
                      const element = document.getElementById(heading.id)
                      if (element) {
                        setIsOpen(false)
                        setTimeout(() => {
                          element.scrollIntoView({ behavior: "smooth" })
                        }, 100)
                      }
                    }}
                    className="block py-2 text-text-secondary hover:text-text-primary"
                  >
                    {heading.title}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </>
  )
}
